from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


BBox = tuple[int, int, int, int]


@dataclass
class TrackingResult:
    bbox: BBox | None
    score: float
    mode: str


class MotionHandTracker:
    def __init__(
        self,
        pad_scale: float = 2.2,
        min_area_ratio: float = 0.0025,
        smoothing: float = 0.65,
        persistence: int = 12,
    ) -> None:
        self.pad_scale = pad_scale
        self.min_area_ratio = min_area_ratio
        self.smoothing = smoothing
        self.persistence = persistence
        self.previous_gray: np.ndarray | None = None
        self.previous_bbox: BBox | None = None
        self.missing_frames = 0
        self.face_detector = _load_face_detector()

    def reset(self) -> None:
        self.previous_gray = None
        self.previous_bbox = None
        self.missing_frames = 0

    def update(self, frame: np.ndarray) -> TrackingResult:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (7, 7), 0)
        if self.previous_gray is None:
            self.previous_gray = gray
            return TrackingResult(bbox=None, score=0.0, mode="full")

        diff = cv2.absdiff(gray, self.previous_gray)
        self.previous_gray = gray

        _, diff_mask = cv2.threshold(diff, 18, 255, cv2.THRESH_BINARY)
        diff_mask = cv2.medianBlur(diff_mask, 5)
        skin_mask = _skin_mask(frame)

        combined = cv2.bitwise_and(diff_mask, skin_mask)
        if cv2.countNonZero(combined) < 400:
            combined = diff_mask

        combined = _remove_faces(combined, gray, self.face_detector)
        kernel = np.ones((5, 5), dtype=np.uint8)
        combined = cv2.morphologyEx(combined, cv2.MORPH_OPEN, kernel, iterations=1)
        combined = cv2.dilate(combined, kernel, iterations=2)

        contours, _ = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        frame_area = frame.shape[0] * frame.shape[1]
        min_area = frame_area * self.min_area_ratio
        candidates = [contour for contour in contours if cv2.contourArea(contour) >= min_area]

        if not candidates:
            self.missing_frames += 1
            if self.previous_bbox and self.missing_frames <= self.persistence:
                return TrackingResult(bbox=self.previous_bbox, score=0.0, mode="hold")
            self.previous_bbox = None
            return TrackingResult(bbox=None, score=0.0, mode="full")

        candidates = sorted(candidates, key=cv2.contourArea, reverse=True)[:2]
        x0, y0, x1, y1 = _union_rect(candidates)
        detected_bbox = _expand_to_square((x0, y0, x1 - x0, y1 - y0), frame.shape, self.pad_scale)
        if self.previous_bbox is not None:
            detected_bbox = _smooth_bbox(self.previous_bbox, detected_bbox, self.smoothing)

        self.previous_bbox = detected_bbox
        self.missing_frames = 0
        area_score = min(1.0, sum(cv2.contourArea(contour) for contour in candidates) / (frame_area * 0.06))
        return TrackingResult(bbox=detected_bbox, score=area_score, mode="motion")


class TemplateHandTracker:
    def __init__(
        self,
        search_scale: float = 1.8,
        smoothing: float = 0.55,
        min_match: float = 0.35,
        update_rate: float = 0.15,
    ) -> None:
        self.search_scale = search_scale
        self.smoothing = smoothing
        self.min_match = min_match
        self.update_rate = update_rate
        self.template: np.ndarray | None = None
        self.bbox: BBox | None = None

    @property
    def active(self) -> bool:
        return self.template is not None and self.bbox is not None

    def reset(self) -> None:
        self.template = None
        self.bbox = None

    def initialize(self, frame: np.ndarray, bbox: BBox) -> None:
        clipped_bbox = _clip_bbox(bbox, frame.shape)
        patch = crop_to_bbox(frame, clipped_bbox)
        if patch.size == 0:
            raise ValueError("Selected ROI is empty")
        self.template = cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY)
        self.template = cv2.GaussianBlur(self.template, (5, 5), 0)
        self.bbox = clipped_bbox

    def update(self, frame: np.ndarray) -> TrackingResult:
        if not self.active:
            return TrackingResult(bbox=None, score=0.0, mode="off")

        assert self.template is not None
        assert self.bbox is not None

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (5, 5), 0)

        search_bbox = _expand_bbox(self.bbox, frame.shape, self.search_scale)
        search_region = crop_to_bbox(gray, search_bbox)
        template_height, template_width = self.template.shape[:2]
        if (
            search_region.shape[0] < template_height
            or search_region.shape[1] < template_width
        ):
            return TrackingResult(bbox=self.bbox, score=0.0, mode="manual")

        response = cv2.matchTemplate(search_region, self.template, cv2.TM_CCOEFF_NORMED)
        _min_val, max_val, _min_loc, max_loc = cv2.minMaxLoc(response)

        if max_val < self.min_match:
            return TrackingResult(bbox=self.bbox, score=float(max_val), mode="manual")

        x, y, width, height = search_bbox
        candidate_bbox = (
            x + max_loc[0],
            y + max_loc[1],
            template_width,
            template_height,
        )
        candidate_bbox = _clip_bbox(candidate_bbox, frame.shape)
        smoothed_bbox = _smooth_bbox(self.bbox, candidate_bbox, self.smoothing)
        self.bbox = smoothed_bbox

        patch = crop_to_bbox(gray, smoothed_bbox)
        if patch.shape == self.template.shape:
            self.template = cv2.addWeighted(
                self.template,
                1.0 - self.update_rate,
                patch,
                self.update_rate,
                0.0,
            )

        return TrackingResult(bbox=smoothed_bbox, score=float(max_val), mode="manual")


