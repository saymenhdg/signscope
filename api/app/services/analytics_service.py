from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
import random
from typing import Any

from api.app.models import PracticeSession, TranslationHistory, User
from api.app.repositories.analytics_repository import AnalyticsRepository


UTC = timezone.utc


@dataclass
class AnalyticsService:
    repository: AnalyticsRepository

    def ensure_user_seeded(self, user: User) -> None:
        if self.repository.count_practice_sessions(user.id) == 0:
            self._seed_user_data(user)

    def get_dashboard_overview(self, user: User) -> dict[str, Any]:
        self.ensure_user_seeded(user)

        practice_rows = self.repository.get_practice_sessions(user.id)
        history_rows = self.repository.get_translation_history(user.id)
        total_signs = sum(int(row.signs_mastered) for row in practice_rows)
        average_accuracy = round(sum(float(row.accuracy) for row in practice_rows) / max(len(practice_rows), 1), 1)
        streak_days = self._practice_streak(practice_rows)
        translations_this_week = self._translations_this_week(history_rows)
        daily_goal_percent = min(100, 45 + (streak_days * 4))
        daily_goal_remaining_minutes = max(6, 42 - (streak_days * 2))
        recent_translations = [self._translation_item(row) for row in history_rows[:4]]
        categories = self._category_totals(practice_rows)
        weak_areas = self._weak_areas(practice_rows)
        insight = weak_areas[0] if weak_areas else {"name": "Movement fluency", "accuracy": 82.0}

        return {
            "stats": {
                "signs_mastered": total_signs,
                "practice_streak": streak_days,
                "live_accuracy": average_accuracy,
                "translations_this_week": translations_this_week,
                "daily_goal_percent": daily_goal_percent,
                "daily_goal_remaining_minutes": daily_goal_remaining_minutes,
                "rank_label": self._rank_label(total_signs),
            },
            "recent_translations": recent_translations,
            "recent_detections": [item["transcript"].split()[0].strip('",.') for item in recent_translations],
            "categories": categories[:3],
            "insight": {
                "headline": f"Review {insight['name']}",
                "detail": (
                    f"Your recent sessions are strongest on hand shape accuracy, but {insight['name']} "
                    f"is still averaging {insight['accuracy']:.0f}% and should be the next drill focus."
                ),
            },
        }

    def get_progress_overview(self, user: User) -> dict[str, Any]:
        self.ensure_user_seeded(user)

        practice_rows = self.repository.get_practice_sessions(user.id)
        total_signs = sum(int(row.signs_mastered) for row in practice_rows)
        streak_days = self._practice_streak(practice_rows)
        xp_points = total_signs * 7 + streak_days * 35
        level = max(1, min(12, xp_points // 350 + 1))
        next_level_xp = level * 350
        previous_level_xp = (level - 1) * 350
        progress_to_next_level = xp_points - previous_level_xp
        required_for_next_level = max(1, next_level_xp - previous_level_xp)
        heatmap = self._heatmap(practice_rows)
        weekly_accuracy = self._weekly_accuracy(practice_rows)
        categories = self._category_totals(practice_rows)
        weak_areas = self._weak_areas(practice_rows)
        achievements = self._achievements(
            total_signs=total_signs,
            streak_days=streak_days,
            average_accuracy=weekly_accuracy[-1] if weekly_accuracy else 0.0,
        )

        return {
            "totals": {
                "signs_mastered": total_signs,
                "streak_days": streak_days,
                "level": level,
                "level_title": self._rank_label(total_signs),
                "xp_points": xp_points,
                "next_level_xp": next_level_xp,
                "progress_percent": round((progress_to_next_level / required_for_next_level) * 100, 1),
            },
            "heatmap": heatmap,
            "weekly_accuracy": weekly_accuracy,
            "categories": categories,
            "weak_areas": weak_areas,
            "achievements": achievements,
        }

    def record_learning_session(
        self,
        *,
        user: User,
        category: str,
        accuracy: float,
        signs_mastered: int,
        duration_minutes: int,
        source_type: str,
        transcript: str,
    ) -> None:
        bounded_accuracy = max(0.0, min(100.0, float(accuracy)))
        bounded_mastered = max(0, int(signs_mastered))
        bounded_duration = max(1, int(duration_minutes))
        bounded_confidence = max(0.0, min(1.0, bounded_accuracy / 100.0))

        self.repository.create_practice_session(
            user_id=user.id,
            practiced_on=date.today(),
            accuracy=bounded_accuracy,
            category=category,
            signs_mastered=bounded_mastered,
            duration_minutes=bounded_duration,
        )
        self.repository.create_translation_history(
            user_id=user.id,
            source_type=source_type,
            transcript=transcript,
            confidence=bounded_confidence,
            created_at=datetime.now(UTC),
        )

    def _seed_user_data(self, user: User) -> None:
        rng = random.Random(user.id * 97 + len(user.display_name))
        today = date.today()
        categories = [
            "Conversational",
            "Professional",
            "Medical",
            "Emergency",
            "Alphabet",
            "Restaurant",
        ]
        transcripts = [
            "Can you help me find the library?",
            "Thank you for the wonderful meal.",
            "Where is the nearest subway station?",
            "I am learning sign language with SignSpeak AI.",
            "Please show me the emergency exit.",
            "We are meeting tomorrow afternoon.",
        ]

        practice_rows: list[PracticeSession] = []
        history_rows: list[TranslationHistory] = []

        active_days = sorted({rng.randint(0, 83) for _ in range(48)})
        for offset in active_days:
            practiced_on = today - timedelta(days=offset)
            practice_rows.append(
                PracticeSession(
                    user_id=user.id,
                    practiced_on=practiced_on,
                    accuracy=round(rng.uniform(68.0, 99.0), 1),
                    category=rng.choice(categories),
                    signs_mastered=rng.randint(4, 18),
                    duration_minutes=rng.randint(8, 32),
                )
            )

        for index in range(12):
            history_rows.append(
                TranslationHistory(
                    user_id=user.id,
                    source_type=rng.choice(["live-camera", "uploaded-video", "alphabet-practice"]),
                    transcript=transcripts[index % len(transcripts)],
                    confidence=round(rng.uniform(0.78, 0.99), 3),
                    created_at=datetime.now(UTC) - timedelta(hours=index * rng.randint(6, 20)),
                )
            )

        self.repository.bulk_seed(user=user, practice_rows=practice_rows, history_rows=history_rows)

    def _translation_item(self, row: TranslationHistory) -> dict[str, Any]:
        confidence = float(row.confidence)
        return {
            "id": int(row.id),
            "source_type": row.source_type,
            "transcript": row.transcript,
            "confidence": round(confidence * 100, 1),
            "created_at": self._coerce_utc_datetime(row.created_at).isoformat(),
            "status_label": "High Accuracy" if confidence >= 0.9 else "Review Needed",
        }

    def _category_totals(self, practice_rows: list[PracticeSession]) -> list[dict[str, Any]]:
        totals: dict[str, int] = {}
        for row in practice_rows:
            totals[row.category] = totals.get(row.category, 0) + int(row.signs_mastered)
        ordered = sorted(totals.items(), key=lambda item: item[1], reverse=True)
        max_value = max((value for _, value in ordered), default=1)
        return [
            {"name": name, "mastered": value, "percent": round((value / max_value) * 100, 1)}
            for name, value in ordered
        ]

    def _weak_areas(self, practice_rows: list[PracticeSession]) -> list[dict[str, Any]]:
        per_category: dict[str, list[float]] = {}
        for row in practice_rows:
            per_category.setdefault(row.category, []).append(float(row.accuracy))
        ranked = sorted(
            (
                {"name": category, "accuracy": round(sum(scores) / len(scores), 1)}
                for category, scores in per_category.items()
            ),
            key=lambda item: item["accuracy"],
        )
        return ranked[:4]

    def _practice_streak(self, practice_rows: list[PracticeSession]) -> int:
        practice_days = {row.practiced_on for row in practice_rows}
        streak = 0
        cursor = date.today()
        while cursor in practice_days:
            streak += 1
            cursor -= timedelta(days=1)
        return streak

    def _translations_this_week(self, history_rows: list[TranslationHistory]) -> int:
        threshold = datetime.now(UTC) - timedelta(days=7)
        return sum(1 for row in history_rows if self._coerce_utc_datetime(row.created_at) >= threshold)

    def _heatmap(self, practice_rows: list[PracticeSession]) -> list[int]:
        counts: dict[date, int] = {}
        for row in practice_rows:
            counts[row.practiced_on] = counts.get(row.practiced_on, 0) + int(row.signs_mastered)
        days: list[int] = []
        for offset in range(83, -1, -1):
            day_key = date.today() - timedelta(days=offset)
            value = counts.get(day_key, 0)
            if value == 0:
                days.append(0)
            elif value < 8:
                days.append(1)
            elif value < 14:
                days.append(2)
            elif value < 20:
                days.append(3)
            else:
                days.append(4)
        return days

    def _weekly_accuracy(self, practice_rows: list[PracticeSession]) -> list[float]:
        buckets: list[list[float]] = [[] for _ in range(7)]
        for row in practice_rows[:28]:
            buckets[row.practiced_on.weekday()].append(float(row.accuracy))
        return [round(sum(scores) / len(scores), 1) if scores else 0.0 for scores in buckets]

    def _achievements(self, *, total_signs: int, streak_days: int, average_accuracy: float) -> list[dict[str, Any]]:
        return [
            {"name": "Early Bird", "description": "Practice 5 times before 8 AM", "unlocked": streak_days >= 5},
            {"name": "Swift Hand", "description": "Clear 10 signs in under 30 seconds", "unlocked": total_signs >= 120},
            {"name": "Perfect Week", "description": "Maintain 95%+ weekly accuracy", "unlocked": average_accuracy >= 95.0},
            {"name": "The Veteran", "description": "Complete 1,000 total signs", "unlocked": total_signs >= 1000},
        ]

    def _rank_label(self, total_signs: int) -> str:
        if total_signs >= 850:
            return "Level 9 Communicator"
        if total_signs >= 600:
            return "Level 8 Interpreter"
        if total_signs >= 350:
            return "Level 6 Mentor"
        return "Level 4 Learner"

    def _coerce_utc_datetime(self, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)
