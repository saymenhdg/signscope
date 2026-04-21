from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.models import LearningAttempt, LearningSession


class AnalyticsRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_learning_sessions(self, user_id: int, *, limit: int | None = None) -> list[LearningSession]:
        statement = (
            select(LearningSession)
            .where(LearningSession.user_id == user_id)
            .order_by(LearningSession.completed_at.desc(), LearningSession.id.desc())
        )
        if limit is not None:
            statement = statement.limit(limit)
        return list(self.db.scalars(statement).all())

    def get_learning_attempts(self, user_id: int, *, limit: int | None = None) -> list[LearningAttempt]:
        statement = (
            select(LearningAttempt)
            .where(LearningAttempt.user_id == user_id)
            .order_by(LearningAttempt.occurred_at.desc(), LearningAttempt.id.desc())
        )
        if limit is not None:
            statement = statement.limit(limit)
        return list(self.db.scalars(statement).all())

    def create_learning_session(
        self,
        *,
        user_id: int,
        track: str,
        category: str,
        unit_title: str,
        source_type: str,
        summary: str,
        practiced_on: date,
        started_at: datetime,
        completed_at: datetime,
        accuracy: float,
        completed_items: int,
        correct_items: int,
        attempts_count: int,
        duration_seconds: int,
    ) -> LearningSession:
        session = LearningSession(
            user_id=user_id,
            track=track,
            category=category,
            unit_title=unit_title,
            source_type=source_type,
            summary=summary,
            practiced_on=practiced_on,
            started_at=started_at,
            completed_at=completed_at,
            accuracy=accuracy,
            completed_items=completed_items,
            correct_items=correct_items,
            attempts_count=attempts_count,
            duration_seconds=duration_seconds,
        )
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        return session

    def create_learning_attempt(
        self,
        *,
        user_id: int,
        track: str,
        category: str,
        expected_label: str | None,
        predicted_label: str,
        confidence: float,
        is_confident: bool,
        is_correct: bool | None,
        tracking_detected: bool,
        valid_frame_ratio: float | None,
        occurred_at: datetime,
        session_id: int | None = None,
    ) -> LearningAttempt:
        attempt = LearningAttempt(
            user_id=user_id,
            session_id=session_id,
            track=track,
            category=category,
            expected_label=expected_label,
            predicted_label=predicted_label,
            confidence=confidence,
            is_confident=is_confident,
            is_correct=is_correct,
            tracking_detected=tracking_detected,
            valid_frame_ratio=valid_frame_ratio,
            occurred_at=occurred_at,
        )
        self.db.add(attempt)
        self.db.commit()
        self.db.refresh(attempt)
        return attempt
