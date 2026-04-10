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

from signlang.data import gather_video_records
from signlang.mediapipe_hands import MediaPipeHandTracker
from signlang.tracking import crop_to_bbox
from signlang.utils import ensure_dir, write_json


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract hand-centered alphabet frame crops from sign videos.")
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--classes", nargs="*", default=None)
    parser.add_argument("--max-videos-per-class", type=int, default=None)
    parser.add_argument("--frames-per-video", type=int, default=8)
    parser.add_argument("--output-size", type=int, default=224)
    parser.add_argument("--tracking-pad-scale", type=float, default=2.2)
    parser.add_argument("--min-crop-ratio", type=float, default=0.52)
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
        max_num_hands=1,
        pad_scale=args.tracking_pad_scale,
        min_crop_ratio=args.min_crop_ratio,
    )

    stats = {
        "processed_videos": 0,
        "images_written": 0,
        "classes": sorted({record.label for record in records}),
        "frames_per_video": args.frames_per_video,
    }

    try:
        for record in tqdm(records, desc="Extracting alphabet frames"):
            destination_dir = ensure_dir(output_dir / record.label)
            expected_files = [
                destination_dir / f"{record.path.stem}_{index + 1:02d}.jpg"
                for index in range(args.frames_per_video)
            ]
            if args.skip_existing and all(path.exists() for path in expected_files):
                continue

            image_count = process_video(
                source_path=record.path,
                destination_dir=destination_dir,
                tracker=tracker,
                frames_per_video=args.frames_per_video,
                output_size=args.output_size,
            )
            stats["processed_videos"] += 1
            stats["images_written"] += image_count
    finally:
        tracker.close()

    write_json(output_dir / "extract_stats.json", stats)
    print(
        f"Processed {stats['processed_videos']} videos and wrote "
        f"{stats['images_written']} images to {output_dir.resolve()}"
    )


def process_video(
    source_path: Path,
    destination_dir: Path,
    tracker: MediaPipeHandTracker,
    frames_per_video: int,
    output_size: int,
) -> int:
    tracker.reset()
    capture = cv2.VideoCapture(str(source_path))
    if not capture.isOpened():
        raise RuntimeError(f"Failed to open video: {source_path}")

    crops: list[np.ndarray] = []
    while True:
        success, frame = capture.read()
        if not success:
            break
        tracking_result = tracker.update(frame)
        crop = crop_to_bbox(frame, tracking_result.bbox) if tracking_result.bbox is not None else frame
        crops.append(cv2.resize(crop, (output_size, output_size), interpolation=cv2.INTER_LINEAR))

    capture.release()
    if not crops:
        raise RuntimeError(f"No frames extracted for {source_path}")

    indices = np.linspace(0, len(crops) - 1, frames_per_video).round().astype(np.int64)
    for output_index, frame_index in enumerate(indices, start=1):
        destination = destination_dir / f"{source_path.stem}_{output_index:02d}.jpg"
        cv2.imwrite(str(destination), crops[int(frame_index)])

    return len(indices)


if __name__ == "__main__":
    main()
