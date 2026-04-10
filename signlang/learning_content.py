from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np

from signlang.alphabet_landmark_data import canonical_landmarks_from_features, load_landmark_records


HAND_CONNECTIONS: list[tuple[int, int]] = [
    (0, 1),
    (1, 2),
    (2, 3),
    (3, 4),
    (0, 5),
    (5, 6),
    (6, 7),
    (7, 8),
    (5, 9),
    (9, 10),
    (10, 11),
    (11, 12),
    (9, 13),
    (13, 14),
    (14, 15),
    (15, 16),
    (13, 17),
    (17, 18),
    (18, 19),
    (19, 20),
    (0, 17),
]

ALPHABET_CUES: dict[str, str] = {
    "A": "Close the fingers into a compact fist and keep the thumb resting beside the index finger.",
    "B": "Keep four fingers straight together and fold the thumb across the palm.",
    "C": "Curve the hand into an open C shape with visible space in the center.",
    "D": "Lift the index finger up and touch the thumb to the middle finger.",
    "E": "Curl the fingertips toward the palm so the knuckles stay visible.",
    "F": "Touch the index finger to the thumb and extend the other three fingers.",
    "G": "Point the index finger and thumb sideways with a narrow gap.",
    "H": "Extend the index and middle fingers together and keep them parallel.",
    "I": "Lift the pinky and keep the remaining fingers folded.",
    "J": "Start from I, then trace the J motion slowly and clearly.",
    "K": "Raise the index and middle fingers in a V and place the thumb between them.",
    "L": "Extend the thumb and index finger into a clean right angle.",
    "M": "Fold the thumb under three fingers so the fingertips stack over it.",
    "N": "Fold the thumb under the index and middle fingers.",
    "O": "Bring every fingertip together into a rounded O.",
    "P": "Angle the K handshape downward so the fingertips point toward the floor.",
    "Q": "Angle the G handshape downward while keeping the gap visible.",
    "R": "Cross the index and middle fingers while the others stay folded.",
    "S": "Make a fist with the thumb wrapped across the front.",
    "T": "Place the thumb between the index and middle fingers.",
    "U": "Lift the index and middle fingers together with no gap between them.",
    "V": "Lift the index and middle fingers apart into a V.",
    "W": "Lift the index, middle, and ring fingers together.",
    "X": "Hook the index finger and keep the rest folded.",
    "Y": "Extend the thumb and pinky while the center fingers fold in.",
    "Z": "Draw the Z motion with the index finger in the air.",
}

WORD_LESSONS: list[dict[str, Any]] = [
    {
        "label": "HELP",
        "title": "Ask for help",
        "category": "Essentials",
        "difficulty": "starter",
        "description": "Use this when you need assistance or want to offer support.",
        "coach_tip": "Make the hand movement visible and keep both hands inside the center guide area.",
        "phrase": "PLEASE HELP",
    },
    {
        "label": "I",
        "title": "Refer to yourself",
        "category": "Essentials",
        "difficulty": "starter",
        "description": "Point back to yourself to anchor simple statements.",
        "coach_tip": "Keep the pointing motion short and finish near the chest.",
        "phrase": "I NEED HELP",
    },
    {
        "label": "NEED",
        "title": "Express a need",
        "category": "Essentials",
        "difficulty": "core",
        "description": "Useful for requests, support, and quick practical communication.",
        "coach_tip": "Hold the claw shape clearly before the downward motion finishes.",
        "phrase": "I NEED HELP",
    },
    {
        "label": "NO",
        "title": "Say no",
        "category": "Essentials",
        "difficulty": "starter",
        "description": "A compact response word that needs a clean finger closing motion.",
        "coach_tip": "Keep the pinch motion crisp so the model sees the open-close change.",
        "phrase": "NO PLEASE",
    },
    {
        "label": "PLEASE",
        "title": "Be polite",
        "category": "Conversation",
        "difficulty": "core",
        "description": "This word adds courtesy to requests and short phrases.",
        "coach_tip": "Keep the palm open and steady while the motion stays centered on the torso.",
        "phrase": "PLEASE HELP",
    },
    {
        "label": "WANT",
        "title": "Express desire",
        "category": "Conversation",
        "difficulty": "core",
        "description": "Use it when asking for an object, action, or response.",
        "coach_tip": "Start with open hands and finish by pulling inward with visible finger curl.",
        "phrase": "I WANT YES",
    },
    {
        "label": "YES",
        "title": "Confirm positively",
        "category": "Conversation",
        "difficulty": "starter",
        "description": "A reliable sign for answering and affirming simple exchanges.",
        "coach_tip": "Keep the fist clear and show the nod-like movement without leaving the frame.",
        "phrase": "YES PLEASE",
    },
]

