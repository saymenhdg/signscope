from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

from api.app.models import LearningAttempt, LearningSession, User
from api.app.repositories.analytics_repository import AnalyticsRepository


UTC = timezone.utc
DEFAULT_DAILY_GOAL_MINUTES = 30
RANKS = [
    (2400, "Level 9 Communicator"),
    (1600, "Level 8 Interpreter"),
    (900, "Level 7 Guide"),
    (450, "Level 6 Mentor"),
    (180, "Level 5 Builder"),
    (0, "Level 4 Learner"),
]


@dataclass
class AnalyticsService:
    repository: AnalyticsRepository

    def ensure_user_seeded(self, user: User) -> None:
        del user
        return

    def get_dashboard_overview(self, user: User) -> dict[str, Any]:
        sessions = self.repository.get_learning_sessions(user.id)
        attempts = self.repository.get_learning_attempts(user.id)

        correct_attempts = [attempt for attempt in attempts if attempt.is_correct is True]
        scored_attempts = [attempt for attempt in attempts if attempt.is_correct is not None]
        streak_days = self._practice_streak(sessions, attempts)
        today_duration_minutes = round(sum(max(session.duration_seconds, 0) for session in sessions if session.practiced_on == date.today()) / 60)
        daily_goal_percent = min(100, round((today_duration_minutes / DEFAULT_DAILY_GOAL_MINUTES) * 100)) if DEFAULT_DAILY_GOAL_MINUTES else 0
        recent_sessions = sessions[:4]
        categories = self._category_totals(attempts) or self._session_category_totals(sessions)
        insight = self._dashboard_insight(attempts, sessions)

        return {
            "stats": {
                "signs_mastered": len(correct_attempts),
                "practice_streak": streak_days,
                "live_accuracy": self._average_accuracy(scored_attempts) if scored_attempts else self._session_average_accuracy(sessions),
                "translations_this_week": self._sessions_this_week(sessions),
                "daily_goal_percent": daily_goal_percent,
                "daily_goal_remaining_minutes": max(0, DEFAULT_DAILY_GOAL_MINUTES - today_duration_minutes),
                "rank_label": self._rank_label(self._xp_points(sessions, attempts, correct_attempts)),
            },
            "recent_translations": [self._session_item(row) for row in recent_sessions],
            "recent_detections": [attempt.predicted_label for attempt in attempts[:6]],
            "categories": categories[:3],
            "insight": insight,
        }

    def get_progress_overview(self, user: User) -> dict[str, Any]:
        sessions = self.repository.get_learning_sessions(user.id)
        attempts = self.repository.get_learning_attempts(user.id)

        correct_attempts = [attempt for attempt in attempts if attempt.is_correct is True]
        scored_attempts = [attempt for attempt in attempts if attempt.is_correct is not None]
        streak_days = self._practice_streak(sessions, attempts)
        xp_points = self._xp_points(sessions, attempts, correct_attempts)
        level = self._level_from_xp(xp_points)
        previous_level_xp = (level - 1) * 350
        next_level_xp = level * 350
        progress_to_next_level = xp_points - previous_level_xp
        required_for_next_level = max(1, next_level_xp - previous_level_xp)

        return {
            "totals": {
                "signs_mastered": len(correct_attempts),
                "streak_days": streak_days,
                "level": level,
                "level_title": self._rank_label(xp_points),
                "xp_points": xp_points,
                "next_level_xp": next_level_xp,
                "progress_percent": round((progress_to_next_level / required_for_next_level) * 100, 1),
            },
            "heatmap": self._heatmap(sessions, attempts),
            "weekly_accuracy": self._weekly_accuracy(sessions),
            "categories": self._category_totals(attempts) or self._session_category_totals(sessions),
            "weak_areas": self._weak_areas(attempts) or self._session_weak_areas(sessions),
            "achievements": self._achievements(
                total_correct=len(correct_attempts),
                streak_days=streak_days,
                average_accuracy=self._average_accuracy(scored_attempts),
                session_count=len(sessions),
            ),
            "track_breakdown": self._track_breakdown(sessions, attempts),
            "focus_labels": self._focus_labels(attempts),
            "recent_sessions": [self._recent_session_item(session) for session in sessions[:6]],
        }

    def record_learning_session(
        self,
        *,
        user: User,
        track: str,
        category: str,
        unit_title: str,
        source_type: str,
        summary: str,
        accuracy: float,
        completed_items: int,
        correct_items: int,
        attempts_count: int,
        duration_seconds: int,
        started_at: datetime | None = None,
        completed_at: datetime | None = None,
    ) -> LearningSession:
        bounded_accuracy = max(0.0, min(100.0, float(accuracy)))
        bounded_completed_items = max(0, int(completed_items))
        bounded_correct_items = max(0, int(correct_items))
        bounded_attempts_count = max(0, int(attempts_count))
        bounded_duration = max(1, int(duration_seconds))
        completed_at_utc = self._coerce_utc_datetime(completed_at or datetime.now(UTC))
        started_at_utc = self._coerce_utc_datetime(started_at or (completed_at_utc - timedelta(seconds=bounded_duration)))

        return self.repository.create_learning_session(
            user_id=user.id,
            track=track.strip().lower(),
            category=category.strip(),
            unit_title=unit_title.strip(),
            source_type=source_type.strip().lower(),
            summary=summary.strip(),
            practiced_on=completed_at_utc.date(),
            started_at=started_at_utc,
            completed_at=completed_at_utc,
            accuracy=bounded_accuracy,
            completed_items=bounded_completed_items,
            correct_items=bounded_correct_items,
            attempts_count=bounded_attempts_count,
            duration_seconds=bounded_duration,
        )

    def record_learning_attempt(
        self,
        *,
        user: User,
        track: str,
        category: str,
        expected_label: str | None,
        predicted_label: str,
        confidence: float,
        is_confident: bool,
        is_correct: bool | None,
        tracking_detected: bool,
        valid_frame_ratio: float | None,
        occurred_at: datetime | None = None,
        session_id: int | None = None,
    ) -> LearningAttempt:
        normalized_expected = expected_label.strip().upper() if expected_label else None
        normalized_predicted = predicted_label.strip().upper()
        if not normalized_predicted:
            raise ValueError("Predicted label must not be empty.")

        bounded_confidence = max(0.0, min(1.0, float(confidence)))
        bounded_ratio = None if valid_frame_ratio is None else max(0.0, min(1.0, float(valid_frame_ratio)))
        occurred_at_utc = self._coerce_utc_datetime(occurred_at or datetime.now(UTC))

        return self.repository.create_learning_attempt(
            user_id=user.id,
            session_id=session_id,
            track=track.strip().lower(),
            category=category.strip(),
            expected_label=normalized_expected,
            predicted_label=normalized_predicted,
            confidence=bounded_confidence,
            is_confident=bool(is_confident),
            is_correct=is_correct,
            tracking_detected=bool(tracking_detected),
            valid_frame_ratio=bounded_ratio,
            occurred_at=occurred_at_utc,
        )

    def _session_item(self, row: LearningSession) -> dict[str, Any]:
        accuracy = float(row.accuracy)
        return {
            "id": int(row.id),
            "source_type": row.source_type,
            "transcript": row.summary,
            "confidence": round(accuracy, 1),
            "created_at": self._coerce_utc_datetime(row.completed_at).isoformat(),
            "status_label": "High Accuracy" if accuracy >= 90.0 else "Review Needed",
        }

    def _recent_session_item(self, row: LearningSession) -> dict[str, Any]:
        return {
            "id": int(row.id),
            "track": row.track,
            "category": row.category,
            "unit_title": row.unit_title,
            "accuracy": round(float(row.accuracy), 1),
            "completed_items": int(row.completed_items),
            "correct_items": int(row.correct_items),
            "attempts_count": int(row.attempts_count),
            "duration_minutes": max(1, round(int(row.duration_seconds) / 60)),
            "completed_at": self._coerce_utc_datetime(row.completed_at).isoformat(),
        }

    def _category_totals(self, attempts: list[LearningAttempt]) -> list[dict[str, Any]]:
        totals: dict[str, int] = {}
        for attempt in attempts:
            contribution = 1 if attempt.is_correct else 0
            totals[attempt.category] = totals.get(attempt.category, 0) + contribution
        ordered = sorted(totals.items(), key=lambda item: item[1], reverse=True)
        max_value = max((value for _, value in ordered), default=1)
        return [
            {"name": name, "mastered": value, "percent": round((value / max_value) * 100, 1)}
            for name, value in ordered
        ]

    def _weak_areas(self, attempts: list[LearningAttempt]) -> list[dict[str, Any]]:
        per_category: dict[str, list[float]] = {}
        for attempt in attempts:
            if attempt.is_correct is None:
                continue
            per_category.setdefault(attempt.category, []).append(100.0 if attempt.is_correct else 0.0)
        ranked = sorted(
            (
                {"name": category, "accuracy": round(sum(scores) / len(scores), 1)}
                for category, scores in per_category.items()
                if scores
            ),
            key=lambda item: item["accuracy"],
        )
        return ranked[:4]

    def _session_category_totals(self, sessions: list[LearningSession]) -> list[dict[str, Any]]:
        totals: dict[str, int] = {}
        for session in sessions:
            totals[session.category] = totals.get(session.category, 0) + max(session.correct_items, session.completed_items, 0)
        ordered = sorted(totals.items(), key=lambda item: item[1], reverse=True)
        max_value = max((value for _, value in ordered), default=1)
        return [
            {"name": name, "mastered": value, "percent": round((value / max_value) * 100, 1)}
            for name, value in ordered
        ]

    def _session_weak_areas(self, sessions: list[LearningSession]) -> list[dict[str, Any]]:
        by_category: dict[str, list[float]] = {}
        for session in sessions:
            by_category.setdefault(session.category, []).append(float(session.accuracy))
        ranked = sorted(
            (
                {"name": category, "accuracy": round(sum(scores) / len(scores), 1)}
                for category, scores in by_category.items()
                if scores
            ),
            key=lambda item: item["accuracy"],
        )
        return ranked[:4]

    def _dashboard_insight(self, attempts: list[LearningAttempt], sessions: list[LearningSession]) -> dict[str, str]:
        by_label: dict[str, list[float]] = {}
        for attempt in attempts:
            if attempt.expected_label is None or attempt.is_correct is None:
                continue
            by_label.setdefault(attempt.expected_label, []).append(100.0 if attempt.is_correct else 0.0)

        candidates = [
            (label, round(sum(scores) / len(scores), 1), len(scores))
            for label, scores in by_label.items()
            if len(scores) >= 2
        ]
        if candidates:
            label, accuracy, _count = min(candidates, key=lambda item: item[1])
            prefix = "Letter" if len(label) == 1 else "Word"
            return {
                "headline": f"Review {prefix} {label}",
                "detail": f"{prefix} {label} is averaging {accuracy:.0f}% over your recent graded attempts and should be the next drill focus.",
            }

        weak_areas = self._weak_areas(attempts)
        if weak_areas:
            weakest = weak_areas[0]
            return {
                "headline": f"Review {weakest['name']}",
                "detail": f"{weakest['name']} is currently averaging {weakest['accuracy']:.0f}% accuracy. Another short drill there should move the dashboard up fastest.",
            }

        if not sessions and not attempts:
            return {
                "headline": "Start Your First Drill",
                "detail": "No practice data has been recorded yet. Run an alphabet lesson or a word practice session to unlock real progress tracking.",
            }

        return {
            "headline": "Build More Repetitions",
            "detail": "You have some activity recorded, but not enough graded attempts yet to identify a weak area reliably.",
        }

    def _practice_streak(self, sessions: list[LearningSession], attempts: list[LearningAttempt]) -> int:
        practice_days = {session.practiced_on for session in sessions}
        practice_days.update(self._coerce_utc_datetime(attempt.occurred_at).date() for attempt in attempts)
        streak = 0
        cursor = date.today()
        while cursor in practice_days:
            streak += 1
            cursor -= timedelta(days=1)
        return streak

    def _sessions_this_week(self, sessions: list[LearningSession]) -> int:
        threshold = datetime.now(UTC) - timedelta(days=7)
        return sum(1 for session in sessions if self._coerce_utc_datetime(session.completed_at) >= threshold)

    def _heatmap(self, sessions: list[LearningSession], attempts: list[LearningAttempt]) -> list[int]:
        counts: dict[date, int] = {}
        for session in sessions:
            counts[session.practiced_on] = counts.get(session.practiced_on, 0) + max(session.correct_items, session.completed_items, 0)
        for attempt in attempts:
            day_key = self._coerce_utc_datetime(attempt.occurred_at).date()
            counts[day_key] = counts.get(day_key, 0) + (1 if attempt.is_correct else 0)

        days: list[int] = []
        for offset in range(83, -1, -1):
            day_key = date.today() - timedelta(days=offset)
            value = counts.get(day_key, 0)
            if value == 0:
                days.append(0)
            elif value < 4:
                days.append(1)
            elif value < 8:
                days.append(2)
            elif value < 14:
                days.append(3)
            else:
                days.append(4)
        return days

    def _weekly_accuracy(self, sessions: list[LearningSession]) -> list[float]:
        buckets: list[list[float]] = [[] for _ in range(7)]
        for session in sessions[:42]:
            buckets[session.practiced_on.weekday()].append(float(session.accuracy))
        return [round(sum(scores) / len(scores), 1) if scores else 0.0 for scores in buckets]

    def _achievements(
        self,
        *,
        total_correct: int,
        streak_days: int,
        average_accuracy: float,
        session_count: int,
    ) -> list[dict[str, Any]]:
        return [
            {
                "name": "Early Momentum",
                "description": "Finish 3 graded practice sessions.",
                "unlocked": session_count >= 3,
            },
            {
                "name": "Swift Hand",
                "description": "Lock in 50 correct signs across alphabet and word drills.",
                "unlocked": total_correct >= 50,
            },
            {
                "name": "Perfect Week",
                "description": "Average 95% accuracy over recent graded work.",
                "unlocked": average_accuracy >= 95.0 and session_count >= 3,
            },
            {
                "name": "The Veteran",
                "description": "Reach 250 correct graded signs.",
                "unlocked": total_correct >= 250,
            },
            {
                "name": "Streak Builder",
                "description": "Practice on 5 consecutive days.",
                "unlocked": streak_days >= 5,
            },
        ]

    def _track_breakdown(
        self,
        sessions: list[LearningSession],
        attempts: list[LearningAttempt],
    ) -> list[dict[str, Any]]:
        tracks = {
            "alphabet": {"label": "Alphabet", "sessions": 0, "attempts": 0, "correct": 0},
            "words": {"label": "Words", "sessions": 0, "attempts": 0, "correct": 0},
        }

        for session in sessions:
            bucket = tracks.setdefault(session.track, {"label": session.track.title(), "sessions": 0, "attempts": 0, "correct": 0})
            bucket["sessions"] += 1
            bucket["attempts"] += max(int(session.attempts_count), 0)
            bucket["correct"] += max(int(session.correct_items), 0)

        for attempt in attempts:
            bucket = tracks.setdefault(attempt.track, {"label": attempt.track.title(), "sessions": 0, "attempts": 0, "correct": 0})
            if bucket["sessions"] == 0:
                bucket["attempts"] += 1
                bucket["correct"] += 1 if attempt.is_correct else 0

        max_correct = max((data["correct"] for data in tracks.values()), default=1)
        ordered = []
        for track, data in tracks.items():
            accuracy = round((data["correct"] / data["attempts"]) * 100, 1) if data["attempts"] > 0 else 0.0
            ordered.append(
                {
                    "track": track,
                    "label": data["label"],
                    "sessions": data["sessions"],
                    "attempts": data["attempts"],
                    "correct": data["correct"],
                    "accuracy": accuracy,
                    "percent": round((data["correct"] / max_correct) * 100, 1) if max_correct else 0.0,
                }
            )
        return ordered

    def _focus_labels(self, attempts: list[LearningAttempt]) -> list[dict[str, Any]]:
        by_label: dict[str, dict[str, Any]] = {}
        for attempt in attempts:
            if attempt.expected_label is None or attempt.is_correct is None:
                continue
            label = attempt.expected_label
            bucket = by_label.setdefault(
                label,
                {
                    "label": label,
                    "track": attempt.track,
                    "attempts": 0,
                    "correct": 0,
                },
            )
            bucket["attempts"] += 1
            bucket["correct"] += 1 if attempt.is_correct else 0

        ranked = []
        for entry in by_label.values():
            if entry["attempts"] < 2:
                continue
            accuracy = round((entry["correct"] / entry["attempts"]) * 100, 1)
            ranked.append(
                {
                    "label": entry["label"],
                    "track": entry["track"],
                    "attempts": entry["attempts"],
                    "accuracy": accuracy,
                }
            )

        ranked.sort(key=lambda item: (item["accuracy"], -item["attempts"], item["label"]))
        return ranked[:8]

    def _average_accuracy(self, attempts: list[LearningAttempt]) -> float:
        if not attempts:
            return 0.0
        values = [100.0 if attempt.is_correct else 0.0 for attempt in attempts if attempt.is_correct is not None]
        if not values:
            return 0.0
        return round(sum(values) / len(values), 1)

    def _session_average_accuracy(self, sessions: list[LearningSession]) -> float:
        if not sessions:
            return 0.0
        return round(sum(float(session.accuracy) for session in sessions) / len(sessions), 1)

    def _xp_points(
        self,
        sessions: list[LearningSession],
        attempts: list[LearningAttempt],
        correct_attempts: list[LearningAttempt],
    ) -> int:
        session_points = sum(max(1, session.completed_items) * 3 for session in sessions)
        attempt_points = len(correct_attempts) * 5
        streak_bonus = self._practice_streak(sessions, attempts) * 15
        return session_points + attempt_points + streak_bonus

    def _level_from_xp(self, xp_points: int) -> int:
        return max(1, min(12, xp_points // 350 + 1))

    def _rank_label(self, xp_points: int) -> str:
        for threshold, label in RANKS:
            if xp_points >= threshold:
                return label
        return RANKS[-1][1]

    def _coerce_utc_datetime(self, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)
