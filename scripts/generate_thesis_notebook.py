from __future__ import annotations

from pathlib import Path
import textwrap

import nbformat as nbf


NOTEBOOK_PATH = Path("docs/thesis_model_performance_analysis.ipynb")


def markdown_cell(source: str):
    return nbf.v4.new_markdown_cell(textwrap.dedent(source).strip())


def code_cell(source: str):
    return nbf.v4.new_code_cell(textwrap.dedent(source).strip())


def build_notebook() -> nbf.NotebookNode:
    cells = [
        markdown_cell(
            """
            # SignSpeak Thesis Notebook

            This notebook assembles thesis-ready analysis from the saved SignSpeak artifacts.
            It focuses on:

            - word-model progression from `v12` to `v14_ft`
            - dataset growth and its relationship to performance
            - training curves and held-out evaluation
            - per-class behavior and weak-class recovery
            - latest alphabet benchmark as a secondary system result

            All plots are rendered with `matplotlib` and exported to `docs/thesis_figures`.
            """
        ),
        code_cell(
            """
            from __future__ import annotations

            import json
            import re
            import sys
            from collections import Counter
            from pathlib import Path

            import matplotlib.pyplot as plt
            import numpy as np
            import pandas as pd
            import torch
            from sklearn.metrics import confusion_matrix
            from torch.utils.data import DataLoader

            plt.style.use("ggplot")
            plt.rcParams.update({
                "figure.dpi": 140,
                "savefig.dpi": 300,
                "axes.titlesize": 14,
                "axes.labelsize": 11,
                "xtick.labelsize": 9,
                "ytick.labelsize": 9,
                "legend.fontsize": 9,
                "font.size": 10,
            })

            ROOT = Path.cwd()
            if not (ROOT / "artifacts").exists():
                ROOT = ROOT.parent
            if str(ROOT) not in sys.path:
                sys.path.insert(0, str(ROOT))

            from signlang.word_landmark_data import WordLandmarkDataset, WordLandmarkRecord
            from signlang.word_landmark_model import WordLandmarkRecognizer
            from signlang.utils import resolve_device

            FIG_DIR = ROOT / "docs" / "thesis_figures"
            FIG_DIR.mkdir(parents=True, exist_ok=True)

            WORD_RUNS = {
                "v12": ROOT / "artifacts" / "word_landmarks_v12",
                "v13": ROOT / "artifacts" / "word_landmarks_v13",
                "v14_ft": ROOT / "artifacts" / "word_landmarks_v14_ft",
            }
            WORD_CONFUSION_RUN = ROOT / "artifacts" / "word_landmarks_v14"
            ALPHABET_RUN = ROOT / "artifacts" / "alphabet_landmarks_v8"

            WORD_DATASETS = {
                "v5_candidate": ROOT / "data" / "word_landmarks_v5_candidate" / "records.json",
                "v6_candidate": ROOT / "data" / "word_landmarks_v6_candidate" / "records.json",
            }

            def load_json(path: Path):
                return json.loads(path.read_text(encoding="utf-8"))

            def load_metrics(run_dir: Path) -> dict:
                return load_json(run_dir / "metrics.json")

            def load_dataset_summary(path: Path) -> dict:
                payload = load_json(path)
                records = payload.get("records", []) if isinstance(payload, dict) else payload
                classes = payload.get("classes", []) if isinstance(payload, dict) else sorted({
                    str(item.get("label", "")).upper() for item in records if isinstance(item, dict)
                })
                return {
                    "records": len(records),
                    "classes": len(classes),
                    "processed_videos": payload.get("processed_videos", len(records)) if isinstance(payload, dict) else len(records),
                    "frames_per_video": payload.get("frames_per_video") if isinstance(payload, dict) else None,
                    "feature_dim": payload.get("feature_dim") if isinstance(payload, dict) else None,
                }

            REPORT_PATTERN = re.compile(
                r"^(?P<label>[A-Z0-9_]+)\\s+"
                r"(?P<precision>\\d+\\.\\d+)\\s+"
                r"(?P<recall>\\d+\\.\\d+)\\s+"
                r"(?P<f1>\\d+\\.\\d+)\\s+"
                r"(?P<support>\\d+)$"
            )

            def parse_classification_report(path: Path) -> pd.DataFrame:
                rows = []
                for raw_line in path.read_text(encoding="utf-8").splitlines():
                    line = raw_line.strip()
                    match = REPORT_PATTERN.match(line)
                    if not match:
                        continue
                    rows.append({
                        "label": match.group("label"),
                        "precision": float(match.group("precision")),
                        "recall": float(match.group("recall")),
                        "f1_score": float(match.group("f1")),
                        "support": int(match.group("support")),
                    })
                return pd.DataFrame(rows)

            def save_figure(fig: plt.Figure, name: str):
                png_path = FIG_DIR / f"{name}.png"
                fig.savefig(png_path, bbox_inches="tight")
                return png_path

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
            """
        ),
        markdown_cell(
            """
            ## 1. Artifact Inventory

            This section confirms the exact checkpoints and datasets used for the later plots.
            """
        ),
        code_cell(
            """
            word_metrics = {name: load_metrics(path) for name, path in WORD_RUNS.items()}
            word_reports = {
                name: parse_classification_report(path / "classification_report.txt")
                for name, path in WORD_RUNS.items()
            }
            dataset_summaries = {
                name: load_dataset_summary(path)
                for name, path in WORD_DATASETS.items()
            }
            alphabet_metrics = load_metrics(ALPHABET_RUN)
            alphabet_report = parse_classification_report(ALPHABET_RUN / "classification_report.txt")

            inventory_rows = []
            for name, metrics in word_metrics.items():
                inventory_rows.append({
                    "run": name,
                    "artifact_dir": str(WORD_RUNS[name].relative_to(ROOT)).replace("\\\\", "/"),
                    "classes": len(metrics.get("labels", [])),
                    "epochs": len(metrics.get("history", [])),
                    "best_val_accuracy": round(metrics.get("best_val_accuracy", 0.0) * 100, 2),
                    "test_accuracy": round(metrics.get("test_accuracy", 0.0) * 100, 2),
                    "test_loss": round(metrics.get("test_loss", 0.0), 3),
                })

            inventory_df = pd.DataFrame(inventory_rows)
            inventory_df
            """
        ),
        markdown_cell(
            """
            ## 2. Dataset Growth

            The final word-model improvements were driven by staged dataset expansion.
            The figures below summarize the candidate-set growth used before the later checkpoints.
            """
        ),
        code_cell(
            """
            dataset_df = pd.DataFrame([
                {
                    "dataset": name,
                    "records": summary["records"],
                    "classes": summary["classes"],
                    "frames_per_video": summary["frames_per_video"],
                    "feature_dim": summary["feature_dim"],
                }
                for name, summary in dataset_summaries.items()
            ]).sort_values("dataset")
            dataset_df
            """
        ),
        code_cell(
            """
            fig, ax = plt.subplots(figsize=(8, 4.8))
            bars = ax.bar(dataset_df["dataset"], dataset_df["records"], color=["#6C7BFF", "#2DC5B8"])
            ax.set_title("Word Landmark Dataset Growth")
            ax.set_ylabel("Number of processed clips")
            ax.set_xlabel("Dataset version")
            ax.bar_label(bars, padding=3)
            save_figure(fig, "dataset_growth_word_clips")
            plt.show()
            """
        ),
        markdown_cell(
            """
            ## 2B. Word Class Distribution by Split

            This figure shows the per-class train, validation, and test sample counts from the
            saved `word_landmarks_v14` checkpoint splits. It is useful for discussing imbalance.
            """
        ),
        code_cell(
            """
            word_v14_checkpoint = torch.load(WORD_CONFUSION_RUN / "best.pt", map_location="cpu")
            word_v14_split_records = {
                split_name: records_from_split_payload(records_payload)
                for split_name, records_payload in word_v14_checkpoint["splits"].items()
            }

            split_distribution_df = pd.DataFrame({
                "label": word_v14_checkpoint["labels"],
                "train": [sum(1 for record in word_v14_split_records["train"] if record.label == label) for label in word_v14_checkpoint["labels"]],
                "val": [sum(1 for record in word_v14_split_records["val"] if record.label == label) for label in word_v14_checkpoint["labels"]],
                "test": [sum(1 for record in word_v14_split_records["test"] if record.label == label) for label in word_v14_checkpoint["labels"]],
            })
            split_distribution_df["total"] = split_distribution_df["train"] + split_distribution_df["val"] + split_distribution_df["test"]
            split_distribution_df = split_distribution_df.sort_values(["total", "train", "label"], ascending=[False, False, True]).reset_index(drop=True)
            split_distribution_df.head(12)
            """
        ),
        code_cell(
            """
            fig, ax = plt.subplots(figsize=(14, 22))
            y = np.arange(len(split_distribution_df))
            height = 0.24

            ax.barh(y - height, split_distribution_df["train"], height=height, color="#4C78A8", label="Train")
            ax.barh(y, split_distribution_df["val"], height=height, color="#F58518", label="Validation")
            ax.barh(y + height, split_distribution_df["test"], height=height, color="#54A24B", label="Test")

            ax.set_title("Word Class Distribution Across Train / Validation / Test Splits (V14)")
            ax.set_xlabel("Number of samples")
            ax.set_ylabel("Word class")
            ax.set_yticks(y)
            ax.set_yticklabels(split_distribution_df["label"], fontsize=8)
            ax.invert_yaxis()
            ax.legend(loc="lower right")
            ax.grid(axis="x", alpha=0.35)

            fig.tight_layout()
            save_figure(fig, "word_class_distribution_v14")
            plt.show()
            """
        ),
        markdown_cell(
            """
            ## 3. Word Checkpoint Performance

            The next comparison isolates the main word checkpoints and summarizes how validation
            and test metrics changed between `v12`, `v13`, and `v14_ft`.
            """
        ),
        code_cell(
            """
            comparison_df = inventory_df.copy()
            comparison_df
            """
        ),
        code_cell(
            """
            fig, ax = plt.subplots(figsize=(8.4, 5.0))
            x = range(len(comparison_df))
            width = 0.35
            ax.bar([i - width / 2 for i in x], comparison_df["best_val_accuracy"], width=width, label="Best validation accuracy", color="#6C7BFF")
            ax.bar([i + width / 2 for i in x], comparison_df["test_accuracy"], width=width, label="Test accuracy", color="#2DC5B8")
            ax.set_xticks(list(x))
            ax.set_xticklabels(comparison_df["run"])
            ax.set_ylim(0, 100)
            ax.set_ylabel("Accuracy (%)")
            ax.set_title("Word Model Accuracy by Checkpoint")
            ax.legend()
            save_figure(fig, "word_checkpoint_accuracy_comparison")
            plt.show()
            """
        ),
        code_cell(
            """
            fig, ax = plt.subplots(figsize=(8.4, 4.6))
            ax.plot(comparison_df["run"], comparison_df["test_loss"], marker="o", linewidth=2.2, color="#E97A7A")
            ax.set_title("Word Model Test Loss by Checkpoint")
            ax.set_xlabel("Checkpoint")
            ax.set_ylabel("Test loss")
            save_figure(fig, "word_checkpoint_test_loss")
            plt.show()
            """
        ),
        markdown_cell(
            """
            ## 4. Training Curves

            This section plots the saved training histories to show convergence behavior and the
            changing relationship between training and validation accuracy.
            """
        ),
        code_cell(
            """
            fig, axes = plt.subplots(1, 2, figsize=(12, 4.6))

            for run_name, metrics in word_metrics.items():
                history = pd.DataFrame(metrics.get("history", []))
                history["epoch"] = range(1, len(history) + 1)
                axes[0].plot(history["epoch"], history["train_accuracy"] * 100, linewidth=1.4, label=f"{run_name} train")
                axes[0].plot(history["epoch"], history["val_accuracy"] * 100, linewidth=2.0, linestyle="--", label=f"{run_name} val")
                axes[1].plot(history["epoch"], history["val_loss"], linewidth=2.0, label=run_name)

            axes[0].set_title("Word Training and Validation Accuracy")
            axes[0].set_xlabel("Epoch")
            axes[0].set_ylabel("Accuracy (%)")
            axes[0].legend(ncol=2)

            axes[1].set_title("Word Validation Loss")
            axes[1].set_xlabel("Epoch")
            axes[1].set_ylabel("Loss")
            axes[1].legend()

            fig.tight_layout()
            save_figure(fig, "word_training_curves")
            plt.show()
            """
        ),
        markdown_cell(
            """
            ## 5. Per-Class Performance in the Final Word Model

            The thesis should not rely only on aggregate accuracy. The next figures break down the
            final `v14_ft` results across the full 80-word vocabulary.
            """
        ),
        code_cell(
            """
            v14_report = word_reports["v14_ft"].sort_values("recall", ascending=False).reset_index(drop=True)
            v14_report.head(10)
            """
        ),
        code_cell(
            """
            top_words = v14_report.head(12).sort_values("recall")
            bottom_words = v14_report.tail(12).sort_values("recall")

            fig, axes = plt.subplots(1, 2, figsize=(13, 5.4))
            axes[0].barh(top_words["label"], top_words["recall"] * 100, color="#2DC5B8")
            axes[0].set_title("Top Word Classes in v14_ft")
            axes[0].set_xlabel("Recall / per-class accuracy (%)")
            axes[0].set_xlim(0, 105)

            axes[1].barh(bottom_words["label"], bottom_words["recall"] * 100, color="#E97A7A")
            axes[1].set_title("Lowest Word Classes in v14_ft")
            axes[1].set_xlabel("Recall / per-class accuracy (%)")
            axes[1].set_xlim(0, 105)

            fig.tight_layout()
            save_figure(fig, "word_top_bottom_classes_v14")
            plt.show()
            """
        ),
        markdown_cell(
            """
            ## 6. Recovery of Weak Classes

            The project particularly targeted weak classes with additional data and warm-started
            fine-tuning. The figure below tracks several difficult labels across checkpoints.
            """
        ),
        code_cell(
            """
            tracked_labels = ["ANIMAL", "HOLD", "LIVE", "NIGHT", "READ", "PILLOW", "TALK", "WHAT"]
            weak_rows = []
            for run_name, report_df in word_reports.items():
                subset = report_df[report_df["label"].isin(tracked_labels)].copy()
                subset["run"] = run_name
                weak_rows.append(subset[["run", "label", "recall", "support"]])

            weak_df = pd.concat(weak_rows, ignore_index=True)
            weak_pivot = weak_df.pivot(index="label", columns="run", values="recall").reindex(tracked_labels)
            weak_pivot
            """
        ),
        code_cell(
            """
            fig, ax = plt.subplots(figsize=(10.5, 5.4))
            labels = list(weak_pivot.index)
            x = range(len(labels))
            width = 0.25

            for offset, run_name, color in [
                (-width, "v12", "#C45C8C"),
                (0.0, "v13", "#6C7BFF"),
                (width, "v14_ft", "#2DC5B8"),
            ]:
                values = (weak_pivot[run_name] * 100).tolist()
                ax.bar([i + offset for i in x], values, width=width, label=run_name, color=color)

            ax.set_xticks(list(x))
            ax.set_xticklabels(labels, rotation=35, ha="right")
            ax.set_ylabel("Recall / per-class accuracy (%)")
            ax.set_title("Improvement of Targeted Weak Word Classes")
            ax.legend()
            fig.tight_layout()
            save_figure(fig, "weak_class_improvement_word_models")
            plt.show()
            """
        ),
        markdown_cell(
            """
            ## 6B. V14 Confusion Heatmap

            The next cells rebuild the saved `word_landmarks_v14` test predictions and extract the
            top 20 most confused directed word pairs. The heatmap focuses only on labels involved in
            those top confusion counts.
            """
        ),
        code_cell(
            """
            labels = word_v14_checkpoint["labels"]
            model_config = word_v14_checkpoint["model_config"]
            class_to_idx = {label: index for index, label in enumerate(labels)}

            v14_test_dataset = WordLandmarkDataset(
                records=word_v14_split_records["test"],
                class_to_idx=class_to_idx,
                sequence_length=int(model_config["sequence_length"]),
                training=False,
            )
            v14_test_loader = DataLoader(v14_test_dataset, batch_size=64, shuffle=False, num_workers=0)

            v14_model = WordLandmarkRecognizer(
                input_dim=int(model_config["input_dim"]),
                num_classes=len(labels),
                hidden_dim=int(model_config["hidden_dim"]),
                num_layers=int(model_config["num_layers"]),
                dropout=float(model_config["dropout"]),
                attention_dim=int(model_config["attention_dim"]),
            )
            v14_model.load_state_dict(word_v14_checkpoint["model_state"])
            v14_device = resolve_device(None)
            v14_model.to(v14_device)
            v14_model.eval()

            v14_predictions = []
            v14_targets = []
            with torch.no_grad():
                for sequences, batch_targets in v14_test_loader:
                    sequences = sequences.to(v14_device)
                    logits = v14_model(sequences)
                    v14_predictions.extend(logits.argmax(dim=1).cpu().tolist())
                    v14_targets.extend(batch_targets.tolist())

            v14_cm = confusion_matrix(v14_targets, v14_predictions, labels=list(range(len(labels))))

            confusion_rows = []
            for true_idx in range(v14_cm.shape[0]):
                for pred_idx in range(v14_cm.shape[1]):
                    if true_idx == pred_idx:
                        continue
                    count = int(v14_cm[true_idx, pred_idx])
                    if count > 0:
                        confusion_rows.append({
                            "true_label": labels[true_idx],
                            "pred_label": labels[pred_idx],
                            "count": count,
                        })

            top20_confusions = pd.DataFrame(confusion_rows).sort_values(["count", "true_label", "pred_label"], ascending=[False, True, True]).head(20).reset_index(drop=True)
            top20_confusions
            """
        ),
        code_cell(
            """
            confusion_label_order = []
            for row in top20_confusions.itertuples(index=False):
                if row.true_label not in confusion_label_order:
                    confusion_label_order.append(row.true_label)
                if row.pred_label not in confusion_label_order:
                    confusion_label_order.append(row.pred_label)

            subset_indices = [labels.index(label) for label in confusion_label_order]
            subset_cm = v14_cm[np.ix_(subset_indices, subset_indices)].astype(float)
            mask = np.zeros_like(subset_cm, dtype=bool)
            for row in range(subset_cm.shape[0]):
                for col in range(subset_cm.shape[1]):
                    if row == col or subset_cm[row, col] <= 0:
                        mask[row, col] = True

            display_cm = np.ma.masked_where(mask, subset_cm)

            plt.style.use("default")
            fig, ax = plt.subplots(figsize=(14, 12))
            cmap = plt.cm.YlOrRd.copy()
            cmap.set_bad(color="white")
            im = ax.imshow(display_cm, cmap=cmap, aspect="auto")

            ax.set_title("Top 20 Most Confused Word-Pair Counts in V14 Test Predictions")
            ax.set_xlabel("Predicted label")
            ax.set_ylabel("True label")
            ax.set_xticks(np.arange(len(confusion_label_order)))
            ax.set_yticks(np.arange(len(confusion_label_order)))
            ax.set_xticklabels(confusion_label_order, rotation=60, ha="right", fontsize=9)
            ax.set_yticklabels(confusion_label_order, fontsize=9)

            for row in range(subset_cm.shape[0]):
                for col in range(subset_cm.shape[1]):
                    value = int(subset_cm[row, col])
                    if row != col and value > 0:
                        ax.text(col, row, str(value), ha="center", va="center", color="black", fontsize=8)

            cbar = fig.colorbar(im, ax=ax, fraction=0.03, pad=0.02)
            cbar.set_label("Confusion count")

            fig.tight_layout()
            save_figure(fig, "word_confusion_heatmap_top20_v14")
            plt.show()
            """
        ),
        markdown_cell(
            """
            ## 7. Alphabet System Benchmark

            The word recognizer is the main focus of the later experiments, but the thesis can also
            include the strongest saved alphabet result for completeness.
            """
        ),
        code_cell(
            """
            alphabet_summary = pd.DataFrame([{
                "run": "alphabet_landmarks_v8",
                "classes": len(alphabet_metrics.get("labels", [])),
                "epochs": len(alphabet_metrics.get("history", [])),
                "best_val_accuracy": round(alphabet_metrics.get("best_val_accuracy", 0.0) * 100, 2),
                "test_accuracy": round(alphabet_metrics.get("test_accuracy", 0.0) * 100, 2),
                "test_loss": round(alphabet_metrics.get("test_loss", 0.0), 3),
            }])
            alphabet_summary
            """
        ),
        code_cell(
            """
            alphabet_bottom = alphabet_report.sort_values("recall").head(8)

            fig, axes = plt.subplots(1, 2, figsize=(12.5, 4.8))
            axes[0].bar(["Best val", "Test"], [alphabet_summary.loc[0, "best_val_accuracy"], alphabet_summary.loc[0, "test_accuracy"]], color=["#6C7BFF", "#2DC5B8"])
            axes[0].set_ylim(0, 100)
            axes[0].set_ylabel("Accuracy (%)")
            axes[0].set_title("Alphabet Landmark Model Accuracy")

            axes[1].barh(alphabet_bottom["label"], alphabet_bottom["recall"] * 100, color="#E0A458")
            axes[1].set_xlim(0, 105)
            axes[1].set_xlabel("Recall / per-class accuracy (%)")
            axes[1].set_title("Lowest Alphabet Classes in v8")

            fig.tight_layout()
            save_figure(fig, "alphabet_benchmark_summary")
            plt.show()
            """
        ),
        markdown_cell(
            """
            ## 7B. Alphabet Per-Class Recall

            This is the full 26-letter per-class recall plot derived from the final saved alphabet
            classification report, complementing the summary figure above.
            """
        ),
        code_cell(
            """
            alphabet_full = alphabet_report.sort_values("label").reset_index(drop=True)
            alphabet_full
            """
        ),
        code_cell(
            """
            fig, ax = plt.subplots(figsize=(14, 6.5))
            colors = ["#4C78A8"] * len(alphabet_full)
            lowest_indices = np.argsort(alphabet_full["recall"].to_numpy())[:5]
            for idx in lowest_indices:
                colors[int(idx)] = "#E45756"

            bars = ax.bar(alphabet_full["label"], alphabet_full["recall"] * 100, color=colors, edgecolor="none")
            ax.set_title("Alphabet Per-Class Recall for 26 Letters (alphabet_landmarks_v8)")
            ax.set_xlabel("Letter")
            ax.set_ylabel("Recall (%)")
            ax.set_ylim(0, 105)
            ax.grid(axis="y", alpha=0.35)

            for bar, value in zip(bars, alphabet_full["recall"] * 100):
                ax.text(
                    bar.get_x() + bar.get_width() / 2.0,
                    value + 0.8,
                    f"{value:.0f}",
                    ha="center",
                    va="bottom",
                    fontsize=8,
                    rotation=90,
                )

            fig.tight_layout()
            save_figure(fig, "alphabet_per_class_recall_v8")
            plt.show()
            """
        ),
        markdown_cell(
            """
            ## 8. Thesis Summary Tables

            These compact tables can be copied into the thesis results and discussion chapters.
            """
        ),
        code_cell(
            """
            summary_table = comparison_df[[
                "run",
                "classes",
                "epochs",
                "best_val_accuracy",
                "test_accuracy",
                "test_loss",
            ]].copy()
            summary_table.columns = [
                "Run",
                "Classes",
                "Epochs",
                "Best Val Acc (%)",
                "Test Acc (%)",
                "Test Loss",
            ]
            summary_table
            """
        ),
        code_cell(
            """
            final_word_table = v14_report.sort_values("recall", ascending=False)[[
                "label",
                "precision",
                "recall",
                "f1_score",
                "support",
            ]].copy()
            final_word_table.head(20)
            """
        ),
        markdown_cell(
            """
            ## 9. Exported Figure Files

            The following directory contains the thesis figures produced by this notebook.
            """
        ),
        code_cell(
            """
            sorted(path.name for path in FIG_DIR.glob("*.png"))
            """
        ),
    ]

    notebook = nbf.v4.new_notebook()
    notebook["cells"] = cells
    notebook["metadata"] = {
        "kernelspec": {
            "display_name": "Python 3",
            "language": "python",
            "name": "python3",
        },
        "language_info": {
            "name": "python",
            "version": "3.13",
        },
    }
    return notebook


def main() -> int:
    NOTEBOOK_PATH.parent.mkdir(parents=True, exist_ok=True)
    notebook = build_notebook()
    NOTEBOOK_PATH.write_text(nbf.writes(notebook, version=4), encoding="utf-8")
    print(f"Wrote {NOTEBOOK_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