def crop_to_bbox(frame: np.ndarray, bbox: BBox) -> np.ndarray:
    x, y, width, height = bbox
    return frame[y : y + height, x : x + width]


def _clip_bbox(bbox: BBox, frame_shape: tuple[int, ...]) -> BBox:
    frame_height, frame_width = frame_shape[:2]
    x, y, width, height = bbox
    x = max(0, min(x, frame_width - 1))
    y = max(0, min(y, frame_height - 1))
    width = max(1, min(width, frame_width - x))
    height = max(1, min(height, frame_height - y))
    return int(x), int(y), int(width), int(height)


def _expand_bbox(bbox: BBox, frame_shape: tuple[int, ...], scale: float) -> BBox:
    x, y, width, height = bbox
    cx = x + width / 2.0
    cy = y + height / 2.0
    new_width = int(round(width * scale))
    new_height = int(round(height * scale))
    new_x = int(round(cx - new_width / 2.0))
    new_y = int(round(cy - new_height / 2.0))
    return _clip_bbox((new_x, new_y, new_width, new_height), frame_shape)


def _expand_to_square(bbox: BBox, frame_shape: tuple[int, ...], scale: float) -> BBox:
    x, y, width, height = bbox
    side = max(width, height)
    side = int(round(side * scale))
    cx = x + width / 2.0
    cy = y + height / 2.0
    square_bbox = (
        int(round(cx - side / 2.0)),
        int(round(cy - side / 2.0)),
        side,
        side,
    )
    return _clip_bbox(square_bbox, frame_shape)


def _smooth_bbox(previous: BBox, current: BBox, alpha: float) -> BBox:
    return tuple(
        int(round(alpha * prev_value + (1.0 - alpha) * curr_value))
        for prev_value, curr_value in zip(previous, current)
    )


def _union_rect(contours: list[np.ndarray]) -> tuple[int, int, int, int]:
    x0 = min(cv2.boundingRect(contour)[0] for contour in contours)
    y0 = min(cv2.boundingRect(contour)[1] for contour in contours)
    x1 = max(cv2.boundingRect(contour)[0] + cv2.boundingRect(contour)[2] for contour in contours)
    y1 = max(cv2.boundingRect(contour)[1] + cv2.boundingRect(contour)[3] for contour in contours)
    return x0, y0, x1, y1


def _skin_mask(frame: np.ndarray) -> np.ndarray:
    ycrcb = cv2.cvtColor(frame, cv2.COLOR_BGR2YCrCb)
    lower = np.array([0, 133, 77], dtype=np.uint8)
    upper = np.array([255, 173, 127], dtype=np.uint8)
    mask = cv2.inRange(ycrcb, lower, upper)
    kernel = np.ones((3, 3), dtype=np.uint8)
    return cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)


def _load_face_detector() -> cv2.CascadeClassifier | None:
    cascade_path = Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"
    detector = cv2.CascadeClassifier(str(cascade_path))
    if detector.empty():
        return None
    return detector


def _remove_faces(
    mask: np.ndarray,
    gray: np.ndarray,
    detector: cv2.CascadeClassifier | None,
) -> np.ndarray:
    if detector is None:
        return mask

    faces = detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))
    if len(faces) == 0:
        return mask

    masked = mask.copy()
    for x, y, width, height in faces:
        pad_x = int(width * 0.15)
        pad_y = int(height * 0.15)
        x0 = max(0, x - pad_x)
        y0 = max(0, y - pad_y)
        x1 = min(mask.shape[1], x + width + pad_x)
        y1 = min(mask.shape[0], y + height + pad_y)
        masked[y0:y1, x0:x1] = 0
    return masked

