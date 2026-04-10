from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.request import urlopen

import cv2
import mediapipe as mp
import numpy as np

from signlang.tracking import BBox, _clip_bbox
from signlang.utils import ensure_dir


MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
MODEL_PATH = Path("artifacts/models/hand_landmarker.task")

HAND_CONNECTIONS = (
    tuple(mp.tasks.vision.HandLandmarksConnections.HAND_PALM_CONNECTIONS)
    + tuple(mp.tasks.vision.HandLandmarksConnections.HAND_THUMB_CONNECTIONS)
    + tuple(mp.tasks.vision.HandLandmarksConnections.HAND_INDEX_FINGER_CONNECTIONS)
    + tuple(mp.tasks.vision.HandLandmarksConnections.HAND_MIDDLE_FINGER_CONNECTIONS)
    + tuple(mp.tasks.vision.HandLandmarksConnections.HAND_RING_FINGER_CONNECTIONS)
    + tuple(mp.tasks.vision.HandLandmarksConnections.HAND_PINKY_FINGER_CONNECTIONS)
)


@dataclass
class MediaPipeTrackingResult:
    bbox: BBox | None
    score: float
    handedness: list[str]
    landmarks: list[list[tuple[int, int]]]
    landmarks_xyz: list[list[tuple[float, float, float]]]
    mode: str = "mediapipe"


class MediaPipeHandTracker:
    def __init__(
        self,
        model_path: str | Path = MODEL_PATH,
        model_url: str = MODEL_URL,
        max_num_hands: int = 2,
        min_hand_detection_confidence: float = 0.45,
        min_hand_presence_confidence: float = 0.4,
        min_tracking_confidence: float = 0.35,
        pad_scale: float = 2.1,
        min_crop_ratio: float = 0.58,
        smoothing: float = 0.6,
        persistence: int = 10,
    ) -> None:
        self.model_path = Path(model_path)
        self.model_url = model_url
        self.max_num_hands = max_num_hands
        self.pad_scale = pad_scale
        self.min_crop_ratio = min_crop_ratio
        self.smoothing = smoothing
        self.persistence = persistence
        self.missing_frames = 0
        self.previous_bbox: BBox | None = None
        self.timestamp_ms = 0

        ensure_model_asset(self.model_path, self.model_url)

        base_options = mp.tasks.BaseOptions(model_asset_path=str(self.model_path))
        options = mp.tasks.vision.HandLandmarkerOptions(
            base_options=base_options,
            running_mode=mp.tasks.vision.RunningMode.VIDEO,
            num_hands=max_num_hands,
            min_hand_detection_confidence=min_hand_detection_confidence,
            min_hand_presence_confidence=min_hand_presence_confidence,
            min_tracking_confidence=min_tracking_confidence,
        )
        self.landmarker = mp.tasks.vision.HandLandmarker.create_from_options(options)

    def close(self) -> None:
        self.landmarker.close()

    def reset(self) -> None:
        self.missing_frames = 0
        self.previous_bbox = None

    def update(self, frame_bgr: np.ndarray) -> MediaPipeTrackingResult:
        self.timestamp_ms += 33
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = self.landmarker.detect_for_video(mp_image, self.timestamp_ms)

        if not result.hand_landmarks:
            self.missing_frames += 1
            if self.previous_bbox is not None and self.missing_frames <= self.persistence:
                return MediaPipeTrackingResult(
                    bbox=self.previous_bbox,
                    score=0.0,
                    handedness=[],
                    landmarks=[],
                    landmarks_xyz=[],
                )
            self.previous_bbox = None
            return MediaPipeTrackingResult(
                bbox=None,
                score=0.0,
                handedness=[],
                landmarks=[],
                landmarks_xyz=[],
            )

        frame_height, frame_width = frame_bgr.shape[:2]
        landmark_sets: list[list[tuple[int, int]]] = []
        landmark_sets_xyz: list[list[tuple[float, float, float]]] = []
        all_points: list[tuple[int, int]] = []

        for hand_landmarks in result.hand_landmarks:
            pixel_landmarks: list[tuple[int, int]] = []
            xyz_landmarks: list[tuple[float, float, float]] = []
            for landmark in hand_landmarks:
                x = int(round(np.clip(landmark.x, 0.0, 1.0) * (frame_width - 1)))
                y = int(round(np.clip(landmark.y, 0.0, 1.0) * (frame_height - 1)))
                pixel_landmarks.append((x, y))
                xyz_landmarks.append((float(x), float(y), float(landmark.z * frame_width)))
                all_points.append((x, y))
            landmark_sets.append(pixel_landmarks)
            landmark_sets_xyz.append(xyz_landmarks)

        bbox = _bbox_from_points(
            all_points,
            frame_bgr.shape,
            self.pad_scale,
            self.min_crop_ratio,
        )
        if self.previous_bbox is not None:
            bbox = _smooth_bbox(self.previous_bbox, bbox, self.smoothing)
        self.previous_bbox = bbox
        self.missing_frames = 0

        handedness = []
        handedness_scores = []
        for categories in result.handedness:
            if categories:
                handedness.append(categories[0].category_name.upper())
                handedness_scores.append(float(categories[0].score))

        score = float(np.mean(handedness_scores)) if handedness_scores else 0.0
        return MediaPipeTrackingResult(
            bbox=bbox,
            score=score,
            handedness=handedness,
            landmarks=landmark_sets,
            landmarks_xyz=landmark_sets_xyz,
        )


