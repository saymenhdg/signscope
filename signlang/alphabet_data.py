from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import random
from typing import Iterable

import cv2
import numpy as np
import torch
from sklearn.model_selection import train_test_split
from torch.utils.data import Dataset

from signlang.alphabet_transforms import AlphabetImageTransform


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


@dataclass(frozen=True)
class ImageRecord:
    path: Path
    label: str


def gather_image_records(
    root: str | Path,
    classes: list[str] | None = None,
    max_per_class: int | None = None,
) -> list[ImageRecord]:
    root_path = Path(root)
    if not root_path.exists():
        raise FileNotFoundError(f"Dataset directory does not exist: {root_path}")

    allowed = {label.upper() for label in classes} if classes else None
    records: list[ImageRecord] = []

    for label_dir in sorted(path for path in root_path.iterdir() if path.is_dir()):
        label = label_dir.name
        if allowed and label.upper() not in allowed:
            continue

        images = [
            path
            for path in sorted(label_dir.rglob("*"))
            if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
        ]
        if max_per_class is not None:
            images = images[:max_per_class]
        records.extend(ImageRecord(path=image_path, label=label) for image_path in images)

    if not records:
        raise RuntimeError(f"No image files found under {root_path}")

    return records


def class_names(records: Iterable[ImageRecord]) -> list[str]:
    return sorted({record.label for record in records})


def split_records(
    records: list[ImageRecord],
    val_ratio: float,
    test_ratio: float,
    seed: int,
) -> tuple[list[ImageRecord], list[ImageRecord], list[ImageRecord]]:
    if val_ratio < 0 or test_ratio < 0 or val_ratio + test_ratio >= 1:
        raise ValueError("val_ratio and test_ratio must be >= 0 and sum to < 1")

    if len(records) < 3:
        raise ValueError("At least 3 images are required to create train/val/test splits")

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
    records: list[ImageRecord],
    test_size: float,
    labels: list[str],
    seed: int,
) -> tuple[list[ImageRecord], list[ImageRecord]]:
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


def load_image(path: str | Path) -> torch.Tensor:
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError(f"Failed to read image: {path}")
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    return torch.from_numpy(np.ascontiguousarray(rgb)).permute(2, 0, 1).contiguous()


class AlphabetImageDataset(Dataset[tuple[torch.Tensor, int, str]]):
    def __init__(
        self,
        records: list[ImageRecord],
        class_to_idx: dict[str, int],
        image_size: int,
        training: bool,
    ) -> None:
        self.records = records
        self.class_to_idx = class_to_idx
        self.training = training
        self.transform = AlphabetImageTransform(image_size=image_size, training=training)

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, int, str]:
        attempt_index = index
        for _ in range(3):
            record = self.records[attempt_index]
            try:
                image = load_image(record.path)
                image = self.transform(image)
                return image, self.class_to_idx[record.label], str(record.path)
            except Exception:
                attempt_index = random.randrange(len(self.records))

        failed_record = self.records[index]
        raise RuntimeError(f"Failed to decode image after retries: {failed_record.path}")
