from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
import json
from math import cos, radians, sin
from pathlib import Path
import random
from typing import Sequence

import numpy as np
import torch
from torch.utils.data import Dataset


# Upper-body pose landmarks from MediaPipe Holistic (indices from mp.solutions.pose).
# We keep shoulders, elbows, wrists, hips, nose, and ears — enough for posture
# context without the noisy lower-body joints that WLASL clips rarely capture.
POSE_INDICES: tuple[int, ...] = (
    0,   # nose
    2,   # left eye
    5,   # right eye
    7,   # left ear
    8,   # right ear
    11,  # left shoulder
    12,  # right shoulder
    13,  # left elbow
    14,  # right elbow
    15,  # left wrist
    16,  # right wrist
    23,  # left hip
    24,  # right hip
)

HAND_POINTS = 21
POSE_POINTS = len(POSE_INDICES)
# Per-frame feature layout:
#   - left hand: 21 * 3 = 63
#   - right hand: 21 * 3 = 63
#   - pose (upper body): POSE_POINTS * 3
#   - presence flags: 2 (left hand, right hand)
PER_FRAME_FEATURE_DIM = HAND_POINTS * 3 * 2 + POSE_POINTS * 3 + 2

# Permutation of POSE_INDICES positions that swaps each left-right pair:
# nose(0), (l_eye 1 ↔ r_eye 2), (l_ear 3 ↔ r_ear 4), (l_sh 5 ↔ r_sh 6),
# (l_el 7 ↔ r_el 8), (l_wr 9 ↔ r_wr 10), (l_hip 11 ↔ r_hip 12).
POSE_FLIP_PERM: tuple[int, ...] = (0, 2, 1, 4, 3, 6, 5, 8, 7, 10, 9, 12, 11)


@dataclass(frozen=True)
class WordLandmarkRecord:
    """A single video clip represented as a sequence of per-frame features."""

    label: str
    group: str
    frames: tuple[tuple[float, ...], ...]
    source_path: str | None = None

    def as_array(self) -> np.ndarray:
        return np.asarray(self.frames, dtype=np.float32)


def normalize_frame(
    left_hand: Sequence[Sequence[float]] | None,
    right_hand: Sequence[Sequence[float]] | None,
    pose: Sequence[Sequence[float]] | None,
) -> np.ndarray:
    """Normalize a holistic frame to a pose-anchored canonical space.

    All coordinates are expressed relative to the shoulder midpoint and scaled
    by the shoulder width so the feature is translation- and scale-invariant.
    Missing limbs collapse to zeros and a presence flag is set accordingly.

    The input ``pose`` should be the full 33-point MediaPipe Pose landmark
    array; this function selects only the indices listed in ``POSE_INDICES``.
    """

    pose_full = _as_xyz(pose, 33, fallback_shape=(33, 3))
    pose_array = pose_full[list(POSE_INDICES)]

    if pose is not None and len(pose) > 12:
        left_shoulder = pose_full[11]
        right_shoulder = pose_full[12]
    else:
        left_shoulder = np.zeros(3, dtype=np.float32)
        right_shoulder = np.asarray([1.0, 0.0, 0.0], dtype=np.float32)

    center = (left_shoulder + right_shoulder) / 2.0
    scale = float(np.linalg.norm(right_shoulder - left_shoulder))
    if scale < 1e-3:
        scale = 1.0

    pose_normalized = (pose_array - center) / scale

    left_hand_array = _as_xyz(left_hand, HAND_POINTS, fallback_shape=(HAND_POINTS, 3))
    right_hand_array = _as_xyz(right_hand, HAND_POINTS, fallback_shape=(HAND_POINTS, 3))

    left_present = 1.0 if left_hand else 0.0
    right_present = 1.0 if right_hand else 0.0

    if left_present:
        left_hand_normalized = (left_hand_array - center) / scale
    else:
        left_hand_normalized = np.zeros_like(left_hand_array)

    if right_present:
        right_hand_normalized = (right_hand_array - center) / scale
    else:
        right_hand_normalized = np.zeros_like(right_hand_array)

    flat = np.concatenate(
        [
            left_hand_normalized.reshape(-1),
            right_hand_normalized.reshape(-1),
            pose_normalized.reshape(-1),
            np.asarray([left_present, right_present], dtype=np.float32),
        ]
    ).astype(np.float32)

    if flat.shape[0] != PER_FRAME_FEATURE_DIM:
        raise ValueError(
            f"Frame feature dim mismatch: expected {PER_FRAME_FEATURE_DIM}, got {flat.shape[0]}"
        )
    return flat


