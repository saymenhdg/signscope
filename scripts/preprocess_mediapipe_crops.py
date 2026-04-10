from __future__ import annotations

import argparse
from pathlib import Path
import sys

import cv2
from tqdm import tqdm

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from signlang.data import gather_video_records
from signlang.mediapipe_hands import MediaPipeHandTracker
from signlang.tracking import crop_to_bbox
from signlang.utils import ensure_dir, write_json


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Preprocess videos into MediaPipe hand-centered crops.")
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--classes", nargs="*", default=None)
    parser.add_argument("--max-videos-per-class", type=int, default=None)
    parser.add_argument("--output-size", type=int, default=256)
    parser.add_argument("--tracking-pad-scale", type=float, default=2.4)
    parser.add_argument("--min-crop-ratio", type=float, default=0.58)
    parser.add_argument("--skip-existing", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    records = gather_video_records(
        root=args.input_dir,
        classes=args.classes,
        max_per_class=args.max_videos_per_class,
    )
    output_dir = ensure_dir(args.output_dir)
    tracker = MediaPipeHandTracker(
        pad_scale=args.tracking_pad_scale,
        min_crop_ratio=args.min_crop_ratio,
    )

    stats = {
        "processed_videos": 0,
        "frames_written": 0,
        "tracked_frames": 0,
        "classes": sorted({record.label for record in records}),
    }

    try:
        for record in tqdm(records, desc="Cropping videos"):
            relative_dir = output_dir / record.label
            ensure_dir(relative_dir)
            destination = relative_dir / f"{record.path.stem}.mp4"

            if args.skip_existing and destination.exists():
                continue

            video_stats = process_video(
                source_path=record.path,
                destination_path=destination,
                tracker=tracker,
                output_size=args.output_size,
            )
            stats["processed_videos"] += 1
            stats["frames_written"] += video_stats["frames_written"]
            stats["tracked_frames"] += video_stats["tracked_frames"]
    finally:
        tracker.close()

    tracked_ratio = (
        stats["tracked_frames"] / stats["frames_written"] if stats["frames_written"] else 0.0
    )
    stats["tracked_ratio"] = tracked_ratio
    write_json(output_dir / "preprocess_stats.json", stats)
    print(
        f"Processed {stats['processed_videos']} videos, wrote {stats['frames_written']} frames, "
        f"tracked {tracked_ratio:.2%} of frames"
    )


def process_video(
    source_path: Path,
    destination_path: Path,
    tracker: MediaPipeHandTracker,
    output_size: int,
) -> dict[str, int]:
    tracker.reset()
    capture = cv2.VideoCapture(str(source_path))
    if not capture.isOpened():
        raise RuntimeError(f"Failed to open video: {source_path}")

    fps = capture.get(cv2.CAP_PROP_FPS)
    if not fps or fps <= 1.0:
        fps = 25.0

    writer = cv2.VideoWriter(
        str(destination_path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (output_size, output_size),
    )
    if not writer.isOpened():
        capture.release()
        raise RuntimeError(f"Failed to create output video: {destination_path}")

    frames_written = 0
    tracked_frames = 0

    while True:
        success, frame = capture.read()
        if not success:
            break

        tracking_result = tracker.update(frame)
        crop = crop_to_bbox(frame, tracking_result.bbox) if tracking_result.bbox is not None else frame
        resized = cv2.resize(crop, (output_size, output_size), interpolation=cv2.INTER_LINEAR)
        writer.write(resized)

        frames_written += 1
        if tracking_result.bbox is not None:
            tracked_frames += 1

    capture.release()
    writer.release()

    if frames_written == 0:
        raise RuntimeError(f"No frames were written for {source_path}")

    return {
        "frames_written": frames_written,
        "tracked_frames": tracked_frames,
    }


if __name__ == "__main__":
    main()
