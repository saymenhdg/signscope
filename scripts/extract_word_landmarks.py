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

import mediapipe as mp

from signlang.data import gather_video_records
from signlang.mediapipe_hands import ensure_model_asset
from signlang.utils import ensure_dir, write_json
from signlang.word_landmark_data import PER_FRAME_FEATURE_DIM, normalize_frame


HAND_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
HAND_MODEL_PATH = Path("artifacts/models/hand_landmarker.task")
POSE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
POSE_MODEL_PATH = Path("artifacts/models/pose_landmarker_lite.task")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract per-frame hand + pose landmarks for word recognition."
    )
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--output-path", default="data/word_landmarks_v1/records.json")
    parser.add_argument("--classes", nargs="*", default=None)
    parser.add_argument("--max-videos-per-class", type=int, default=None)
    parser.add_argument("--frames-per-video", type=int, default=32)
    parser.add_argument("--min-detection-confidence", type=float, default=0.5)
    parser.add_argument("--min-tracking-confidence", type=float, default=0.5)
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

    ensure_model_asset(HAND_MODEL_PATH, HAND_MODEL_URL)
    ensure_model_asset(POSE_MODEL_PATH, POSE_MODEL_URL)

    hand_options = mp.tasks.vision.HandLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(HAND_MODEL_PATH)),
        running_mode=mp.tasks.vision.RunningMode.VIDEO,
        num_hands=2,
        min_hand_detection_confidence=args.min_detection_confidence,
        min_hand_presence_confidence=args.min_detection_confidence,
        min_tracking_confidence=args.min_tracking_confidence,
    )
    pose_options = mp.tasks.vision.PoseLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(POSE_MODEL_PATH)),
        running_mode=mp.tasks.vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=args.min_detection_confidence,
        min_pose_presence_confidence=args.min_detection_confidence,
        min_tracking_confidence=args.min_tracking_confidence,
    )

    extracted_records: list[dict[str, object]] = []
    skipped_videos = 0
    # Tasks VIDEO mode requires monotonically increasing timestamps across
    # the whole session, not just within a single video. Hoist the counter
    # to main() and advance it through every detect_for_video call.
    timestamp_state = [0]

    with (
        mp.tasks.vision.HandLandmarker.create_from_options(hand_options) as hand_landmarker,
        mp.tasks.vision.PoseLandmarker.create_from_options(pose_options) as pose_landmarker,
    ):
        for record in tqdm(records, desc="Extracting word landmarks"):
            try:
                sequence = process_video(
                    source_path=record.path,
                    frames_per_video=args.frames_per_video,
                    hand_landmarker=hand_landmarker,
                    pose_landmarker=pose_landmarker,
                    timestamp_state=timestamp_state,
                )
            except RuntimeError as exc:
                print(f"Skipping {record.path.name}: {exc}")
                skipped_videos += 1
                continue

            if sequence is None:
                skipped_videos += 1
                continue

            extracted_records.append(
                {
                    "label": record.label,
                    "group": record.path.stem,
                    "source_path": str(record.path),
                    "frames": [frame.tolist() for frame in sequence],
                }
            )

    write_json(
        output_path,
        {
            "classes": sorted({record.label for record in records}),
            "frames_per_video": args.frames_per_video,
            "feature_dim": PER_FRAME_FEATURE_DIM,
            "processed_videos": len(records),
            "skipped_videos": skipped_videos,
            "records": extracted_records,
        },
    )
    print(
        f"Processed {len(records)} videos, skipped {skipped_videos}, "
        f"wrote {len(extracted_records)} sequences to {output_path.resolve()}"
    )


def process_video(
    source_path: Path,
    frames_per_video: int,
    hand_landmarker,
    pose_landmarker,
    timestamp_state: list[int],
) -> np.ndarray | None:
    capture = cv2.VideoCapture(str(source_path))
    if not capture.isOpened():
        raise RuntimeError(f"Failed to open video: {source_path}")

    raw_frames: list[np.ndarray] = []
    while True:
        success, frame = capture.read()
        if not success:
            break
        raw_frames.append(frame)
    capture.release()

    if not raw_frames:
        raise RuntimeError(f"Video contains no readable frames: {source_path}")

    indices = np.linspace(0, len(raw_frames) - 1, frames_per_video).round().astype(np.int64)
    features: list[np.ndarray] = []
    valid_frames = 0
    for frame_index in indices:
        frame = raw_frames[int(frame_index)]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        timestamp_state[0] += 33
        timestamp_ms = timestamp_state[0]
        hand_result = hand_landmarker.detect_for_video(mp_image, timestamp_ms)
        pose_result = pose_landmarker.detect_for_video(mp_image, timestamp_ms)

        left_hand, right_hand = _split_hands(hand_result)
        pose = _pose_points(pose_result)

        if pose is None and left_hand is None and right_hand is None:
            features.append(np.zeros(PER_FRAME_FEATURE_DIM, dtype=np.float32))
            continue

        valid_frames += 1
        features.append(normalize_frame(left_hand, right_hand, pose))

    if valid_frames == 0:
        return None
    return np.stack(features, axis=0)


def _split_hands(hand_result) -> tuple[list[list[float]] | None, list[list[float]] | None]:
    left: list[list[float]] | None = None
    right: list[list[float]] | None = None
    if not hand_result or not hand_result.hand_landmarks:
        return left, right
    for hand_points, categories in zip(hand_result.hand_landmarks, hand_result.handedness):
        if not categories:
            continue
        label = categories[0].category_name.upper()
        points = [[float(p.x), float(p.y), float(p.z)] for p in hand_points]
        if label.startswith("LEFT") and left is None:
            left = points
        elif label.startswith("RIGHT") and right is None:
            right = points
        elif left is None:
            left = points
        elif right is None:
            right = points
    return left, right


def _pose_points(pose_result) -> list[list[float]] | None:
    if not pose_result or not pose_result.pose_landmarks:
        return None
    first_pose = pose_result.pose_landmarks[0]
    return [[float(p.x), float(p.y), float(p.z)] for p in first_pose]


if __name__ == "__main__":
    main()
