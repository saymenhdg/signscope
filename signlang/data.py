from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from pathlib import Path
import random
from typing import Iterable

import cv2
import numpy as np
import torch
from sklearn.model_selection import train_test_split
from torch.utils.data import Dataset

from signlang.transforms import VideoTransform


VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}


@dataclass(frozen=True)
class VideoRecord:
    path: Path
    label: str


def gather_video_records(
    root: str | Path,
    classes: list[str] | None = None,
    max_per_class: int | None = None,
) -> list[VideoRecord]:
    root_path = Path(root)
    if not root_path.exists():
        raise FileNotFoundError(f"Dataset directory does not exist: {root_path}")

    allowed = {label.upper() for label in classes} if classes else None
    records: list[VideoRecord] = []

    for label_dir in sorted(path for path in root_path.iterdir() if path.is_dir()):
        label = label_dir.name
        if allowed and label.upper() not in allowed:
            continue

        videos = [
            path
            for path in sorted(label_dir.rglob("*"))
            if path.is_file() and path.suffix.lower() in VIDEO_EXTENSIONS
        ]
        if max_per_class is not None:
            videos = videos[:max_per_class]

        records.extend(VideoRecord(path=video_path, label=label) for video_path in videos)

    if not records:
        raise RuntimeError(f"No video files found under {root_path}")

    return records


def class_names(records: Iterable[VideoRecord]) -> list[str]:
    return sorted({record.label for record in records})


def split_records(
    records: list[VideoRecord],
    val_ratio: float,
    test_ratio: float,
    seed: int,
) -> tuple[list[VideoRecord], list[VideoRecord], list[VideoRecord]]:
    if val_ratio < 0 or test_ratio < 0 or val_ratio + test_ratio >= 1:
        raise ValueError("val_ratio and test_ratio must be >= 0 and sum to < 1")

    if len(records) < 3:
        raise ValueError("At least 3 videos are required to create train/val/test splits")

    labels = [record.label for record in records]

    if test_ratio > 0:
        train_val, test = _safe_train_test_split(records, test_ratio, labels, seed)
    else:
        train_val, test = records, []

    if val_ratio > 0:
        adjusted_val_ratio = val_ratio / (1.0 - test_ratio)
        train_labels = [record.label for record in train_val]
        train, val = _safe_train_test_split(train_val, adjusted_val_ratio, train_labels, seed)
    else:
        train, val = train_val, []

    return train, val, test


def _safe_train_test_split(
    records: list[VideoRecord],
    test_size: float,
    labels: list[str],
    seed: int,
) -> tuple[list[VideoRecord], list[VideoRecord]]:
    try:
        first, second = train_test_split(
            records,
            test_size=test_size,
            random_state=seed,
            stratify=labels,
        )
        return list(first), list(second)
    except ValueError:
        shuffled = records[:]
        random.Random(seed).shuffle(shuffled)
        pivot = max(1, min(len(shuffled) - 1, int(round(len(shuffled) * (1.0 - test_size)))))
        return shuffled[:pivot], shuffled[pivot:]


def sample_frame_indices(total_frames: int, num_frames: int, training: bool) -> np.ndarray:
    if total_frames <= 0:
        return np.zeros(num_frames, dtype=np.int64)

    if training and total_frames > num_frames:
        bounds = np.linspace(0, total_frames, num_frames + 1, dtype=np.float32)
        indices = []
        for index in range(num_frames):
            start = int(np.floor(bounds[index]))
            end = int(np.floor(bounds[index + 1]))
            start = min(start, total_frames - 1)
            end = max(start + 1, min(total_frames, end))
            indices.append(np.random.randint(start, end))
        return np.asarray(indices, dtype=np.int64)

    return np.linspace(0, total_frames - 1, num_frames).round().astype(np.int64)


def load_video_clip(path: str | Path, num_frames: int, training: bool) -> torch.Tensor:
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise RuntimeError(f"Failed to open video: {path}")

    total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    frames: list[np.ndarray] = []

    if total_frames > 0:
        indices = sample_frame_indices(total_frames, num_frames, training)
        wanted = Counter(int(idx) for idx in indices)
        current_index = 0

        while True:
            success, frame = capture.read()
            if not success:
                break
            repeat = wanted.get(current_index, 0)
            if repeat:
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                for _ in range(repeat):
                    frames.append(rgb.copy())
            current_index += 1
            if len(frames) >= num_frames:
                break

    capture.release()

    if not frames:
        frames = _decode_all_frames(path)
        if not frames:
            raise RuntimeError(f"Video contains no readable frames: {path}")
        indices = sample_frame_indices(len(frames), num_frames, training)
        frames = [frames[int(index)] for index in indices]
    elif len(frames) < num_frames:
        frames.extend([frames[-1].copy()] * (num_frames - len(frames)))

    array = np.stack(frames[:num_frames], axis=0)
    return torch.from_numpy(array).permute(0, 3, 1, 2).contiguous()


def _decode_all_frames(path: str | Path) -> list[np.ndarray]:
    capture = cv2.VideoCapture(str(path))
    decoded: list[np.ndarray] = []
    while True:
        success, frame = capture.read()
        if not success:
            break
        decoded.append(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    capture.release()
    return decoded


class SignVideoDataset(Dataset[tuple[torch.Tensor, int, str]]):
    def __init__(
        self,
        records: list[VideoRecord],
        class_to_idx: dict[str, int],
        num_frames: int,
        image_size: int,
        training: bool,
    ) -> None:
        self.records = records
        self.class_to_idx = class_to_idx
        self.num_frames = num_frames
        self.training = training
        self.transform = VideoTransform(image_size=image_size, training=training)

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, int, str]:
        attempt_index = index
        for _ in range(3):
            record = self.records[attempt_index]
            try:
                clip = load_video_clip(record.path, self.num_frames, self.training)
                clip = self.transform(clip)
                return clip, self.class_to_idx[record.label], str(record.path)
            except Exception:
                attempt_index = random.randrange(len(self.records))

        failed_record = self.records[index]
        raise RuntimeError(f"Failed to decode video after retries: {failed_record.path}")

