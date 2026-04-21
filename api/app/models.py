from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.app.db import Base


UTC = timezone.utc


def utc_now() -> datetime:
    return datetime.now(UTC)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(80))
    role: Mapped[str] = mapped_column(String(32), default="student", index=True)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    password_salt: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_email_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    oauth_accounts: Mapped[list["OAuthAccount"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    sessions: Mapped[list["UserSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    password_reset_tokens: Mapped[list["PasswordResetToken"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    translation_history: Mapped[list["TranslationHistory"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    practice_sessions: Mapped[list["PracticeSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    learning_sessions: Mapped[list["LearningSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    learning_attempts: Mapped[list["LearningAttempt"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    teacher_profile: Mapped["TeacherProfile | None"] = relationship(back_populates="user", cascade="all, delete-orphan", uselist=False)
    lesson_bookings_as_teacher: Mapped[list["LessonBooking"]] = relationship(
        back_populates="teacher",
        cascade="all, delete-orphan",
        foreign_keys="LessonBooking.teacher_id",
    )
    lesson_bookings_as_student: Mapped[list["LessonBooking"]] = relationship(
        back_populates="student",
        cascade="all, delete-orphan",
        foreign_keys="LessonBooking.student_id",
    )
    message_threads_as_teacher: Mapped[list["MessageThread"]] = relationship(
        back_populates="teacher",
        cascade="all, delete-orphan",
        foreign_keys="MessageThread.teacher_id",
    )
    message_threads_as_student: Mapped[list["MessageThread"]] = relationship(
        back_populates="student",
        cascade="all, delete-orphan",
        foreign_keys="MessageThread.student_id",
    )
    sent_messages: Mapped[list["ThreadMessage"]] = relationship(back_populates="sender", cascade="all, delete-orphan")


class OAuthAccount(TimestampMixin, Base):
    __tablename__ = "oauth_accounts"
    __table_args__ = (UniqueConstraint("provider", "provider_user_id", name="uq_oauth_provider_identity"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(40), index=True)
    provider_user_id: Mapped[str] = mapped_column(String(255))
    provider_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    user: Mapped[User] = relationship(back_populates="oauth_accounts")


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    user: Mapped[User] = relationship(back_populates="sessions")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship(back_populates="password_reset_tokens")


class TranslationHistory(Base):
    __tablename__ = "translation_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    source_type: Mapped[str] = mapped_column(String(80))
    transcript: Mapped[str] = mapped_column(Text)
    confidence: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)

    user: Mapped[User] = relationship(back_populates="translation_history")


class TeacherProfile(TimestampMixin, Base):
    __tablename__ = "teacher_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    headline: Mapped[str | None] = mapped_column(String(140), nullable=True)
    intro: Mapped[str | None] = mapped_column(Text, nullable=True)
    specialties: Mapped[str | None] = mapped_column(Text, nullable=True)
    hourly_rate_usd: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lesson_duration_minutes: Mapped[int] = mapped_column(Integer, default=45)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    user: Mapped[User] = relationship(back_populates="teacher_profile")


class LessonBooking(TimestampMixin, Base):
    __tablename__ = "lesson_bookings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=45)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)

    teacher: Mapped[User] = relationship(
        back_populates="lesson_bookings_as_teacher",
        foreign_keys=[teacher_id],
    )
    student: Mapped[User] = relationship(
        back_populates="lesson_bookings_as_student",
        foreign_keys=[student_id],
    )


class MessageThread(TimestampMixin, Base):
    __tablename__ = "message_threads"
    __table_args__ = (UniqueConstraint("teacher_id", "student_id", name="uq_message_thread_teacher_student"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    last_message_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)

    teacher: Mapped[User] = relationship(
        back_populates="message_threads_as_teacher",
        foreign_keys=[teacher_id],
    )
    student: Mapped[User] = relationship(
        back_populates="message_threads_as_student",
        foreign_keys=[student_id],
    )
    messages: Mapped[list["ThreadMessage"]] = relationship(back_populates="thread", cascade="all, delete-orphan")


class ThreadMessage(TimestampMixin, Base):
    __tablename__ = "thread_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    thread_id: Mapped[int] = mapped_column(ForeignKey("message_threads.id", ondelete="CASCADE"), index=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    body: Mapped[str] = mapped_column(Text)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    thread: Mapped[MessageThread] = relationship(back_populates="messages")
    sender: Mapped[User] = relationship(back_populates="sent_messages")


class PracticeSession(Base):
    __tablename__ = "practice_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    practiced_on: Mapped[date] = mapped_column(Date)
    accuracy: Mapped[float] = mapped_column(Float)
    category: Mapped[str] = mapped_column(String(80))
    signs_mastered: Mapped[int] = mapped_column(Integer)
    duration_minutes: Mapped[int] = mapped_column(Integer)

    user: Mapped[User] = relationship(back_populates="practice_sessions")


class LearningSession(TimestampMixin, Base):
    __tablename__ = "learning_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    track: Mapped[str] = mapped_column(String(32), index=True)
    category: Mapped[str] = mapped_column(String(80), index=True)
    unit_title: Mapped[str] = mapped_column(String(120))
    source_type: Mapped[str] = mapped_column(String(80), index=True)
    summary: Mapped[str] = mapped_column(Text)
    practiced_on: Mapped[date] = mapped_column(Date, default=date.today, index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)
    accuracy: Mapped[float] = mapped_column(Float, default=0.0)
    completed_items: Mapped[int] = mapped_column(Integer, default=0)
    correct_items: Mapped[int] = mapped_column(Integer, default=0)
    attempts_count: Mapped[int] = mapped_column(Integer, default=0)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)

    user: Mapped[User] = relationship(back_populates="learning_sessions")
    attempts: Mapped[list["LearningAttempt"]] = relationship(back_populates="session", cascade="all, delete-orphan")


class LearningAttempt(TimestampMixin, Base):
    __tablename__ = "learning_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("learning_sessions.id", ondelete="SET NULL"), nullable=True, index=True)
    track: Mapped[str] = mapped_column(String(32), index=True)
    category: Mapped[str] = mapped_column(String(80), index=True)
    expected_label: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    predicted_label: Mapped[str] = mapped_column(String(64), index=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    is_confident: Mapped[bool] = mapped_column(Boolean, default=False)
    is_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    tracking_detected: Mapped[bool] = mapped_column(Boolean, default=True)
    valid_frame_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)

    user: Mapped[User] = relationship(back_populates="learning_attempts")
    session: Mapped[LearningSession | None] = relationship(back_populates="attempts")
