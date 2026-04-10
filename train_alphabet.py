from __future__ import annotations

import argparse
from contextlib import nullcontext
from pathlib import Path
from typing import Any

import torch
from sklearn.metrics import classification_report
from torch import nn
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from torch.utils.data import DataLoader
from tqdm import tqdm

from signlang.alphabet_data import AlphabetImageDataset, ImageRecord, class_names, gather_image_records, split_records
from signlang.alphabet_model import AlphabetRecognizer
from signlang.utils import count_trainable_parameters, ensure_dir, resolve_device, seed_everything, write_json


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train an alphabet sign recognizer.")
    parser.add_argument("--data-dir", default="data/alphabet_frames")
    parser.add_argument("--artifact-dir", default="artifacts/alphabet_frames_v1")
    parser.add_argument("--classes", nargs="*", default=None)
    parser.add_argument("--max-images-per-class", type=int, default=None)
    parser.add_argument("--epochs", type=int, default=18)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=2e-4)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--image-size", type=int, default=224)
    parser.add_argument("--dropout", type=float, default=0.25)
    parser.add_argument("--trainable-backbone-blocks", type=int, default=2)
    parser.add_argument("--val-ratio", type=float, default=0.15)
    parser.add_argument("--test-ratio", type=float, default=0.15)
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--patience", type=int, default=5)
    parser.add_argument("--device", default=None)
    parser.add_argument("--no-pretrained", action="store_true")
    parser.add_argument("--resume", default=None)
    parser.add_argument("--init-checkpoint", default=None)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.resume and args.init_checkpoint:
        raise ValueError("Use either --resume or --init-checkpoint, not both")

    seed_everything(args.seed)
    artifact_dir = ensure_dir(args.artifact_dir)
    device = resolve_device(args.device)

    records = gather_image_records(
        root=args.data_dir,
        classes=args.classes,
        max_per_class=args.max_images_per_class,
    )
    train_records, val_records, test_records = split_records(
        records=records,
        val_ratio=args.val_ratio,
        test_ratio=args.test_ratio,
        seed=args.seed,
    )

    labels = class_names(records)
    class_to_idx = {label: index for index, label in enumerate(labels)}

    train_dataset = AlphabetImageDataset(train_records, class_to_idx, args.image_size, training=True)
    val_dataset = AlphabetImageDataset(val_records, class_to_idx, args.image_size, training=False)
    test_dataset = AlphabetImageDataset(test_records, class_to_idx, args.image_size, training=False)

    pin_memory = device.type == "cuda"
    train_loader = DataLoader(
        train_dataset,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=args.workers,
        pin_memory=pin_memory,
        persistent_workers=args.workers > 0,
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.workers,
        pin_memory=pin_memory,
        persistent_workers=args.workers > 0,
    )
    test_loader = DataLoader(
        test_dataset,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.workers,
        pin_memory=pin_memory,
        persistent_workers=args.workers > 0,
    )

    model = AlphabetRecognizer(
        num_classes=len(labels),
        dropout=args.dropout,
        pretrained=not args.no_pretrained,
    )
    model.set_trainable_backbone_blocks(args.trainable_backbone_blocks)
    model.to(device)

    criterion = nn.CrossEntropyLoss(label_smoothing=0.05)
    optimizer = AdamW(
        (parameter for parameter in model.parameters() if parameter.requires_grad),
        lr=args.lr,
        weight_decay=args.weight_decay,
    )
    scheduler = CosineAnnealingLR(optimizer, T_max=max(1, args.epochs))
    scaler = torch.amp.GradScaler("cuda", enabled=device.type == "cuda")
    start_epoch = 1

    print(
        f"Training on {device} with {len(train_dataset)} train / {len(val_dataset)} val / "
        f"{len(test_dataset)} test images across {len(labels)} classes"
    )
    print(f"Trainable parameters: {count_trainable_parameters(model):,}")

    best_val_accuracy = -1.0
    best_checkpoint_path = artifact_dir / "best.pt"
    history: list[dict[str, Any]] = []
    stale_epochs = 0

    if args.init_checkpoint:
        checkpoint = torch.load(args.init_checkpoint, map_location=device)
        if checkpoint["labels"] != labels:
            raise ValueError("Checkpoint labels do not match the current dataset labels")
        model.load_state_dict(checkpoint["model_state"])
        print(f"Initialized model weights from {args.init_checkpoint}")

    if args.resume:
        checkpoint = torch.load(args.resume, map_location=device)
        if checkpoint["labels"] != labels:
            raise ValueError("Checkpoint labels do not match the current dataset labels")
        model.load_state_dict(checkpoint["model_state"])
        if "optimizer_state" in checkpoint:
            optimizer.load_state_dict(checkpoint["optimizer_state"])
        if "scheduler_state" in checkpoint:
            scheduler.load_state_dict(checkpoint["scheduler_state"])
        if "scaler_state" in checkpoint and device.type == "cuda":
            scaler.load_state_dict(checkpoint["scaler_state"])
        history = list(checkpoint.get("history", []))
        best_val_accuracy = float(checkpoint.get("best_val_accuracy", -1.0))
        start_epoch = int(checkpoint.get("epoch", 0)) + 1
        print(f"Resuming from {args.resume} at epoch {start_epoch}")

    for epoch in range(start_epoch, args.epochs + 1):
        train_metrics = run_epoch(
            model=model,
            loader=train_loader,
            criterion=criterion,
            optimizer=optimizer,
            scaler=scaler,
            device=device,
            train=True,
            description=f"Epoch {epoch}/{args.epochs} [train]",
        )
        val_metrics = run_epoch(
            model=model,
            loader=val_loader,
            criterion=criterion,
            optimizer=None,
            scaler=None,
            device=device,
            train=False,
            description=f"Epoch {epoch}/{args.epochs} [val]",
        )
        scheduler.step()

        epoch_metrics = {
            "epoch": epoch,
            "train_loss": train_metrics["loss"],
            "train_accuracy": train_metrics["accuracy"],
            "val_loss": val_metrics["loss"],
            "val_accuracy": val_metrics["accuracy"],
            "lr": scheduler.get_last_lr()[0],
        }
        history.append(epoch_metrics)
        print(epoch_metrics)

        improved = val_metrics["accuracy"] >= best_val_accuracy
        if improved:
            best_val_accuracy = val_metrics["accuracy"]
            stale_epochs = 0
            save_checkpoint(
                path=best_checkpoint_path,
                model=model,
                optimizer=optimizer,
                scheduler=scheduler,
                scaler=scaler,
                labels=labels,
                args=args,
                history=history,
                best_val_accuracy=best_val_accuracy,
                epoch=epoch,
                split_records_map={
                    "train": train_records,
                    "val": val_records,
                    "test": test_records,
                },
            )
        else:
            stale_epochs += 1
            if stale_epochs >= args.patience:
                print(f"Early stopping after {epoch} epochs")
                break

    checkpoint = torch.load(best_checkpoint_path, map_location=device)
    model.load_state_dict(checkpoint["model_state"])
    model.to(device)

    test_metrics = run_epoch(
        model=model,
        loader=test_loader,
        criterion=criterion,
        optimizer=None,
        scaler=None,
        device=device,
        train=False,
        description="Testing",
    )
    report = classification_report(
        test_metrics["targets"],
        test_metrics["predictions"],
        labels=list(range(len(labels))),
        target_names=labels,
        zero_division=0,
    )
    (artifact_dir / "classification_report.txt").write_text(report, encoding="utf-8")
    write_json(
        artifact_dir / "metrics.json",
        {
            "history": history,
            "best_val_accuracy": best_val_accuracy,
            "test_loss": test_metrics["loss"],
            "test_accuracy": test_metrics["accuracy"],
            "labels": labels,
        },
    )
    print(report)
    print(f"Saved best checkpoint to {best_checkpoint_path}")


