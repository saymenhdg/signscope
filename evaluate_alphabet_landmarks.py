from __future__ import annotations

import argparse
from pathlib import Path

import torch
from sklearn.metrics import classification_report
from torch import nn
from torch.utils.data import DataLoader

from signlang.alphabet_landmark_data import (
    AlphabetLandmarkDataset,
    LandmarkRecord,
    class_names,
    load_landmark_records,
    split_landmark_records,
)
from signlang.alphabet_landmark_inference import load_landmark_checkpoint
from signlang.utils import resolve_device, seed_everything
from train_alphabet_landmarks import run_epoch


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate a trained alphabet landmark checkpoint.")
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--data-path", default="data/alphabet_landmarks_v2/records.json")
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--workers", type=int, default=0)
    parser.add_argument("--device", default=None)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    model, labels, model_config, device = load_landmark_checkpoint(args.checkpoint, args.device)
    seed_everything(model_config["seed"])

    checkpoint = torch.load(args.checkpoint, map_location=device)
    test_records = checkpoint.get("splits", {}).get("test")

    if test_records:
        records = [
            LandmarkRecord(
                label=item["label"],
                group=item["group"],
                features=tuple(float(value) for value in item["features"]),
                source_path=item.get("source_path"),
            )
            for item in test_records
        ]
    else:
        all_records = load_landmark_records(args.data_path)
        _train_records, _val_records, split_test_records = split_landmark_records(
            records=all_records,
            val_ratio=model_config["val_ratio"],
            test_ratio=model_config["test_ratio"],
            seed=model_config["seed"],
        )
        records = split_test_records

    discovered_labels = class_names(records)
    if sorted(discovered_labels) != sorted(labels):
        print("Warning: evaluation labels do not perfectly match the checkpoint labels")

    class_to_idx = {label: index for index, label in enumerate(labels)}
    dataset = AlphabetLandmarkDataset(
        records=records,
        class_to_idx=class_to_idx,
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
        device=resolve_device(args.device),
        train=False,
        description="Evaluating alphabet landmarks",
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
