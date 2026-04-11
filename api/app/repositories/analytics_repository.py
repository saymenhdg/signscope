from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.models import PracticeSession, TranslationHistory, User


class AnalyticsRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def count_practice_sessions(self, user_id: int) -> int:
        statement = select(PracticeSession).where(PracticeSession.user_id == user_id)
        return len(self.db.scalars(statement).all())

    def get_practice_sessions(self, user_id: int) -> list[PracticeSession]:
        statement = (
            select(PracticeSession)
            .where(PracticeSession.user_id == user_id)
            .order_by(PracticeSession.practiced_on.desc(), PracticeSession.id.desc())
        )
        return list(self.db.scalars(statement).all())

    def get_translation_history(self, user_id: int) -> list[TranslationHistory]:
        statement = (
            select(TranslationHistory)
            .where(TranslationHistory.user_id == user_id)
            .order_by(TranslationHistory.created_at.desc(), TranslationHistory.id.desc())
        )
        return list(self.db.scalars(statement).all())

    def create_practice_session(
        self,
        *,
        user_id: int,
        practiced_on: date,
        accuracy: float,
        category: str,
        signs_mastered: int,
        duration_minutes: int,
    ) -> PracticeSession:
        practice = PracticeSession(
            user_id=user_id,
            practiced_on=practiced_on,
            accuracy=accuracy,
            category=category,
            signs_mastered=signs_mastered,
            duration_minutes=duration_minutes,
        )
        self.db.add(practice)
        self.db.commit()
        self.db.refresh(practice)
        return practice

    def create_translation_history(
        self,
        *,
        user_id: int,
        source_type: str,
        transcript: str,
        confidence: float,
        created_at: datetime,
    ) -> TranslationHistory:
        history = TranslationHistory(
            user_id=user_id,
            source_type=source_type,
            transcript=transcript,
            confidence=confidence,
            created_at=created_at,
        )
        self.db.add(history)
        self.db.commit()
        self.db.refresh(history)
        return history

    def bulk_seed(
        self,
        *,
        user: User,
        practice_rows: list[PracticeSession],
        history_rows: list[TranslationHistory],
    ) -> None:
        for row in practice_rows:
            row.user_id = user.id
            self.db.add(row)
        for row in history_rows:
            row.user_id = user.id
            self.db.add(row)
        self.db.commit()
