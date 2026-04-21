from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from api.app.config import Settings
from api.app.schemas import (
    AlphabetLessonItem,
    AlphabetLessonResponse,
    GuidePoint,
    PhraseDrill,
    WordLessonItem,
    WordLessonResponse,
)
from signlang.learning_content import (
    HAND_CONNECTIONS,
    PHRASE_DRILLS,
    alphabet_reference_image,
    alphabet_reference_video,
    alphabet_sequence,
    build_alphabet_guides,
    build_word_lessons,
    word_reference_video,
)


@dataclass
class LearningCatalogService:
    settings: Settings

    def __post_init__(self) -> None:
        try:
            self.alphabet_guides = build_alphabet_guides(self.settings.alphabet_guide_records_path)
        except Exception:
            self.alphabet_guides = {}
        self.word_lessons = build_word_lessons()

    def alphabet_lesson(self) -> AlphabetLessonResponse:
        labels = alphabet_sequence(list(self.alphabet_guides))
        sequence = [
            AlphabetLessonItem(
                label=label,
                cue=str(self.alphabet_guides[label]["cue"]),
                motion_letter=bool(self.alphabet_guides[label]["motion_letter"]),
                guide_points=[GuidePoint(**point) for point in self.alphabet_guides[label]["guide_points"]],
                reference_image_path=(f"/api/learn/alphabet/reference/{label}" if alphabet_reference_image(label) is not None else None),
                reference_video_path=(f"/api/learn/alphabet/reference-video/{label}" if alphabet_reference_video(label) is not None else None),
            )
            for label in labels
        ]
        return AlphabetLessonResponse(
            sequence=sequence,
            connections=HAND_CONNECTIONS,
            stable_frames=3,
            threshold=self.settings.alphabet_threshold,
            min_margin=self.settings.alphabet_min_margin,
            note=(
                "J and Z are motion letters. The live coach will still confirm them, "
                "but they need a clearer movement path than the other letters."
            ),
        )

    def word_lesson(self) -> WordLessonResponse:
        items = [
            WordLessonItem(
                label=str(item["label"]),
                title=str(item["title"]),
                category=str(item["category"]),
                difficulty=str(item["difficulty"]),
                description=str(item["description"]),
                coach_tip=str(item["coach_tip"]),
                phrase=str(item["phrase"]),
                reference_video_path=(f"/api/learn/words/reference/{item['label']}" if item.get("reference_video_path") is not None else None),
            )
            for item in self.word_lessons
        ]
        return WordLessonResponse(
            items=items,
            phrase_drills=[PhraseDrill(**item) for item in PHRASE_DRILLS],
            note=(
                "This word track is curated around the seven most reliable words in the current PyTorch word model. "
                "Use it as a guided vocabulary set before moving into longer sentence work."
            ),
        )

    def alphabet_reference(self, label: str) -> Path | None:
        return alphabet_reference_image(label)

    def alphabet_reference_video(self, label: str) -> Path | None:
        return alphabet_reference_video(label)

    def word_reference(self, label: str) -> Path | None:
        return word_reference_video(label)