def ensure_model_asset(path: str | Path, model_url: str = MODEL_URL) -> Path:
    target = Path(path)
    if target.exists():
        return target

    ensure_dir(target.parent)
    with urlopen(model_url, timeout=120) as response:
        data = response.read()
    target.write_bytes(data)
    return target


def draw_landmarks(
    frame: np.ndarray,
    tracking_result: MediaPipeTrackingResult,
) -> None:
    for hand_index, landmarks in enumerate(tracking_result.landmarks):
        for connection in HAND_CONNECTIONS:
            start = landmarks[connection.start]
            end = landmarks[connection.end]
            cv2.line(frame, start, end, (0, 255, 0), 2, cv2.LINE_AA)

        for point in landmarks:
            cv2.circle(frame, point, 4, (0, 0, 255), thickness=-1, lineType=cv2.LINE_AA)
            cv2.circle(frame, point, 7, (255, 255, 255), thickness=1, lineType=cv2.LINE_AA)

        if hand_index < len(tracking_result.handedness):
            label = tracking_result.handedness[hand_index]
            label_point = landmarks[0]
            cv2.putText(
                frame,
                label,
                (label_point[0] + 8, max(25, label_point[1] - 10)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.65,
                (80, 255, 80),
                2,
                cv2.LINE_AA,
            )


def _bbox_from_points(
    points: list[tuple[int, int]],
    frame_shape: tuple[int, ...],
    pad_scale: float,
    min_crop_ratio: float,
) -> BBox:
    frame_height, frame_width = frame_shape[:2]
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    x0 = min(xs)
    y0 = min(ys)
    x1 = max(xs)
    y1 = max(ys)

    width = max(1, x1 - x0)
    height = max(1, y1 - y0)
    side = max(
        int(round(max(width, height) * pad_scale)),
        int(round(min(frame_height, frame_width) * min_crop_ratio)),
    )
    center_x = (x0 + x1) / 2.0
    center_y = (y0 + y1) / 2.0

    bbox = (
        int(round(center_x - side / 2.0)),
        int(round(center_y - side / 2.0)),
        side,
        side,
    )
    return _clip_bbox(bbox, frame_shape)


def _smooth_bbox(previous: BBox, current: BBox, alpha: float) -> BBox:
    return tuple(
        int(round(alpha * prev_value + (1.0 - alpha) * curr_value))
        for prev_value, curr_value in zip(previous, current)
    )
