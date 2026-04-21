from __future__ import annotations

from collections import defaultdict
from functools import lru_cache
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

WORD_LESSON_TEMPLATE_MAP: dict[str, dict[str, Any]] = {
    str(item["label"]).upper(): dict(item) for item in WORD_LESSONS
}

DEFAULT_WORD_REFERENCE_ROOTS: tuple[str, ...] = (
    r"C:\Users\15047\Desktop\aslwords",
    "data/core_words_45_mp",
    "data/core_words_mp",
    "data/sentence_words",
)

PHRASE_DRILLS: list[dict[str, Any]] = [
    {
        "title": "Polite request",
        "phrase": "PLEASE COME",
        "focus": "Keep the first sign relaxed, then make the motion on COME finish cleanly toward the body.",
    },
    {
        "title": "Daily check-in",
        "phrase": "HOW YOU",
        "focus": "Keep the transition between the question sign and the pointing sign deliberate and readable.",
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


def alphabet_reference_video(label: str) -> Path | None:
    label = label.upper()
    candidates = [
        Path("asl references") / f"{label}.mp4",
        Path("data/alphabet_videos") / f"{label}.mp4",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def build_word_lessons(
    *,
    allowed_labels: list[str] | None = None,
    reference_roots: tuple[str, ...] = DEFAULT_WORD_REFERENCE_ROOTS,
) -> list[dict[str, Any]]:
    roots = tuple(str(root) for root in reference_roots)
    available = _word_reference_index(roots)

    if allowed_labels:
        labels = sorted({str(label).upper() for label in allowed_labels if str(label).upper() in available})
    else:
        labels = sorted(available)

    if not labels:
        labels = [str(item["label"]).upper() for item in WORD_LESSONS]

    lessons: list[dict[str, Any]] = []
    for label in labels:
        lesson = dict(_word_lesson_metadata(label))
        lesson["reference_video_path"] = word_reference_video(label, reference_roots=roots)
        lessons.append(lesson)
    return lessons


def word_reference_video(
    label: str,
    *,
    reference_roots: tuple[str, ...] = DEFAULT_WORD_REFERENCE_ROOTS,
) -> Path | None:
    return _word_reference_index(tuple(str(root) for root in reference_roots)).get(label.upper())


@lru_cache(maxsize=4)
def _word_reference_index(reference_roots: tuple[str, ...]) -> dict[str, Path]:
    index: dict[str, Path] = {}
    for root_value in reference_roots:
        root = Path(root_value)
        if not root.exists():
            continue

        if root.is_file() and root.suffix.lower() == ".mp4":
            index.setdefault(root.stem.upper(), root)
            continue

        for child in root.iterdir():
            if child.is_file() and child.suffix.lower() == ".mp4":
                index.setdefault(child.stem.upper(), child)
                continue

            if child.is_dir():
                nested = child / "0001.mp4"
                if nested.exists():
                    index.setdefault(child.name.upper(), nested)
                    continue

                first_clip = next(
                    (item for item in sorted(child.iterdir()) if item.is_file() and item.suffix.lower() == ".mp4"),
                    None,
                )
                if first_clip is not None:
                    index.setdefault(child.name.upper(), first_clip)
    return index


def _word_lesson_metadata(label: str) -> dict[str, Any]:
    template = WORD_LESSON_TEMPLATE_MAP.get(label.upper())
    if template is not None:
        return template

    pretty = _humanize_word_label(label)
    return {
        "label": label.upper(),
        "title": pretty,
        "category": _word_category(label),
        "difficulty": _word_difficulty(label),
        "description": f"Practice {pretty.lower()} as part of short ASL phrases and everyday communication drills.",
        "coach_tip": "Keep the handshape readable, stay centered in frame, and hold the ending position for a beat.",
        "phrase": _word_phrase_hint(label),
    }


def _humanize_word_label(label: str) -> str:
    words = str(label).replace("_", " ").split()
    if not words:
        return str(label).upper()
    return " ".join(word if word == "I" else word.capitalize() for word in words)


def _word_category(label: str) -> str:
    label = label.upper()
    if label in {"WHAT", "WHEN", "WHERE", "WHO", "WHY", "HOW"}:
        return "Questions"
    if label in {"EAT", "DRINK", "PIZZA", "BANANA", "CANDY", "FORK", "GLASS", "WATER"}:
        return "Daily Life"
    if label in {"BABY", "DEAF", "FAMILY", "FRIEND", "PATIENT", "YOU", "I"}:
        return "People"
    if label in {"HELLO", "PLEASE", "YES", "NO", "GOOD", "LOVE", "MORE", "COME"}:
        return "Conversation"
    return "Core Words"


def _word_difficulty(label: str) -> str:
    label = label.upper()
    if label in {
        "HELLO",
        "I",
        "NO",
        "PLEASE",
        "YES",
        "YOU",
        "GOOD",
        "MORE",
        "EAT",
        "DRINK",
        "WANT",
        "WHERE",
        "WHAT",
        "WHO",
        "WHY",
        "HOW",
        "WHEN",
    }:
        return "starter"
    return "core"


def _word_phrase_hint(label: str) -> str:
    label = label.upper()
    phrase_map = {
        "BABY": "BABY CRY",
        "BAD": "NOT BAD",
        "BANANA": "WANT BANANA",
        "BOOK": "READ BOOK",
        "CAN": "I CAN",
        "COME": "COME HERE",
        "DEAF": "DEAF FAMILY",
        "DRINK": "WANT DRINK",
        "EAT": "WANT EAT",
        "FAMILY": "LOVE FAMILY",
        "GOOD": "GOOD YOU",
        "HELLO": "HELLO YOU",
        "HOW": "HOW YOU",
        "LOVE": "I LOVE YOU",
        "MORE": "MORE PLEASE",
        "NO": "NO THANKS",
        "PLEASE": "PLEASE HELP",
        "SCHOOL": "GO SCHOOL",
        "STOP": "STOP PLEASE",
        "WANT": "I WANT",
        "WATER": "WANT WATER",
        "WHAT": "WHAT NAME",
        "WHEN": "WHEN COME",
        "WHERE": "WHERE GO",
        "WHO": "WHO YOU",
        "WHY": "WHY SAD",
        "WORK": "GO WORK",
        "WRITE": "WRITE NAME",
        "YES": "YES PLEASE",
        "YOU": "THANK YOU",
    }
    return phrase_map.get(label, label)


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
