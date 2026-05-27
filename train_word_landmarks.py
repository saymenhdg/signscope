from __future__ import annotations

import argparse
from collections import Counter
from contextlib import nullcontext
from pathlib import Path
from typing import Any

import numpy as np
import torch
from sklearn.metrics import classification_report
from torch import nn
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from torch.utils.data import DataLoader, WeightedRandomSampler
from tqdm import tqdm

from signlang.utils import count_trainable_parameters, ensure_dir, resolve_device, seed_everything, write_json
from signlang.word_landmark_data import (
    WordLandmarkDataset,
    WordLandmarkRecord,
    load_word_records,
    split_word_records,
    word_class_names,
    word_feature_dim,
)
from signlang.word_landmark_model import WordLandmarkRecognizer


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train a word-level sign recognizer from holistic landmarks.")
    parser.add_argument("--data-path", default="data/word_landmarks_v1/records.json")
    parser.add_argument("--artifact-dir", default="artifacts/word_landmarks_v1")
    parser.add_argument("--classes", nargs="*", default=None)
    parser.add_argument("--max-samples-per-class", type=int, default=None)
    parser.add_argument("--sequence-length", type=int, default=32)
    parser.add_argument("--epochs", type=int, default=80)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--hidden-dim", type=int, default=256)
    parser.add_argument("--num-layers", type=int, default=2)
    parser.add_argument("--dropout", type=float, default=0.3)
    parser.add_argument("--attention-dim", type=int, default=128)
    parser.add_argument("--val-ratio", type=float, default=0.15)
    parser.add_argument("--test-ratio", type=float, default=0.15)
    parser.add_argument("--workers", type=int, default=0)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--patience", type=int, default=12)
    parser.add_argument("--device", default=None)
    parser.add_argument(
        "--init-checkpoint",
        default=None,
        help="Optional checkpoint to warm-start model weights from. Labels must match exactly.",
    )
    parser.add_argument(
        "--balanced-sampler",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Oversample weaker classes during training.",
    )
    parser.add_argument(
        "--cutmix-alpha",
        type=float,
        default=0.0,
        help="Beta distribution alpha for time-axis CutMix on train batches. 0 disables.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    seed_everything(args.seed)
    artifact_dir = ensure_dir(args.artifact_dir)
    device = resolve_device(args.device)

    records = load_word_records(args.data_path)
    if args.classes:
        allowed = {label.upper() for label in args.classes}
        records = [record for record in records if record.label.upper() in allowed]
    if args.max_samples_per_class is not None:
        records = _limit_per_class(records, args.max_samples_per_class)

    labels = word_class_names(records)
    class_to_idx = {label: index for index, label in enumerate(labels)}
    train_records, val_records, test_records = split_word_records(
        records=records,
        val_ratio=args.val_ratio,
        test_ratio=args.test_ratio,
        seed=args.seed,
    )
    input_dim = word_feature_dim(records)

    train_dataset = WordLandmarkDataset(train_records, class_to_idx, args.sequence_length, training=True)
    val_dataset = WordLandmarkDataset(val_records, class_to_idx, args.sequence_length, training=False)
    test_dataset = WordLandmarkDataset(test_records, class_to_idx, args.sequence_length, training=False)
    class_weights = _build_class_weights(train_records, class_to_idx)
    sampler = _build_train_sampler(train_records) if args.balanced_sampler else None

    pin_memory = device.type == "cuda"
    train_loader = DataLoader(
        train_dataset,
        batch_size=args.batch_size,
        shuffle=sampler is None,
        sampler=sampler,
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

    model = WordLandmarkRecognizer(
        input_dim=input_dim,
        num_classes=len(labels),
        hidden_dim=args.hidden_dim,
        num_layers=args.num_layers,
        dropout=args.dropout,
        attention_dim=args.attention_dim,
    )
    if args.init_checkpoint:
        warmstart = torch.load(args.init_checkpoint, map_location="cpu")
        warmstart_labels = list(warmstart["labels"])
        if warmstart_labels != labels:
            raise ValueError("Warm-start checkpoint labels do not match current dataset labels")
        model.load_state_dict(warmstart["model_state"], strict=True)
    model.to(device)

    criterion = nn.CrossEntropyLoss(
        weight=class_weights.to(device),
        label_smoothing=0.05,
    )
    optimizer = AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    scheduler = CosineAnnealingLR(optimizer, T_max=max(1, args.epochs))
    scaler = torch.amp.GradScaler("cuda", enabled=device.type == "cuda")

    print(
        f"Training on {device} with {len(train_dataset)} train / {len(val_dataset)} val / "
        f"{len(test_dataset)} test sequences across {len(labels)} classes"
    )
    print(f"Per-frame feature dim: {input_dim}, sequence length: {args.sequence_length}")
    print(f"Trainable parameters: {count_trainable_parameters(model):,}")
    if args.balanced_sampler:
        print("Using class-balanced sampling for word training")
    if args.init_checkpoint:
        print(f"Warm-started model weights from {args.init_checkpoint}")

    best_val_accuracy = -1.0
    best_checkpoint_path = artifact_dir / "best.pt"
    history: list[dict[str, Any]] = []
    stale_epochs = 0

    for epoch in range(1, args.epochs + 1):
        train_metrics = run_epoch(
            model=model,
            loader=train_loader,
            criterion=criterion,
            optimizer=optimizer,
            scaler=scaler,
            device=device,
            train=True,
            description=f"Epoch {epoch}/{args.epochs} [train]",
            cutmix_alpha=args.cutmix_alpha,
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
                input_dim=input_dim,
                best_val_accuracy=best_val_accuracy,
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


def _limit_per_class(records: list[WordLandmarkRecord], max_samples_per_class: int) -> list[WordLandmarkRecord]:
    limited: list[WordLandmarkRecord] = []
    per_class_counts: dict[str, int] = {}
    for record in records:
        count = per_class_counts.get(record.label, 0)
        if count >= max_samples_per_class:
            continue
        per_class_counts[record.label] = count + 1
        limited.append(record)
    return limited


def _build_class_weights(
    records: list[WordLandmarkRecord],
    class_to_idx: dict[str, int],
) -> torch.Tensor:
    counts = Counter(record.label for record in records)
    mean_count = sum(counts.values()) / max(len(counts), 1)
    weights = torch.ones(len(class_to_idx), dtype=torch.float32)
    for label, index in class_to_idx.items():
        count = counts.get(label, 1)
        weights[index] = float(mean_count / count)
    return weights


def _build_train_sampler(records: list[WordLandmarkRecord]) -> WeightedRandomSampler:
    counts = Counter(record.label for record in records)
    sample_weights = [1.0 / float(counts[record.label]) for record in records]
    return WeightedRandomSampler(
        weights=torch.tensor(sample_weights, dtype=torch.double),
        num_samples=len(records),
        replacement=True,
    )


def _apply_time_cutmix(
    sequences: torch.Tensor,
    targets: torch.Tensor,
    alpha: float,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, float]:
    """Replace a contiguous time window in each sample with the same window from a permuted sample.

    Returns ``(mixed_sequences, targets_a, targets_b, lam)`` where ``lam`` is
    the fraction of the original (targets_a) sequence retained.  If the sampled
    cut is empty or spans the whole sequence, cutmix is skipped and the
    original batch is returned with ``lam = 1.0``.
    """

    batch_size, time_len, _ = sequences.shape
    if batch_size < 2 or time_len < 4 or alpha <= 0.0:
        return sequences, targets, targets, 1.0

    lam_sample = float(np.random.beta(alpha, alpha))
    cut_len = int(round((1.0 - lam_sample) * time_len))
    if cut_len <= 0 or cut_len >= time_len:
        return sequences, targets, targets, 1.0

    permutation = torch.randperm(batch_size, device=sequences.device)
    cut_start = int(np.random.randint(0, time_len - cut_len + 1))
    mixed = sequences.clone()
    mixed[:, cut_start : cut_start + cut_len, :] = sequences[
        permutation, cut_start : cut_start + cut_len, :
    ]
    effective_lam = 1.0 - cut_len / time_len
    return mixed, targets, targets[permutation], effective_lam


def run_epoch(
    model: WordLandmarkRecognizer,
    loader: DataLoader,
    criterion: nn.Module,
    optimizer: AdamW | None,
    scaler: torch.amp.GradScaler | None,
    device: torch.device,
    train: bool,
    description: str,
    cutmix_alpha: float = 0.0,
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
    for sequences, targets in progress:
        sequences = sequences.to(device, non_blocking=True)
        targets = targets.to(device, non_blocking=True)

        if train:
            assert optimizer is not None
            optimizer.zero_grad(set_to_none=True)

        if train and cutmix_alpha > 0.0:
            sequences, targets_a, targets_b, lam = _apply_time_cutmix(
                sequences, targets, cutmix_alpha
            )
        else:
            targets_a = targets
            targets_b = targets
            lam = 1.0

        with (torch.autocast(device_type="cuda", dtype=torch.float16) if device.type == "cuda" else nullcontext()):
            logits = model(sequences)
            if train and lam < 1.0:
                loss = lam * criterion(logits, targets_a) + (1.0 - lam) * criterion(logits, targets_b)
            else:
                loss = criterion(logits, targets_a)

        if train:
            assert optimizer is not None
            assert scaler is not None
            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            scaler.step(optimizer)
            scaler.update()

        predictions = logits.argmax(dim=1)
        batch_size = targets.size(0)
        running_loss += loss.item() * batch_size
        total += batch_size
        # For mixed batches, credit a correct prediction toward whichever label
        # dominates the mix (argmax(lam, 1-lam) = targets_a when lam >= 0.5).
        reference_targets = targets_a if lam >= 0.5 else targets_b
        correct += int((predictions == reference_targets).sum().item())
        all_predictions.extend(predictions.detach().cpu().tolist())
        all_targets.extend(reference_targets.detach().cpu().tolist())
        progress.set_postfix(loss=running_loss / max(total, 1), acc=correct / max(total, 1))

    return {
        "loss": running_loss / max(total, 1),
        "accuracy": correct / max(total, 1),
        "predictions": all_predictions,
        "targets": all_targets,
    }


def save_checkpoint(
    path: Path,
    model: WordLandmarkRecognizer,
    optimizer: AdamW,
    scheduler: CosineAnnealingLR,
    scaler: torch.amp.GradScaler,
    labels: list[str],
    args: argparse.Namespace,
    history: list[dict[str, Any]],
    input_dim: int,
    best_val_accuracy: float,
    split_records_map: dict[str, list[WordLandmarkRecord]],
) -> None:
    checkpoint = {
        "model_state": model.state_dict(),
        "optimizer_state": optimizer.state_dict(),
        "scheduler_state": scheduler.state_dict(),
        "scaler_state": scaler.state_dict(),
        "labels": labels,
        "history": history,
        "best_val_accuracy": best_val_accuracy,
        "model_config": {
            "input_dim": input_dim,
            "hidden_dim": args.hidden_dim,
            "num_layers": args.num_layers,
            "dropout": args.dropout,
            "attention_dim": args.attention_dim,
            "sequence_length": args.sequence_length,
            "seed": args.seed,
            "val_ratio": args.val_ratio,
            "test_ratio": args.test_ratio,
        },
        "splits": {
            split_name: [
                {
                    "label": record.label,
                    "group": record.group,
                    "frames": [list(frame) for frame in record.frames],
                    "source_path": record.source_path,
                }
                for record in split_records
            ]
            for split_name, split_records in split_records_map.items()
        },
    }
    torch.save(checkpoint, path)


if __name__ == "__main__":
    main()
