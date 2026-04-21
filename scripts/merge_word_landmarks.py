"""Merge multiple word-landmark ``records.json`` files into a single dataset.

The training pipeline (``train_word_landmarks.py``) takes a single
``--data-path`` pointing at a ``records.json``. When we split a large
download into multiple packs (e.g. ``common_words_40`` + ``common_words_40_pack2``)
and extract each separately, we need to stitch the resulting record files back
together before we can train on the combined class set.

Example:
    py -3.13 scripts/merge_word_landmarks.py \
        data/word_landmarks_v2/records.json \
        data/word_landmarks_v3_pack2/records.json \
        --output data/word_landmarks_v3/records.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Merge word landmark record files.")
    parser.add_argument("inputs", nargs="+", help="One or more input records.json files to merge.")
    parser.add_argument("--output", required=True, help="Destination records.json path.")
    parser.add_argument(
        "--allow-class-overlap",
        action="store_true",
        help="Permit overlapping class labels across inputs (default: fail if found).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    combined_records: list[dict[str, Any]] = []
    combined_classes: set[str] = set()
    feature_dim: int | None = None
    frames_per_video: int | None = None
    processed_total = 0
    skipped_total = 0

    for index, input_path in enumerate(args.inputs):
        payload = json.loads(Path(input_path).read_text(encoding="utf-8"))
        classes = set(payload.get("classes", []))
        records = payload.get("records", [])

        if feature_dim is None:
            feature_dim = int(payload["feature_dim"])
        elif int(payload["feature_dim"]) != feature_dim:
            raise ValueError(
                f"Feature dimension mismatch: {input_path} has {payload['feature_dim']}, expected {feature_dim}"
            )

        if frames_per_video is None:
            frames_per_video = int(payload["frames_per_video"])
        elif int(payload["frames_per_video"]) != frames_per_video:
            raise ValueError(
                f"frames_per_video mismatch: {input_path} has {payload['frames_per_video']}, expected {frames_per_video}"
            )

        overlap = combined_classes & classes
        if overlap and not args.allow_class_overlap:
            raise ValueError(
                f"Class overlap between inputs is not allowed (use --allow-class-overlap): {sorted(overlap)}"
            )

        combined_classes |= classes
        combined_records.extend(records)
        processed_total += int(payload.get("processed_videos", 0))
        skipped_total += int(payload.get("skipped_videos", 0))
        print(
            f"[{index + 1}/{len(args.inputs)}] merged {input_path}: "
            f"classes={len(classes)} records={len(records)}"
        )

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output = {
        "classes": sorted(combined_classes),
        "frames_per_video": frames_per_video,
        "feature_dim": feature_dim,
        "processed_videos": processed_total,
        "skipped_videos": skipped_total,
        "records": combined_records,
    }
    output_path.write_text(json.dumps(output), encoding="utf-8")
    print(
        f"\nWrote {len(combined_records)} records across {len(combined_classes)} classes "
        f"to {output_path.resolve()}"
    )


if __name__ == "__main__":
    main()