def _as_xyz(
    landmarks: Sequence[Sequence[float]] | None,
    point_count: int,
    fallback_shape: tuple[int, int],
) -> np.ndarray:
    if landmarks is None or len(landmarks) == 0:
        return np.zeros(fallback_shape, dtype=np.float32)
    points = np.asarray(
        [
            [
                float(p[0]),
                float(p[1]),
                float(p[2]) if len(p) > 2 else 0.0,
            ]
            for p in landmarks
        ],
        dtype=np.float32,
    )
    if points.shape[0] < point_count:
        padding = np.zeros((point_count - points.shape[0], 3), dtype=np.float32)
        points = np.concatenate([points, padding], axis=0)
    return points[:point_count]


def resample_sequence(sequence: np.ndarray, target_length: int) -> np.ndarray:
    """Resample a (T, F) sequence to exactly ``target_length`` frames.

    Uses nearest-neighbour index selection so features that include presence
    flags are not smeared by interpolation.
    """

    if sequence.ndim != 2:
        raise ValueError(f"Expected (T, F) sequence, got shape {sequence.shape}")
    source_length = sequence.shape[0]
    if source_length == 0:
        return np.zeros((target_length, sequence.shape[1]), dtype=np.float32)
    if source_length == target_length:
        return sequence.astype(np.float32, copy=False)
    indices = np.linspace(0, source_length - 1, target_length).round().astype(np.int64)
    return sequence[indices].astype(np.float32, copy=False)


def temporal_crop_sequence(sequence: np.ndarray, min_keep: float = 0.85) -> np.ndarray:
    """Randomly crop a contiguous sub-window from a (T, F) source sequence.

    Applied BEFORE the fixed-length resample so the model sees genuine
    temporal variation (start/end trimmed at different points across epochs).
    Uniform resampling cannot produce this on its own because it is
    idempotent under uniform scaling of source length.
    """

    if sequence.ndim != 2:
        raise ValueError(f"Expected (T, F) sequence, got shape {sequence.shape}")
    total = sequence.shape[0]
    if total <= 4:
        return sequence
    min_len = max(4, int(round(total * min_keep)))
    if min_len >= total:
        return sequence
    crop_len = int(np.random.randint(min_len, total + 1))
    max_start = total - crop_len
    start = int(np.random.randint(0, max_start + 1)) if max_start > 0 else 0
    return sequence[start : start + crop_len]


def horizontal_flip_sequence(sequence: np.ndarray) -> np.ndarray:
    """Return a left/right mirrored copy of a (T, PER_FRAME_FEATURE_DIM) sequence.

    Swaps the two hand blocks, permutes left/right pose pairs, and negates the
    x-coordinate of every landmark. Presence flags are swapped. ASL signs are
    produced equivalently by left- or right-handed signers, so mirroring
    roughly doubles the effective training distribution without re-extraction.
    """

    if sequence.ndim != 2 or sequence.shape[1] != PER_FRAME_FEATURE_DIM:
        raise ValueError(
            f"Expected (T, {PER_FRAME_FEATURE_DIM}) sequence, got {sequence.shape}"
        )

    T = sequence.shape[0]
    out = sequence.astype(np.float32, copy=True)

    left_slice = slice(0, HAND_POINTS * 3)
    right_slice = slice(HAND_POINTS * 3, HAND_POINTS * 3 * 2)
    pose_start = HAND_POINTS * 3 * 2
    pose_end = pose_start + POSE_POINTS * 3

    left_hand = out[:, left_slice].reshape(T, HAND_POINTS, 3)
    right_hand = out[:, right_slice].reshape(T, HAND_POINTS, 3)
    pose = out[:, pose_start:pose_end].reshape(T, POSE_POINTS, 3)

    new_left = right_hand.copy()
    new_right = left_hand.copy()
    new_left[:, :, 0] *= -1.0
    new_right[:, :, 0] *= -1.0

    new_pose = pose[:, list(POSE_FLIP_PERM), :].copy()
    new_pose[:, :, 0] *= -1.0

    out[:, left_slice] = new_left.reshape(T, -1)
    out[:, right_slice] = new_right.reshape(T, -1)
    out[:, pose_start:pose_end] = new_pose.reshape(T, -1)

    left_flag = out[:, pose_end].copy()
    out[:, pose_end] = out[:, pose_end + 1]
    out[:, pose_end + 1] = left_flag
    return out


