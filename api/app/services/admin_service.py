from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import json
from pathlib import Path
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from api.app.checkpoint_metadata import load_word_checkpoint_metadata
from api.app.config import Settings
from api.app.models import LearningAttempt, LearningSession, LessonBooking, TeacherProfile, User
from api.app.schemas import (
    AdminClassItemResponse,
    AdminTeacherProfileResponse,
    AdminTeacherProfileUpdateRequest,
    AdminUserListItemResponse,
    AdminUserUpdateRequest,
)


@dataclass
class AdminService:
    db: Session
    settings: Settings

    def get_overview(self) -> dict[str, Any]:
        now = datetime.now(UTC)
        thirty_days_ago = now - timedelta(days=30)

        total_users = self.db.scalar(select(func.count()).select_from(User)) or 0
        total_teachers = self.db.scalar(select(func.count()).select_from(User).where(User.role == "teacher")) or 0
        total_admins = self.db.scalar(select(func.count()).select_from(User).where(User.role == "admin")) or 0
        public_teachers = self.db.scalar(
            select(func.count()).select_from(TeacherProfile).where(TeacherProfile.is_public.is_(True))
        ) or 0
        total_bookings = self.db.scalar(select(func.count()).select_from(LessonBooking)) or 0
        pending_bookings = self.db.scalar(
            select(func.count()).select_from(LessonBooking).where(LessonBooking.status == "pending")
        ) or 0
        recent_sessions = self.db.scalar(
            select(func.count()).select_from(LearningSession).where(LearningSession.completed_at >= thirty_days_ago)
        ) or 0
        recent_attempts = self.db.scalar(
            select(func.count()).select_from(LearningAttempt).where(LearningAttempt.occurred_at >= thirty_days_ago)
        ) or 0

        correct_ratio_expr = func.avg(
            case(
                (LearningAttempt.is_correct.is_(True), 100.0),
                (LearningAttempt.is_correct.is_(False), 0.0),
                else_=None,
            )
        )
        recent_accuracy = self.db.scalar(
            select(correct_ratio_expr).where(
                LearningAttempt.occurred_at >= thirty_days_ago,
                LearningAttempt.is_correct.is_not(None),
            )
        )

        checkpoint_path = Path(self.settings.word_landmark_checkpoint)
        checkpoint_metadata = load_word_checkpoint_metadata(checkpoint_path)
        metrics = self._load_metrics(checkpoint_path.parent / "metrics.json")
        dataset_summary = self._load_dataset_summary(Path("data/word_landmarks_v6_candidate/records.json"))

        role_distribution = [
            {"role": role, "count": count}
            for role, count in self.db.execute(
                select(User.role, func.count())
                .group_by(User.role)
                .order_by(func.count().desc(), User.role.asc())
            ).all()
        ]

        booking_statuses = [
            {"status": status or "unknown", "count": count}
            for status, count in self.db.execute(
                select(LessonBooking.status, func.count())
                .group_by(LessonBooking.status)
                .order_by(func.count().desc(), LessonBooking.status.asc())
            ).all()
        ]

        low_accuracy_labels = [
            {
                "label": label,
                "accuracy": round(float(accuracy or 0.0), 1),
                "attempts": attempts,
                "track": track,
            }
            for label, track, attempts, accuracy in self.db.execute(
                select(
                    LearningAttempt.expected_label,
                    LearningAttempt.track,
                    func.count().label("attempts"),
                    correct_ratio_expr.label("accuracy"),
                )
                .where(
                    LearningAttempt.expected_label.is_not(None),
                    LearningAttempt.is_correct.is_not(None),
                )
                .group_by(LearningAttempt.expected_label, LearningAttempt.track)
                .having(func.count() >= 3)
                .order_by(correct_ratio_expr.asc(), func.count().desc())
                .limit(6)
            ).all()
        ]

        return {
            "stats": {
                "total_users": int(total_users),
                "total_teachers": int(total_teachers),
                "total_admins": int(total_admins),
                "public_teachers": int(public_teachers),
                "total_bookings": int(total_bookings),
                "pending_bookings": int(pending_bookings),
                "recent_sessions": int(recent_sessions),
                "recent_attempts": int(recent_attempts),
                "recent_accuracy": round(float(recent_accuracy or 0.0), 1),
            },
            "growth": {
                "dataset_records": dataset_summary["records"],
                "dataset_classes": dataset_summary["classes"],
                "word_vocabulary": len(checkpoint_metadata.labels),
                "word_sequence_length": int(metrics.get("model_config", {}).get("sequence_length", self.settings.word_sequence_length)),
            },
            "model": {
                "active_checkpoint": str(checkpoint_path).replace("\\", "/"),
                "checkpoint_name": checkpoint_path.parent.name,
                "best_val_accuracy": round(float(metrics.get("best_val_accuracy", 0.0)) * 100.0, 2),
                "test_accuracy": round(float(metrics.get("test_accuracy", 0.0)) * 100.0, 2),
                "test_loss": round(float(metrics.get("test_loss", 0.0)), 3),
                "epochs": len(metrics.get("history", [])),
                "mirror_tta_enabled": bool(self.settings.word_mirror_tta),
            },
            "role_distribution": role_distribution,
            "booking_statuses": booking_statuses,
            "low_accuracy_labels": low_accuracy_labels,
        }

    def list_users(self) -> list[AdminUserListItemResponse]:
        users = self.db.scalars(
            select(User).order_by(User.created_at.desc(), User.id.desc())
        ).all()
        return [
            AdminUserListItemResponse(
                id=user.id,
                email=user.email,
                display_name=user.display_name,
                role=str(user.role).lower(),
                age=user.age,
                bio=user.bio,
                avatar_url=self._public_media_url(user.avatar_url),
                is_email_verified=bool(user.is_email_verified),
                joined_at=self._as_utc(user.created_at).isoformat(),
            )
            for user in users
        ]

    def list_teacher_profiles(self) -> list[AdminTeacherProfileResponse]:
        profiles = self.db.scalars(
            select(TeacherProfile)
            .join(User, TeacherProfile.user_id == User.id)
            .order_by(TeacherProfile.updated_at.desc(), TeacherProfile.id.desc())
        ).all()

        teachers: list[AdminTeacherProfileResponse] = []
        for profile in profiles:
            user = self.db.get(User, profile.user_id)
            if user is None or user.role != "teacher":
                continue
            teachers.append(
                AdminTeacherProfileResponse(
                    teacher_id=user.id,
                    display_name=user.display_name,
                    email=user.email,
                    avatar_url=self._public_media_url(user.avatar_url),
                    bio=user.bio,
                    is_email_verified=bool(user.is_email_verified),
                    headline=profile.headline,
                    intro=profile.intro,
                    specialties=self._split_specialties(profile.specialties),
                    hourly_rate_usd=profile.hourly_rate_usd,
                    lesson_duration_minutes=profile.lesson_duration_minutes,
                    is_public=bool(profile.is_public),
                    profile_completion_percent=self._profile_completion(user, profile),
                    joined_at=self._as_utc(user.created_at).isoformat(),
                    updated_at=self._as_utc(profile.updated_at).isoformat(),
                )
            )
        return teachers

    def list_classes(self) -> list[AdminClassItemResponse]:
        bookings = self.db.scalars(
            select(LessonBooking)
            .order_by(LessonBooking.scheduled_at.desc(), LessonBooking.id.desc())
        ).all()

        classes: list[AdminClassItemResponse] = []
        for booking in bookings:
            teacher = self.db.get(User, booking.teacher_id)
            student = self.db.get(User, booking.student_id)
            if teacher is None or student is None:
                continue
            classes.append(
                AdminClassItemResponse(
                    id=booking.id,
                    teacher_id=teacher.id,
                    teacher_name=teacher.display_name,
                    teacher_email=teacher.email,
                    student_id=student.id,
                    student_name=student.display_name,
                    student_email=student.email,
                    scheduled_at=self._as_utc(booking.scheduled_at).isoformat(),
                    duration_minutes=booking.duration_minutes,
                    status=booking.status,
                    note=booking.note,
                    room_name=booking.room_name,
                    created_at=self._as_utc(booking.created_at).isoformat(),
                )
            )
        return classes

    def update_user(self, *, user_id: int, payload: AdminUserUpdateRequest) -> AdminUserListItemResponse:
        user = self.db.get(User, user_id)
        if user is None:
            raise ValueError("User not found.")

        normalized_role = str(payload.role).lower()
        if normalized_role == "teacher":
            self._get_or_create_teacher_profile(user)

        user.display_name = payload.display_name.strip()
        user.role = normalized_role
        user.age = payload.age
        user.bio = payload.bio.strip() if payload.bio else None
        user.is_email_verified = payload.is_email_verified
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return AdminUserListItemResponse(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            role=str(user.role).lower(),
            age=user.age,
            bio=user.bio,
            avatar_url=self._public_media_url(user.avatar_url),
            is_email_verified=bool(user.is_email_verified),
            joined_at=self._as_utc(user.created_at).isoformat(),
        )

    def update_teacher_profile(
        self,
        *,
        teacher_id: int,
        payload: AdminTeacherProfileUpdateRequest,
    ) -> AdminTeacherProfileResponse:
        user = self.db.get(User, teacher_id)
        if user is None or user.role != "teacher":
            raise ValueError("Teacher not found.")

        profile = self._get_or_create_teacher_profile(user)
        user.display_name = payload.display_name.strip()
        user.bio = payload.bio.strip() if payload.bio else None
        user.is_email_verified = payload.is_email_verified

        profile.headline = payload.headline.strip() if payload.headline and payload.headline.strip() else None
        profile.intro = payload.intro.strip() if payload.intro and payload.intro.strip() else None
        profile.specialties = self._join_specialties(payload.specialties)
        profile.hourly_rate_usd = payload.hourly_rate_usd
        profile.lesson_duration_minutes = payload.lesson_duration_minutes
        profile.is_public = payload.is_public

        self.db.add(user)
        self.db.add(profile)
        self.db.commit()
        self.db.refresh(user)
        self.db.refresh(profile)

        return AdminTeacherProfileResponse(
            teacher_id=user.id,
            display_name=user.display_name,
            email=user.email,
            avatar_url=self._public_media_url(user.avatar_url),
            bio=user.bio,
            is_email_verified=bool(user.is_email_verified),
            headline=profile.headline,
            intro=profile.intro,
            specialties=self._split_specialties(profile.specialties),
            hourly_rate_usd=profile.hourly_rate_usd,
            lesson_duration_minutes=profile.lesson_duration_minutes,
            is_public=bool(profile.is_public),
            profile_completion_percent=self._profile_completion(user, profile),
            joined_at=self._as_utc(user.created_at).isoformat(),
            updated_at=self._as_utc(profile.updated_at).isoformat(),
        )

    def _load_metrics(self, metrics_path: Path) -> dict[str, Any]:
        try:
            payload = json.loads(metrics_path.read_text(encoding="utf-8"))
            return payload if isinstance(payload, dict) else {}
        except (OSError, UnicodeDecodeError, json.JSONDecodeError):
            return {}

    def _load_dataset_summary(self, records_path: Path) -> dict[str, int]:
        try:
            payload = json.loads(records_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError):
            return {"records": 0, "classes": 0}

        if not isinstance(payload, list):
            return {"records": 0, "classes": 0}

        labels = {
            str(item.get("label", "")).upper()
            for item in payload
            if isinstance(item, dict) and item.get("label")
        }
        return {"records": len(payload), "classes": len(labels)}

    def _profile_completion(self, user: User, profile: TeacherProfile) -> int:
        score = 20
        if user.avatar_url:
            score += 20
        if profile.headline and profile.intro:
            score += 20
        if self._split_specialties(profile.specialties):
            score += 15
        if profile.hourly_rate_usd is not None:
            score += 10
        if profile.lesson_duration_minutes:
            score += 5
        if profile.is_public:
            score += 10
        return min(score, 100)

    def _get_or_create_teacher_profile(self, user: User) -> TeacherProfile:
        profile = self.db.scalar(select(TeacherProfile).where(TeacherProfile.user_id == user.id))
        if profile is not None:
            return profile
        profile = TeacherProfile(
            user_id=user.id,
            headline=None,
            intro=None,
            specialties=None,
            hourly_rate_usd=None,
            lesson_duration_minutes=45,
            is_public=False,
        )
        self.db.add(profile)
        self.db.commit()
        self.db.refresh(profile)
        return profile

    def _split_specialties(self, raw: str | None) -> list[str]:
        if not raw:
            return []
        return [item.strip() for item in raw.split("|") if item.strip()]

    def _join_specialties(self, specialties: list[str]) -> str | None:
        cleaned = [item.strip()[:40] for item in specialties if item.strip()]
        return "|".join(cleaned[:6]) if cleaned else None

    def _as_utc(self, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    def _public_media_url(self, value: str | None) -> str | None:
        if not value:
            return None
        if value.startswith("http://") or value.startswith("https://"):
            return value
        if value.startswith("/"):
            return f"{self.settings.backend_origin.rstrip('/')}{value}"
        return value
