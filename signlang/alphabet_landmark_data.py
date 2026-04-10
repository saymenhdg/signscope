from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
import json
from pathlib import Path
import random
from math import cos, radians, sin
from typing import Sequence

import numpy as np
import torch
from torch.utils.data import Dataset


TIP_INDICES = [4, 8, 12, 16, 20]
FINGER_TRIPLETS = [
    (0, 1, 2),
    (1, 2, 3),
    (2, 3, 4),
    (0, 5, 6),
    (5, 6, 7),
    (6, 7, 8),
    (0, 9, 10),
    (9, 10, 11),
    (10, 11, 12),
    (0, 13, 14),
    (13, 14, 15),
    (14, 15, 16),
    (0, 17, 18),
    (17, 18, 19),
    (18, 19, 20),
]


@dataclass(frozen=True)
class LandmarkRecord:
    label: str
    group: str
    features: tuple[float, ...]
    source_path: str | None = None


def normalize_landmarks(
    landmarks: Sequence[Sequence[float]],
    bbox: tuple[int, int, int, int] | None = None,
    handedness: str | None = None,
) -> list[float]:
    if not landmarks:
        raise ValueError("Cannot normalize an empty landmark list")

    points = np.asarray(
        [
            [
                float(point[0]),
                float(point[1]),
                float(point[2]) if len(point) > 2 else 0.0,
            ]
            for point in landmarks
        ],
        dtype=np.float32,
    )

    if bbox is None:
        x = float(points[:, 0].min())
        y = float(points[:, 1].min())
        width = max(1.0, float(points[:, 0].max() - x))
        height = max(1.0, float(points[:, 1].max() - y))
    else:
        x, y, width, height = bbox
        x = float(x)
        y = float(y)
        width = max(1.0, float(width))
        height = max(1.0, float(height))

    side = float(max(width, height, 1.0))
    center_x = x + width / 2.0
    center_y = y + height / 2.0

    canonical = points.copy()
    if handedness and handedness.upper().startswith("LEFT"):
        canonical[:, 0] = (2.0 * center_x) - canonical[:, 0]

    canonical[:, 0] = (canonical[:, 0] - center_x) / side
    canonical[:, 1] = (canonical[:, 1] - center_y) / side
    canonical[:, 2] = canonical[:, 2] / side

    return build_feature_vector(canonical).tolist()


def build_feature_vector(canonical: np.ndarray) -> np.ndarray:
    wrist_relative = canonical - canonical[0]

    pairwise_distances: list[float] = []
    for index in range(len(wrist_relative) - 1):
        deltas = wrist_relative[index + 1 :] - wrist_relative[index]
        pairwise_distances.extend(np.linalg.norm(deltas, axis=1).tolist())

    fingertip_distances: list[float] = []
    for start in range(len(TIP_INDICES) - 1):
        first_tip = wrist_relative[TIP_INDICES[start]]
        for end in range(start + 1, len(TIP_INDICES)):
            second_tip = wrist_relative[TIP_INDICES[end]]
            fingertip_distances.append(float(np.linalg.norm(first_tip - second_tip)))

    joint_angles = [compute_joint_angle(wrist_relative[a], wrist_relative[b], wrist_relative[c]) for a, b, c in FINGER_TRIPLETS]

    feature_vector = np.concatenate(
        [
            canonical.reshape(-1),
            wrist_relative.reshape(-1),
            np.asarray(pairwise_distances, dtype=np.float32),
            np.asarray(fingertip_distances, dtype=np.float32),
            np.asarray(joint_angles, dtype=np.float32),
        ]
    )
    return feature_vector.astype(np.float32)


def canonical_landmarks_from_features(features: Sequence[float]) -> np.ndarray:
    values = np.asarray(features, dtype=np.float32)
    if values.size < 63:
        raise ValueError("Expected at least 63 values to reconstruct canonical landmarks")
    return values[:63].reshape(21, 3).copy()


