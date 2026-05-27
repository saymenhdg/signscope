from __future__ import annotations

import re
from collections import Counter
from pathlib import Path
import sys

import matplotlib.pyplot as plt
import numpy as np
import torch
from sklearn.metrics import confusion_matrix
from torch.utils.data import DataLoader


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from signlang.word_landmark_data import WordLandmarkDataset, WordLandmarkRecord
from signlang.word_landmark_model import WordLandmarkRecognizer
from signlang.utils import resolve_device

FIG_DIR = ROOT / "docs" / "thesis_figures"
WORD_V14_DIR = ROOT / "artifacts" / "word_landmarks_v14"
ALPHABET_V8_REPORT = ROOT / "artifacts" / "alphabet_landmarks_v8" / "classification_report.txt"


def parse_classification_report(path: Path) -> list[dict[str, float | int | str]]:
    pattern = re.compile(
        r"^(?P<label>[A-Z0-9_]+)\s+"
        r"(?P<precision>\d+\.\d+)\s+"
        r"(?P<recall>\d+\.\d+)\s+"
        r"(?P<f1>\d+\.\d+)\s+"
        r"(?P<support>\d+)$"
    )
    rows: list[dict[str, float | int | str]] = []
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        match = pattern.match(raw_line.strip())
        if not match:
            continue
        rows.append(
            {
                "label": match.group("label"),
                "precision": float(match.group("precision")),
                "recall": float(match.group("recall")),
                "f1": float(match.group("f1")),
                "support": int(match.group("support")),
            }
        )
    return rows


def load_word_v14_checkpoint() -> dict:
    checkpoint_path = WORD_V14_DIR / "best.pt"
    return torch.load(checkpoint_path, map_location="cpu")


def records_from_split_payload(records_payload: list[dict]) -> list[WordLandmarkRecord]:
    return [
        WordLandmarkRecord(
            label=item["label"],
            group=item["group"],
            frames=tuple(tuple(float(v) for v in frame) for frame in item["frames"]),
            source_path=item.get("source_path"),
        )
        for item in records_payload
    ]


def build_word_distribution_figure(checkpoint: dict) -> Path:
    splits = checkpoint["splits"]
    labels: list[str] = checkpoint["labels"]
    train_records = records_from_split_payload(splits["train"])
    val_records = records_from_split_payload(splits["val"])
    test_records = records_from_split_payload(splits["test"])

    train_counts = Counter(record.label for record in train_records)
    val_counts = Counter(record.label for record in val_records)
    test_counts = Counter(record.label for record in test_records)

    ordered_labels = sorted(
        labels,
        key=lambda label: (
            train_counts.get(label, 0) + val_counts.get(label, 0) + test_counts.get(label, 0),
            train_counts.get(label, 0),
            label,
        ),
        reverse=True,
    )

    y = np.arange(len(ordered_labels))
    height = 0.24
    train_values = np.array([train_counts.get(label, 0) for label in ordered_labels])
    val_values = np.array([val_counts.get(label, 0) for label in ordered_labels])
    test_values = np.array([test_counts.get(label, 0) for label in ordered_labels])

    plt.style.use("ggplot")
    fig, ax = plt.subplots(figsize=(14, 22))
    ax.barh(y - height, train_values, height=height, color="#4C78A8", label="Train")
    ax.barh(y, val_values, height=height, color="#F58518", label="Validation")
    ax.barh(y + height, test_values, height=height, color="#54A24B", label="Test")

    ax.set_title("Word Class Distribution Across Train / Validation / Test Splits (V14)")
    ax.set_xlabel("Number of samples")
    ax.set_ylabel("Word class")
    ax.set_yticks(y)
    ax.set_yticklabels(ordered_labels, fontsize=8)
    ax.invert_yaxis()
    ax.legend(loc="lower right")
    ax.grid(axis="x", alpha=0.35)

    output_path = FIG_DIR / "word_class_distribution_v14.png"
    fig.tight_layout()
    fig.savefig(output_path, dpi=300, bbox_inches="tight")
    plt.close(fig)
    return output_path


def predict_word_v14_test_split(checkpoint: dict) -> tuple[list[str], np.ndarray]:
    labels: list[str] = checkpoint["labels"]
    model_config: dict = checkpoint["model_config"]
    test_records = records_from_split_payload(checkpoint["splits"]["test"])
    class_to_idx = {label: index for index, label in enumerate(labels)}

    dataset = WordLandmarkDataset(
        records=test_records,
        class_to_idx=class_to_idx,
        sequence_length=int(model_config["sequence_length"]),
        training=False,
    )
    loader = DataLoader(dataset, batch_size=64, shuffle=False, num_workers=0)

    model = WordLandmarkRecognizer(
        input_dim=int(model_config["input_dim"]),
        num_classes=len(labels),
        hidden_dim=int(model_config["hidden_dim"]),
        num_layers=int(model_config["num_layers"]),
        dropout=float(model_config["dropout"]),
        attention_dim=int(model_config["attention_dim"]),
    )
    model.load_state_dict(checkpoint["model_state"])
    device = resolve_device(None)
    model.to(device)
    model.eval()

    predictions: list[int] = []
    targets: list[int] = []
    with torch.no_grad():
        for sequences, batch_targets in loader:
            sequences = sequences.to(device)
            logits = model(sequences)
            batch_predictions = logits.argmax(dim=1).cpu().tolist()
            predictions.extend(batch_predictions)
            targets.extend(batch_targets.tolist())

    cm = confusion_matrix(targets, predictions, labels=list(range(len(labels))))
    return labels, cm