def augment_sequence(sequence: np.ndarray) -> np.ndarray:
    """Apply lightweight training augmentation to a (T, F) feature sequence.

    - 50% horizontal mirror (hands + pose pairs swapped, x negated)
    - Small rotation around the shoulder center in the xy plane
    - Scale jitter
    - Gaussian jitter on xyz coordinates (presence flags are preserved)
    - Occasional time dropout: a handful of frames replaced by neighbours
    """

    augmented = sequence.astype(np.float32, copy=True)
    if augmented.size == 0:
        return augmented

    if np.random.rand() < 0.5:
        augmented = horizontal_flip_sequence(augmented)

    frames, _ = augmented.shape
    coord_slice = slice(0, PER_FRAME_FEATURE_DIM - 2)
    coords = augmented[:, coord_slice].reshape(frames, -1, 3)

    angle = radians(float(np.random.uniform(-10.0, 10.0)))
    rotation = np.asarray(
        [
            [cos(angle), -sin(angle)],
            [sin(angle), cos(angle)],
        ],
        dtype=np.float32,
    )
    scale = float(np.random.uniform(0.92, 1.08))
    coords[:, :, :2] = (coords[:, :, :2] @ rotation.T) * scale

    translation = np.random.uniform(-0.03, 0.03, size=(1, 1, 2)).astype(np.float32)
    coords[:, :, :2] += translation
    coords += np.random.normal(loc=0.0, scale=0.008, size=coords.shape).astype(np.float32)

    augmented[:, coord_slice] = coords.reshape(frames, -1)

    # Time dropout: duplicate a neighbour for ~10% of frames.
    drop_count = max(1, frames // 10)
    drop_indices = np.random.choice(frames, size=drop_count, replace=False)
    for idx in drop_indices:
        neighbour = max(0, idx - 1)
        augmented[idx] = augmented[neighbour]

    return augmented


def load_word_records(path: str | Path) -> list[WordLandmarkRecord]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    raw_records = payload["records"] if isinstance(payload, dict) else payload
    records: list[WordLandmarkRecord] = []
    for item in raw_records:
        frames = tuple(
            tuple(float(value) for value in frame) for frame in item["frames"]
        )
        records.append(
            WordLandmarkRecord(
                label=item["label"],
                group=item["group"],
                frames=frames,
                source_path=item.get("source_path"),
            )
        )
    return records


def word_class_names(records: list[WordLandmarkRecord]) -> list[str]:
    return sorted({record.label for record in records})


def word_feature_dim(records: list[WordLandmarkRecord]) -> int:
    if not records:
        raise ValueError("At least one word record is required")
    first_frame = records[0].frames[0]
    return len(first_frame)


def split_word_records(
    records: list[WordLandmarkRecord],
    val_ratio: float,
    test_ratio: float,
    seed: int,
) -> tuple[list[WordLandmarkRecord], list[WordLandmarkRecord], list[WordLandmarkRecord]]:
    if val_ratio < 0 or test_ratio < 0 or val_ratio + test_ratio >= 1:
        raise ValueError("val_ratio and test_ratio must be >= 0 and sum to < 1")
    if not records:
        raise ValueError("At least one word record is required")

    grouped: dict[str, dict[str, list[WordLandmarkRecord]]] = defaultdict(lambda: defaultdict(list))
    for record in records:
        grouped[record.label][record.group].append(record)

    train: list[WordLandmarkRecord] = []
    val: list[WordLandmarkRecord] = []
    test: list[WordLandmarkRecord] = []
    rng = random.Random(seed)

    for label, groups in sorted(grouped.items()):
        group_ids = list(groups.keys())
        if len(group_ids) < 3:
            raise ValueError(
                f"Label {label} needs at least 3 groups to create train/val/test splits (has {len(group_ids)})"
            )
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


class WordLandmarkDataset(Dataset[tuple[torch.Tensor, int]]):
    """Dataset yielding (T, F) sequences and integer class labels."""

    def __init__(
        self,
        records: list[WordLandmarkRecord],
        class_to_idx: dict[str, int],
        sequence_length: int,
        training: bool,
    ) -> None:
        self.records = records
        self.class_to_idx = class_to_idx
        self.sequence_length = sequence_length
        self.training = training

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, int]:
        record = self.records[index]
        sequence = record.as_array()
        sequence = resample_sequence(sequence, self.sequence_length)
        if self.training:
            sequence = augment_sequence(sequence)
        return torch.from_numpy(sequence.astype(np.float32)), self.class_to_idx[record.label]