def augment_canonical_landmarks(canonical: np.ndarray) -> np.ndarray:
    augmented = canonical.astype(np.float32).copy()

    angle = radians(float(np.random.uniform(-12.0, 12.0)))
    scale = float(np.random.uniform(0.92, 1.08))
    rotation = np.asarray(
        [
            [cos(angle), -sin(angle)],
            [sin(angle), cos(angle)],
        ],
        dtype=np.float32,
    )
    augmented[:, :2] = (augmented[:, :2] @ rotation.T) * scale

    axis_scale = np.asarray(
        [
            float(np.random.uniform(0.95, 1.05)),
            float(np.random.uniform(0.95, 1.05)),
        ],
        dtype=np.float32,
    )
    augmented[:, :2] *= axis_scale

    translation = np.random.uniform(-0.04, 0.04, size=(1, 2)).astype(np.float32)
    augmented[:, :2] += translation
    augmented[:, :2] += np.random.normal(loc=0.0, scale=0.01, size=(augmented.shape[0], 2)).astype(np.float32)

    augmented[:, 2] *= float(np.random.uniform(0.9, 1.1))
    augmented[:, 2] += np.random.normal(loc=0.0, scale=0.01, size=augmented.shape[0]).astype(np.float32)

    return augmented


def compute_joint_angle(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    first = a - b
    second = c - b
    first_norm = float(np.linalg.norm(first))
    second_norm = float(np.linalg.norm(second))
    if first_norm < 1e-6 or second_norm < 1e-6:
        return 0.0
    cosine = float(np.dot(first, second) / (first_norm * second_norm))
    return float(np.clip(cosine, -1.0, 1.0))


def load_landmark_records(path: str | Path) -> list[LandmarkRecord]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    raw_records = payload["records"] if isinstance(payload, dict) else payload
    return [
        LandmarkRecord(
            label=item["label"],
            group=item["group"],
            features=tuple(float(value) for value in item["features"]),
            source_path=item.get("source_path"),
        )
        for item in raw_records
    ]


def class_names(records: list[LandmarkRecord]) -> list[str]:
    return sorted({record.label for record in records})


def feature_dim(records: list[LandmarkRecord]) -> int:
    if not records:
        raise ValueError("At least one landmark record is required")
    return len(records[0].features)


def split_landmark_records(
    records: list[LandmarkRecord],
    val_ratio: float,
    test_ratio: float,
    seed: int,
) -> tuple[list[LandmarkRecord], list[LandmarkRecord], list[LandmarkRecord]]:
    if val_ratio < 0 or test_ratio < 0 or val_ratio + test_ratio >= 1:
        raise ValueError("val_ratio and test_ratio must be >= 0 and sum to < 1")
    if not records:
        raise ValueError("At least one landmark record is required")

    grouped_records: dict[str, dict[str, list[LandmarkRecord]]] = defaultdict(lambda: defaultdict(list))
    for record in records:
        grouped_records[record.label][record.group].append(record)

    train: list[LandmarkRecord] = []
    val: list[LandmarkRecord] = []
    test: list[LandmarkRecord] = []
    rng = random.Random(seed)

    for label, groups in sorted(grouped_records.items()):
        group_ids = list(groups.keys())
        if len(group_ids) < 3:
            raise ValueError(f"Label {label} needs at least 3 groups to create train/val/test splits")
        rng.shuffle(group_ids)

        test_count = _split_count(len(group_ids), test_ratio)
        val_count = _split_count(len(group_ids), val_ratio)
        if test_count + val_count >= len(group_ids):
            raise ValueError(f"Split ratios leave no training groups for label {label}")

        test_groups = set(group_ids[:test_count])
        val_groups = set(group_ids[test_count : test_count + val_count])

        for group_id, group_records in groups.items():
            if group_id in test_groups:
                test.extend(group_records)
            elif group_id in val_groups:
                val.extend(group_records)
            else:
                train.extend(group_records)

    rng.shuffle(train)
    rng.shuffle(val)
    rng.shuffle(test)
    return train, val, test


def _split_count(total_groups: int, ratio: float) -> int:
    if ratio <= 0:
        return 0
    return max(1, int(round(total_groups * ratio)))


class AlphabetLandmarkDataset(Dataset[tuple[torch.Tensor, int]]):
    def __init__(
        self,
        records: list[LandmarkRecord],
        class_to_idx: dict[str, int],
        training: bool,
    ) -> None:
        self.records = records
        self.class_to_idx = class_to_idx
        self.training = training

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, int]:
        record = self.records[index]
        if self.training:
            canonical = canonical_landmarks_from_features(record.features)
            canonical = augment_canonical_landmarks(canonical)
            features = build_feature_vector(canonical)
        else:
            features = np.asarray(record.features, dtype=np.float32).copy()

        return torch.from_numpy(features.astype(np.float32)), self.class_to_idx[record.label]