def run_epoch(
    model: AlphabetRecognizer,
    loader: DataLoader,
    criterion: nn.Module,
    optimizer: AdamW | None,
    scaler: torch.amp.GradScaler | None,
    device: torch.device,
    train: bool,
    description: str,
) -> dict[str, Any]:
    if train:
        model.train()
    else:
        model.eval()

    running_loss = 0.0
    correct = 0
    total = 0
    all_predictions: list[int] = []
    all_targets: list[int] = []

    progress = tqdm(loader, desc=description, leave=False)
    for images, targets, _paths in progress:
        images = images.to(device, non_blocking=True)
        targets = targets.to(device, non_blocking=True)

        if train:
            assert optimizer is not None
            optimizer.zero_grad(set_to_none=True)

        with (torch.autocast(device_type="cuda", dtype=torch.float16) if device.type == "cuda" else nullcontext()):
            logits = model(images)
            loss = criterion(logits, targets)

        if train:
            assert optimizer is not None
            assert scaler is not None
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()

        predictions = logits.argmax(dim=1)
        batch_size = targets.size(0)
        running_loss += loss.item() * batch_size
        total += batch_size
        correct += int((predictions == targets).sum().item())
        all_predictions.extend(predictions.detach().cpu().tolist())
        all_targets.extend(targets.detach().cpu().tolist())

        progress.set_postfix(loss=running_loss / max(total, 1), acc=correct / max(total, 1))

    return {
        "loss": running_loss / max(total, 1),
        "accuracy": correct / max(total, 1),
        "predictions": all_predictions,
        "targets": all_targets,
    }


def save_checkpoint(
    path: Path,
    model: AlphabetRecognizer,
    optimizer: AdamW,
    scheduler: CosineAnnealingLR,
    scaler: torch.amp.GradScaler,
    labels: list[str],
    args: argparse.Namespace,
    history: list[dict[str, Any]],
    best_val_accuracy: float,
    epoch: int,
    split_records_map: dict[str, list[ImageRecord]],
) -> None:
    checkpoint = {
        "epoch": epoch,
        "model_state": model.state_dict(),
        "optimizer_state": optimizer.state_dict(),
        "scheduler_state": scheduler.state_dict(),
        "scaler_state": scaler.state_dict(),
        "labels": labels,
        "history": history,
        "best_val_accuracy": best_val_accuracy,
        "model_config": {
            "image_size": args.image_size,
            "dropout": args.dropout,
            "seed": args.seed,
            "val_ratio": args.val_ratio,
            "test_ratio": args.test_ratio,
        },
        "splits": {
            split_name: [{"path": str(record.path), "label": record.label} for record in split_records]
            for split_name, split_records in split_records_map.items()
        },
    }
    torch.save(checkpoint, path)


if __name__ == "__main__":
    main()
