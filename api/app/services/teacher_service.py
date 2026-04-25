from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import re

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from api.app.models import LessonBooking, MessageThread, TeacherProfile, ThreadMessage, User
from api.app.schemas import (
    ClassSessionResponse,
    LessonBookingResponse,
    StudentScheduleResponse,
    TeacherDashboardResponse,
    TeacherDirectoryResponse,
    TeacherNotificationItemResponse,
    TeacherNotificationsResponse,
    TeacherMessageResponse,
    TeacherMessagesInboxResponse,
    TeacherMessageThreadResponse,
    TeacherMessageThreadSummaryResponse,
    TeacherProfileCardResponse,
    TeacherProfileCardUpdateRequest,
    TeacherScheduleResponse,
)


UTC = timezone.utc


@dataclass
class TeacherService:
    db: Session
    backend_origin: str
    video_call_base_url: str
    lesson_join_early_minutes: int = 10
    lesson_join_late_minutes: int = 30

    def dashboard_overview(self, user: User) -> TeacherDashboardResponse:
        profile = self._get_or_create_profile(user)
        bookings = self._teacher_bookings(user, limit=6)

        completion = self._profile_completion(user, profile)
        stats = {
            "upcoming_lessons": sum(1 for booking in bookings if booking.status in {"pending", "confirmed"}),
            "pending_requests": sum(1 for booking in bookings if booking.status == "pending"),
            "completed_lessons": sum(1 for booking in bookings if booking.status == "completed"),
            "profile_completion_percent": completion,
        }

        return TeacherDashboardResponse(
            profile_completion_percent=completion,
            account_status="Ready for scheduling" if profile.is_public and completion >= 80 else "Finish teacher setup",
            joined_at=self._as_utc(user.created_at).isoformat(),
            readiness_checks=[
                {"id": "avatar", "label": "Upload a teacher profile image", "done": bool(user.avatar_url)},
                {"id": "headline", "label": "Set a card headline and intro", "done": bool(profile.headline and profile.intro)},
                {"id": "specialties", "label": "Add teaching specialties", "done": bool(self._split_specialties(profile.specialties))},
                {"id": "pricing", "label": "Set lesson duration and rate", "done": profile.hourly_rate_usd is not None and profile.lesson_duration_minutes > 0},
                {"id": "visibility", "label": "Publish the teacher card", "done": profile.is_public},
            ],
            stats=stats,
            profile_card=self._profile_card_response(user, profile).model_dump(),
            booking_requests=[self._booking_response(booking).model_dump() for booking in bookings],
        )

    def schedule_overview(self, user: User) -> TeacherScheduleResponse:
        bookings = self._teacher_bookings(user)
        return TeacherScheduleResponse(
            bookings=[self._booking_response(booking) for booking in bookings],
            totals=self._booking_totals(bookings),
        )

    def student_schedule_overview(self, user: User) -> StudentScheduleResponse:
        bookings = self._student_bookings(user)
        return StudentScheduleResponse(
            bookings=[self._booking_response(booking) for booking in bookings],
            totals=self._booking_totals(bookings),
        )

    def messages_inbox(self, user: User) -> TeacherMessagesInboxResponse:
        self._ensure_threads_for_teacher(user)
        threads = self.db.scalars(
            select(MessageThread)
            .options(
                joinedload(MessageThread.student),
                joinedload(MessageThread.messages).joinedload(ThreadMessage.sender),
            )
            .where(MessageThread.teacher_id == user.id)
            .order_by(MessageThread.last_message_at.desc())
        ).unique().all()
        summaries = [self._thread_summary(thread, teacher_id=user.id) for thread in threads]
        return TeacherMessagesInboxResponse(
            threads=summaries,
            unread_count=sum(item.unread_count for item in summaries),
        )

    def notifications_overview(self, user: User) -> TeacherNotificationsResponse:
        pending_bookings = self.db.scalars(
            select(LessonBooking)
            .options(joinedload(LessonBooking.student), joinedload(LessonBooking.teacher))
            .where(LessonBooking.teacher_id == user.id, LessonBooking.status == "pending")
            .order_by(LessonBooking.created_at.desc())
            .limit(6)
        ).all()
        inbox = self.messages_inbox(user)

        items: list[TeacherNotificationItemResponse] = []
        for booking in pending_bookings:
            scheduled_label = self._as_utc(booking.scheduled_at).strftime("%b %d, %I:%M %p")
            items.append(
                TeacherNotificationItemResponse(
                    id=f"booking-{booking.id}",
                    type="booking_request",
                    title=f"New booking request from {booking.student.display_name}",
                    detail=f"{scheduled_label} • {booking.duration_minutes} min",
                    created_at=self._as_utc(booking.created_at).isoformat(),
                    action_path="/app/teacher/schedule",
                    count=1,
                )
            )

        for thread in inbox.threads:
            if thread.unread_count <= 0:
                continue
            items.append(
                TeacherNotificationItemResponse(
                    id=f"thread-{thread.thread_id}",
                    type="message",
                    title=f"{thread.student_name} sent {thread.unread_count} new message{'s' if thread.unread_count != 1 else ''}",
                    detail=thread.last_message_preview,
                    created_at=thread.last_message_at,
                    action_path=f"/app/teacher/messages?thread={thread.thread_id}",
                    count=thread.unread_count,
                )
            )

        items.sort(key=lambda item: item.created_at, reverse=True)
        return TeacherNotificationsResponse(
            unread_count=len(pending_bookings) + inbox.unread_count,
            items=items[:8],
        )

    def message_thread_detail(self, *, user: User, thread_id: int) -> TeacherMessageThreadResponse:
        thread = self._teacher_thread(user, thread_id)
        has_updates = False
        for message in thread.messages:
            if message.sender_id != user.id and message.read_at is None:
                message.read_at = datetime.now(UTC)
                self.db.add(message)
                has_updates = True
        if has_updates:
            self.db.commit()
            self.db.refresh(thread)

        messages = [
            TeacherMessageResponse(
                id=message.id,
                sender_id=message.sender_id,
                sender_name=message.sender.display_name,
                body=message.body,
                created_at=self._as_utc(message.created_at).isoformat(),
                is_own=message.sender_id == user.id,
            )
            for message in sorted(thread.messages, key=lambda item: self._as_utc(item.created_at))
        ]
        return TeacherMessageThreadResponse(
            thread=self._thread_summary(thread, teacher_id=user.id),
            messages=messages,
        )

    def send_message(self, *, user: User, thread_id: int, body: str) -> TeacherMessageThreadResponse:
        thread = self._teacher_thread(user, thread_id)
        cleaned_body = body.strip()
        if not cleaned_body:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message body cannot be empty.")
        message = ThreadMessage(
            thread_id=thread.id,
            sender_id=user.id,
            body=cleaned_body,
            read_at=datetime.now(UTC),
        )
        thread.last_message_at = datetime.now(UTC)
        self.db.add(message)
        self.db.add(thread)
        self.db.commit()
        return self.message_thread_detail(user=user, thread_id=thread.id)

    def update_profile_card(self, user: User, payload: TeacherProfileCardUpdateRequest) -> TeacherProfileCardResponse:
        profile = self._get_or_create_profile(user)
        profile.headline = payload.headline.strip()
        profile.intro = payload.intro.strip()
        profile.specialties = self._join_specialties(payload.specialties)
        profile.hourly_rate_usd = payload.hourly_rate_usd
        profile.lesson_duration_minutes = payload.lesson_duration_minutes
        profile.is_public = payload.is_public
        self.db.add(profile)
        self.db.commit()
        self.db.refresh(profile)
        return self._profile_card_response(user, profile)

    def teacher_directory(self) -> TeacherDirectoryResponse:
        profiles = self.db.scalars(
            select(TeacherProfile)
            .options(joinedload(TeacherProfile.user))
            .where(TeacherProfile.is_public.is_(True))
            .order_by(TeacherProfile.updated_at.desc())
        ).all()
        cards = [self._profile_card_response(profile.user, profile) for profile in profiles if profile.user.role == "teacher"]
        return TeacherDirectoryResponse(teachers=cards)

    def create_booking(
        self,
        *,
        teacher_id: int,
        student: User,
        scheduled_at_raw: str,
        duration_minutes: int | None,
        note: str | None,
    ) -> LessonBookingResponse:
        if student.role == "teacher":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teacher accounts cannot book lessons as students.")

        teacher = self.db.get(User, teacher_id)
        if teacher is None or teacher.role != "teacher":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teacher not found.")
        if teacher.id == student.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot book a lesson with yourself.")

        profile = self._get_or_create_profile(teacher)
        if not profile.is_public:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This teacher is not accepting bookings yet.")

        scheduled_at = self._parse_scheduled_at(scheduled_at_raw)
        if scheduled_at <= datetime.now(UTC):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose a future lesson time.")

        booking = LessonBooking(
            teacher_id=teacher.id,
            student_id=student.id,
            scheduled_at=scheduled_at,
            duration_minutes=duration_minutes or profile.lesson_duration_minutes,
            note=note.strip()[:500] if note and note.strip() else None,
            status="pending",
            room_name=self._build_room_name(teacher=teacher, student=student, scheduled_at=scheduled_at),
        )
        self.db.add(booking)
        self.db.commit()
        self.db.refresh(booking)
        booking.student = student
        booking.teacher = teacher
        self._seed_booking_thread(teacher=teacher, student=student, booking=booking)
        return self._booking_response(booking)

    def update_booking_status(self, *, booking_id: int, teacher: User, status_value: str) -> LessonBookingResponse:
        booking = self.db.scalar(
            select(LessonBooking)
            .options(joinedload(LessonBooking.student), joinedload(LessonBooking.teacher))
            .where(LessonBooking.id == booking_id, LessonBooking.teacher_id == teacher.id)
        )
        if booking is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")

        allowed_statuses = {"confirmed", "declined", "completed", "cancelled"}
        if status_value not in allowed_statuses:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported booking status.")

        booking.status = status_value
        self.db.add(booking)
        self.db.commit()
        self.db.refresh(booking)
        booking.student = booking.student or self.db.get(User, booking.student_id)
        booking.teacher = booking.teacher or teacher
        return self._booking_response(booking)

    def class_session(self, *, booking_id: int, user: User) -> ClassSessionResponse:
        booking = self.db.scalar(
            select(LessonBooking)
            .options(joinedload(LessonBooking.student), joinedload(LessonBooking.teacher))
            .where(
                LessonBooking.id == booking_id,
                (LessonBooking.teacher_id == user.id) | (LessonBooking.student_id == user.id),
            )
        )
        if booking is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found.")

        payload = self._booking_response(booking)
        return ClassSessionResponse(
            booking=payload,
            join_url=self._meeting_join_url(booking.room_name) if payload.can_join and booking.room_name else None,
            can_join=payload.can_join,
            meeting_domain=self.video_call_base_url,
            room_name=booking.room_name,
        )

    def _get_or_create_profile(self, user: User) -> TeacherProfile:
        profile = user.teacher_profile
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

    def _teacher_bookings(self, user: User, limit: int | None = None) -> list[LessonBooking]:
        statement = (
            select(LessonBooking)
            .options(joinedload(LessonBooking.student), joinedload(LessonBooking.teacher))
            .where(LessonBooking.teacher_id == user.id)
            .order_by(LessonBooking.scheduled_at.asc())
        )
        if limit is not None:
            statement = statement.limit(limit)
        return self.db.scalars(statement).all()

    def _student_bookings(self, user: User, limit: int | None = None) -> list[LessonBooking]:
        statement = (
            select(LessonBooking)
            .options(joinedload(LessonBooking.student), joinedload(LessonBooking.teacher))
            .where(LessonBooking.student_id == user.id)
            .order_by(LessonBooking.scheduled_at.asc())
        )
        if limit is not None:
            statement = statement.limit(limit)
        return self.db.scalars(statement).all()

    def _teacher_thread(self, user: User, thread_id: int) -> MessageThread:
        thread = self.db.execute(
            select(MessageThread)
            .options(
                joinedload(MessageThread.student),
                joinedload(MessageThread.messages).joinedload(ThreadMessage.sender),
            )
            .where(MessageThread.id == thread_id, MessageThread.teacher_id == user.id)
        )
        thread = thread.unique().scalar_one_or_none()
        if thread is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message thread not found.")
        return thread

    def _ensure_threads_for_teacher(self, user: User) -> None:
        bookings = self._teacher_bookings(user)
        created = False
        for booking in bookings:
            if booking.student is None:
                continue
            thread, was_created = self._get_or_create_thread(user, booking.student)
            created = created or was_created
            if was_created and not thread.messages:
                message_body = booking.note or (
                    f"Hi {user.display_name}, I booked a lesson for {self._as_utc(booking.scheduled_at).strftime('%b %d %I:%M %p')}."
                )
                message = ThreadMessage(
                    thread_id=thread.id,
                    sender_id=booking.student_id,
                    body=message_body,
                )
                thread.last_message_at = datetime.now(UTC)
                self.db.add(message)
                self.db.add(thread)
                created = True
        if created:
            self.db.commit()

    def _get_or_create_thread(self, teacher: User, student: User) -> tuple[MessageThread, bool]:
        thread = self.db.execute(
            select(MessageThread)
            .options(joinedload(MessageThread.student), joinedload(MessageThread.messages).joinedload(ThreadMessage.sender))
            .where(MessageThread.teacher_id == teacher.id, MessageThread.student_id == student.id)
        )
        thread = thread.unique().scalar_one_or_none()
        if thread is not None:
            return thread, False

        thread = MessageThread(
            teacher_id=teacher.id,
            student_id=student.id,
            last_message_at=datetime.now(UTC),
        )
        self.db.add(thread)
        self.db.commit()
        self.db.refresh(thread)
        thread.teacher = teacher
        thread.student = student
        return thread, True

    def _seed_booking_thread(self, *, teacher: User, student: User, booking: LessonBooking) -> None:
        thread, _ = self._get_or_create_thread(teacher, student)
        message_body = booking.note or (
            f"Hi {teacher.display_name}, I booked a lesson for {self._as_utc(booking.scheduled_at).strftime('%b %d %I:%M %p')}."
        )
        message = ThreadMessage(
            thread_id=thread.id,
            sender_id=student.id,
            body=message_body,
        )
        thread.last_message_at = datetime.now(UTC)
        self.db.add(message)
        self.db.add(thread)
        self.db.commit()

    def _thread_summary(self, thread: MessageThread, teacher_id: int) -> TeacherMessageThreadSummaryResponse:
        ordered_messages = sorted(thread.messages, key=lambda item: self._as_utc(item.created_at))
        latest_message = ordered_messages[-1] if ordered_messages else None
        preview = latest_message.body if latest_message else "Conversation started."
        unread_count = sum(1 for message in ordered_messages if message.sender_id != teacher_id and message.read_at is None)
        booking_count = len(
            self.db.scalars(
                select(LessonBooking.id).where(
                    LessonBooking.teacher_id == thread.teacher_id,
                    LessonBooking.student_id == thread.student_id,
                )
            ).all()
        )
        return TeacherMessageThreadSummaryResponse(
            thread_id=thread.id,
            student_id=thread.student_id,
            student_name=thread.student.display_name,
            student_email=thread.student.email,
            student_avatar_url=self._public_media_url(thread.student.avatar_url),
            last_message_preview=preview[:120],
            last_message_at=self._as_utc(latest_message.created_at if latest_message else thread.last_message_at).isoformat(),
            unread_count=unread_count,
            booking_count=booking_count,
        )

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

    def _profile_card_response(self, user: User, profile: TeacherProfile) -> TeacherProfileCardResponse:
        return TeacherProfileCardResponse(
            teacher_id=user.id,
            display_name=user.display_name,
            avatar_url=self._public_media_url(user.avatar_url),
            headline=profile.headline,
            intro=profile.intro,
            specialties=self._split_specialties(profile.specialties),
            hourly_rate_usd=profile.hourly_rate_usd,
            lesson_duration_minutes=profile.lesson_duration_minutes,
            is_public=profile.is_public,
        )

    def _booking_response(self, booking: LessonBooking) -> LessonBookingResponse:
        join_window = self._booking_join_window(booking)
        return LessonBookingResponse(
            id=booking.id,
            teacher_id=booking.teacher_id,
            student_id=booking.student_id,
            scheduled_at=self._as_utc(booking.scheduled_at).isoformat(),
            duration_minutes=booking.duration_minutes,
            status=booking.status,
            note=booking.note,
            student_name=booking.student.display_name,
            student_email=booking.student.email,
            teacher_name=booking.teacher.display_name,
            room_name=booking.room_name,
            can_join=join_window["can_join"],
            join_starts_at=join_window["join_starts_at"],
            join_ends_at=join_window["join_ends_at"],
            created_at=self._as_utc(booking.created_at).isoformat(),
        )

    def _booking_totals(self, bookings: list[LessonBooking]) -> dict[str, int]:
        now = datetime.now(UTC)
        return {
            "total": len(bookings),
            "upcoming": sum(1 for booking in bookings if self._as_utc(booking.scheduled_at) >= now and booking.status in {"pending", "confirmed"}),
            "pending": sum(1 for booking in bookings if booking.status == "pending"),
            "confirmed": sum(1 for booking in bookings if booking.status == "confirmed"),
            "completed": sum(1 for booking in bookings if booking.status == "completed"),
            "cancelled": sum(1 for booking in bookings if booking.status in {"declined", "cancelled"}),
        }

    def _booking_join_window(self, booking: LessonBooking) -> dict[str, str | bool]:
        scheduled_at = self._as_utc(booking.scheduled_at)
        join_starts_at = scheduled_at - timedelta(minutes=self.lesson_join_early_minutes)
        join_ends_at = scheduled_at + timedelta(minutes=booking.duration_minutes + self.lesson_join_late_minutes)
        now = datetime.now(UTC)
        return {
            "can_join": booking.status == "confirmed" and bool(booking.room_name) and join_starts_at <= now <= join_ends_at,
            "join_starts_at": join_starts_at.isoformat(),
            "join_ends_at": join_ends_at.isoformat(),
        }

    def _build_room_name(self, *, teacher: User, student: User, scheduled_at: datetime) -> str:
        slug = f"{teacher.display_name}-{student.display_name}"
        slug = re.sub(r"[^a-zA-Z0-9]+", "-", slug).strip("-").lower()
        stamp = self._as_utc(scheduled_at).strftime("%Y%m%d%H%M")
        return f"signspeak-{slug[:60]}-{stamp}-{teacher.id}-{student.id}"

    def _meeting_join_url(self, room_name: str) -> str:
        return f"{self.video_call_base_url.rstrip('/')}/{room_name}"

    def _split_specialties(self, raw: str | None) -> list[str]:
        if not raw:
            return []
        return [item.strip() for item in raw.split("|") if item.strip()]

    def _join_specialties(self, specialties: list[str]) -> str | None:
        cleaned = [item.strip()[:40] for item in specialties if item.strip()]
        return "|".join(cleaned[:6]) if cleaned else None

    def _parse_scheduled_at(self, value: str) -> datetime:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid scheduled time.") from exc
        return self._as_utc(parsed)

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
            return f"{self.backend_origin.rstrip('/')}{value}"
        return value