PHRASE_DRILLS: list[dict[str, Any]] = [
    {
        "title": "Quick request",
        "phrase": "PLEASE HELP",
        "focus": "Practice calm starts and a strong finishing sign.",
    },
    {
        "title": "Personal need",
        "phrase": "I NEED HELP",
        "focus": "Keep each sign distinct and pause slightly between words.",
    },
    {
        "title": "Short answer",
        "phrase": "YES PLEASE",
        "focus": "Hold the final pose long enough for the camera to settle.",
    },
]


def alphabet_sequence(labels: list[str]) -> list[str]:
    preferred = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    present = {label.upper() for label in labels}
    ordered = [label for label in preferred if label in present]
    extras = sorted(present.difference(ordered))
    return ordered + extras


def build_alphabet_guides(records_path: str | Path) -> dict[str, dict[str, Any]]:
    grouped: dict[str, list[np.ndarray]] = defaultdict(list)
    for record in load_landmark_records(records_path):
        grouped[record.label].append(canonical_landmarks_from_features(record.features))

    guides: dict[str, dict[str, Any]] = {}
    for label in sorted(grouped):
        averaged = np.mean(np.stack(grouped[label], axis=0), axis=0)
        guides[label] = {
            "label": label,
            "cue": ALPHABET_CUES.get(label, "Keep the handshape centered and steady."),
            "motion_letter": label in {"J", "Z"},
            "guide_points": _normalize_guide_points(averaged),
        }
    return guides


def alphabet_reference_image(label: str) -> Path | None:
    reference_dir = Path("data/alphabet_frames_v1") / label.upper()
    if not reference_dir.exists():
        return None
    for extension in ("*.jpg", "*.jpeg", "*.png"):
        candidates = sorted(reference_dir.glob(extension))
        if candidates:
            return candidates[0]
    return None


def build_word_lessons() -> list[dict[str, Any]]:
    lessons: list[dict[str, Any]] = []
    for item in WORD_LESSONS:
        lesson = dict(item)
        lesson["reference_video_path"] = word_reference_video(item["label"])
        lessons.append(lesson)
    return lessons


def word_reference_video(label: str) -> Path | None:
    label = label.upper()
    candidates = [
        Path("data/core_words_45_mp") / label / "0001.mp4",
        Path("data/core_words_mp") / label / "0001.mp4",
        Path("data/sentence_words") / label / "0001.mp4",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def _normalize_guide_points(points: np.ndarray) -> list[dict[str, float]]:
    xy = points[:, :2].astype(np.float32).copy()
    min_x = float(xy[:, 0].min())
    max_x = float(xy[:, 0].max())
    min_y = float(xy[:, 1].min())
    max_y = float(xy[:, 1].max())

    center_x = (min_x + max_x) / 2.0
    center_y = (min_y + max_y) / 2.0
    side = max(max_x - min_x, max_y - min_y, 1e-5)
    normalized = (xy - np.asarray([[center_x, center_y]], dtype=np.float32)) / side

    scale = 0.7
    x_values = np.clip(0.5 + normalized[:, 0] * scale, 0.08, 0.92)
    y_values = np.clip(0.5 + normalized[:, 1] * scale, 0.08, 0.92)

    z_values = points[:, 2].astype(np.float32)
    depth_scale = max(float(np.max(np.abs(z_values))), 1e-5)
    normalized_depth = np.clip(z_values / depth_scale, -1.0, 1.0)

    return [
        {
            "x": round(float(x_values[index]), 4),
            "y": round(float(y_values[index]), 4),
            "z": round(float(normalized_depth[index]), 4),
        }
        for index in range(len(points))
    ]
