from __future__ import annotations

import argparse

import torch
from sklearn.metrics import classification_report
from torch import nn
from torch.utils.data import DataLoader

from signlang.utils import resolve_device, seed_everything
from signlang.word_landmark_data import (
    WordLandmarkDataset,
    WordLandmarkRecord,
    load_word_records,
    split_word_records,
    word_class_names,
)
from signlang.word_landmark_model import WordLandmarkRecognizer
from train_word_landmarks import run_epoch


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate a trained word landmark checkpoint.")
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--data-path", default="data/word_landmarks_v1/records.json")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--workers", type=int, default=0)
    parser.add_argument("--device", default=None)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    device = resolve_device(args.device)
    checkpoint = torch.load(args.checkpoint, map_location=device)

    labels: list[str] = checkpoint["labels"]
    model_config: dict = checkpoint["model_config"]
    seed_everything(model_config["seed"])

    model = WordLandmarkRecognizer(
        input_dim=model_config["input_dim"],
        num_classes=len(labels),
        hidden_dim=model_config["hidden_dim"],
        num_layers=model_config["num_layers"],
        dropout=model_config["dropout"],
        attention_dim=model_config["attention_dim"],
    )
    model.load_state_dict(checkpoint["model_state"])
    model.to(device)

    test_records_payload = checkpoint.get("splits", {}).get("test")
    if test_records_payload:
        records = [
            WordLandmarkRecord(
                label=item["label"],
                group=item["group"],
                frames=tuple(tuple(float(v) for v in frame) for frame in item["frames"]),
                source_path=item.get("source_path"),
            )
            for item in test_records_payload
        ]
    else:
        all_records = load_word_records(args.data_path)
        _train, _val, records = split_word_records(
            records=all_records,
            val_ratio=model_config["val_ratio"],
            test_ratio=model_config["test_ratio"],
            seed=model_config["seed"],
        )

    discovered_labels = word_class_names(records)
    if sorted(discovered_labels) != sorted(labels):
        print("Warning: evaluation labels do not perfectly match the checkpoint labels")

    class_to_idx = {label: index for index, label in enumerate(labels)}
    dataset = WordLandmarkDataset(
        records=records,
        class_to_idx=class_to_idx,
        sequence_length=model_config["sequence_length"],
        training=False,
    )
    loader = DataLoader(
        dataset,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.workers,
        pin_memory=device.type == "cuda",
        persistent_workers=args.workers > 0,
    )

    criterion = nn.CrossEntropyLoss()
    metrics = run_epoch(
        model=model,
        loader=loader,
        criterion=criterion,
        optimizer=None,
        scaler=None,
        device=device,
        train=False,
        description="Evaluating word landmarks",
    )
    report = classification_report(
        metrics["targets"],
        metrics["predictions"],
        labels=list(range(len(labels))),
        target_names=labels,
        zero_division=0,
    )
    print(f"Test loss: {metrics['loss']:.4f}")
    print(f"Test accuracy: {metrics['accuracy']:.4f}")
    print(report)


if __name__ == "__main__":
    main()
