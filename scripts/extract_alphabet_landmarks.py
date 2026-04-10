from __future__ import annotations

import argparse
from pathlib import Path
import sys

import cv2
import numpy as np
from tqdm import tqdm

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from signlang.alphabet_landmark_data import normalize_landmarks
from signlang.data import gather_video_records
from signlang.mediapipe_hands import MediaPipeHandTracker
from signlang.utils import ensure_dir, write_json


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract alphabet hand landmarks from raw videos.")
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--output-path", default="data/alphabet_landmarks_v2/records.json")
    parser.add_argument("--classes", nargs="*", default=None)
    parser.add_argument("--max-videos-per-class", type=int, default=None)
    parser.add_argument("--frames-per-video", type=int, default=12)
    parser.add_argument("--tracking-pad-scale", type=float, default=2.2)
    parser.add_argument("--min-crop-ratio", type=float, default=0.52)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    records = gather_video_records(
        root=args.input_dir,
        classes=args.classes,
        max_per_class=args.max_videos_per_class,
    )
    output_path = Path(args.output_path)
    ensure_dir(output_path.parent)

    tracker = MediaPipeHandTracker(
        max_num_hands=1,
        pad_scale=args.tracking_pad_scale,
        min_crop_ratio=args.min_crop_ratio,
    )
    extracted_records: list[dict[str, object]] = []
    skipped_videos = 0

    try:
        for record in tqdm(records, desc="Extracting alphabet landmarks"):
            per_video_records = process_video(
                source_path=record.path,
                label=record.label,
                frames_per_video=args.frames_per_video,
                tracker=tracker,
            )
            if not per_video_records:
                skipped_videos += 1
                continue
            extracted_records.extend(per_video_records)
    finally:
        tracker.close()

    write_json(
        output_path,
        {
            "classes": sorted({record.label for record in records}),
            "frames_per_video": args.frames_per_video,
            "processed_videos": len(records),
            "skipped_videos": skipped_videos,
            "records": extracted_records,
        },
    )
    print(
        f"Processed {len(records)} videos, skipped {skipped_videos}, "
        f"and wrote {len(extracted_records)} landmark samples to {output_path.resolve()}"
    )


def process_video(
    source_path: Path,
    label: str,
    frames_per_video: int,
    tracker: MediaPipeHandTracker,
) -> list[dict[str, object]]:
    tracker.reset()
    capture = cv2.VideoCapture(str(source_path))
    if not capture.isOpened():
        raise RuntimeError(f"Failed to open video: {source_path}")

    frames: list[np.ndarray] = []
    while True:
        success, frame = capture.read()
        if not success:
            break
        frames.append(frame)
    capture.release()

    if not frames:
        raise RuntimeError(f"Video contains no readable frames: {source_path}")

    indices = np.linspace(0, len(frames) - 1, frames_per_video).round().astype(np.int64)
    samples: list[dict[str, object]] = []
    for sample_index, frame_index in enumerate(indices, start=1):
        frame = frames[int(frame_index)]
        tracking_result = tracker.update(frame)
        if not tracking_result.landmarks:
            continue
        hand_landmarks = tracking_result.landmarks_xyz[0] if tracking_result.landmarks_xyz else tracking_result.landmarks[0]
        handedness = tracking_result.handedness[0] if tracking_result.handedness else None
        features = normalize_landmarks(
            hand_landmarks,
            bbox=tracking_result.bbox,
            handedness=handedness,
        )
        samples.append(
            {
                "label": label,
                "group": source_path.stem,
                "source_path": str(source_path),
                "frame_index": int(frame_index),
                "sample_index": sample_index,
                "handedness": handedness,
                "features": features,
            }
        )
    return samples


if __name__ == "__main__":
    main()