def build_word_confusion_heatmap(checkpoint: dict) -> Path:
    labels, cm = predict_word_v14_test_split(checkpoint)

    pair_rows: list[tuple[int, int, int]] = []
    for true_idx in range(cm.shape[0]):
        for pred_idx in range(cm.shape[1]):
            if true_idx == pred_idx:
                continue
            count = int(cm[true_idx, pred_idx])
            if count > 0:
                pair_rows.append((true_idx, pred_idx, count))

    top_pairs = sorted(pair_rows, key=lambda item: (item[2], labels[item[0]], labels[item[1]]), reverse=True)[:20]
    pair_label_set = []
    for true_idx, pred_idx, _count in top_pairs:
        true_label = labels[true_idx]
        pred_label = labels[pred_idx]
        if true_label not in pair_label_set:
            pair_label_set.append(true_label)
        if pred_label not in pair_label_set:
            pair_label_set.append(pred_label)

    subset_labels = pair_label_set
    subset_indices = [labels.index(label) for label in subset_labels]
    subset_cm = cm[np.ix_(subset_indices, subset_indices)].astype(float)

    mask = np.zeros_like(subset_cm, dtype=bool)
    for row in range(subset_cm.shape[0]):
        for col in range(subset_cm.shape[1]):
            if row == col:
                mask[row, col] = True
            elif subset_cm[row, col] <= 0:
                mask[row, col] = True

    display_cm = np.ma.masked_where(mask, subset_cm)

    plt.style.use("default")
    fig, ax = plt.subplots(figsize=(14, 12))
    cmap = plt.cm.YlOrRd.copy()
    cmap.set_bad(color="white")
    im = ax.imshow(display_cm, cmap=cmap, aspect="auto")

    ax.set_title("Top 20 Most Confused Word-Pair Counts in V14 Test Predictions")
    ax.set_xticks(np.arange(len(subset_labels)))
    ax.set_yticks(np.arange(len(subset_labels)))
    ax.set_xticklabels(subset_labels, rotation=60, ha="right", fontsize=9)
    ax.set_yticklabels(subset_labels, fontsize=9)
    ax.set_xlabel("Predicted label")
    ax.set_ylabel("True label")

    for row in range(subset_cm.shape[0]):
        for col in range(subset_cm.shape[1]):
            value = int(subset_cm[row, col])
            if row != col and value > 0:
                ax.text(col, row, str(value), ha="center", va="center", color="black", fontsize=8)

    cbar = fig.colorbar(im, ax=ax, fraction=0.03, pad=0.02)
    cbar.set_label("Confusion count")

    output_path = FIG_DIR / "word_confusion_heatmap_top20_v14.png"
    fig.tight_layout()
    fig.savefig(output_path, dpi=300, bbox_inches="tight")
    plt.close(fig)
    return output_path


def build_alphabet_recall_figure() -> Path:
    report_rows = parse_classification_report(ALPHABET_V8_REPORT)
    report_rows.sort(key=lambda row: str(row["label"]))

    labels = [str(row["label"]) for row in report_rows]
    recalls = np.array([float(row["recall"]) * 100.0 for row in report_rows])
    colors = ["#4C78A8"] * len(labels)

    lowest_indices = np.argsort(recalls)[:5]
    for idx in lowest_indices:
        colors[int(idx)] = "#E45756"

    plt.style.use("ggplot")
    fig, ax = plt.subplots(figsize=(14, 6.5))
    bars = ax.bar(labels, recalls, color=colors, edgecolor="none")

    ax.set_title("Alphabet Per-Class Recall for 26 Letters (alphabet_landmarks_v8)")
    ax.set_xlabel("Letter")
    ax.set_ylabel("Recall (%)")
    ax.set_ylim(0, 105)
    ax.grid(axis="y", alpha=0.35)

    for bar, value in zip(bars, recalls):
        ax.text(
            bar.get_x() + bar.get_width() / 2.0,
            value + 0.8,
            f"{value:.0f}",
            ha="center",
            va="bottom",
            fontsize=8,
            rotation=90,
        )

    output_path = FIG_DIR / "alphabet_per_class_recall_v8.png"
    fig.tight_layout()
    fig.savefig(output_path, dpi=300, bbox_inches="tight")
    plt.close(fig)
    return output_path


def main() -> None:
    FIG_DIR.mkdir(parents=True, exist_ok=True)
    checkpoint = load_word_v14_checkpoint()
    outputs = [
        build_word_distribution_figure(checkpoint),
        build_word_confusion_heatmap(checkpoint),
        build_alphabet_recall_figure(),
    ]
    for path in outputs:
        print(path)


if __name__ == "__main__":
    main()
