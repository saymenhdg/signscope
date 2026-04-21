from __future__ import annotations

from fastapi import APIRouter, Depends

from api.app.config import Settings, get_settings
from api.app.dependencies import get_current_teacher, get_current_user
from api.app.models import User
from api.app.schemas import (
    LessonBookingCreateRequest,
    LessonBookingResponse,
    LessonBookingStatusUpdateRequest,
    TeacherDashboardResponse,
    TeacherDirectoryResponse,
    TeacherMessageCreateRequest,
    TeacherMessagesInboxResponse,
    TeacherMessageThreadResponse,
    TeacherNotificationsResponse,
    TeacherProfileCardResponse,
    TeacherProfileCardUpdateRequest,
    TeacherScheduleResponse,
)
from api.app.services.teacher_service import TeacherService
from api.app.db import get_db


router = APIRouter(tags=["teacher"])


@router.get("/api/teacher/dashboard", response_model=TeacherDashboardResponse)
def teacher_dashboard(
    current_teacher: User = Depends(get_current_teacher),
    db=Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TeacherDashboardResponse:
    return TeacherService(db, settings.backend_origin).dashboard_overview(current_teacher)


@router.get("/api/teacher/schedule", response_model=TeacherScheduleResponse)
def teacher_schedule(
    current_teacher: User = Depends(get_current_teacher),
    db=Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TeacherScheduleResponse:
    return TeacherService(db, settings.backend_origin).schedule_overview(current_teacher)


@router.put("/api/teacher/profile-card", response_model=TeacherProfileCardResponse)
def update_teacher_profile_card(
    request: TeacherProfileCardUpdateRequest,
    current_teacher: User = Depends(get_current_teacher),
    db=Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TeacherProfileCardResponse:
    return TeacherService(db, settings.backend_origin).update_profile_card(current_teacher, request)


@router.get("/api/teachers", response_model=TeacherDirectoryResponse)
def teacher_directory(
    db=Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TeacherDirectoryResponse:
    return TeacherService(db, settings.backend_origin).teacher_directory()


@router.post("/api/teachers/{teacher_id}/bookings", response_model=LessonBookingResponse)
def create_teacher_booking(
    teacher_id: int,
    request: LessonBookingCreateRequest,
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> LessonBookingResponse:
    return TeacherService(db, settings.backend_origin).create_booking(
        teacher_id=teacher_id,
        student=current_user,
        scheduled_at_raw=request.scheduled_at,
        duration_minutes=request.duration_minutes,
        note=request.note,
    )


@router.patch("/api/teacher/bookings/{booking_id}", response_model=LessonBookingResponse)
def update_teacher_booking_status(
    booking_id: int,
    request: LessonBookingStatusUpdateRequest,
    current_teacher: User = Depends(get_current_teacher),
    db=Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> LessonBookingResponse:
    return TeacherService(db, settings.backend_origin).update_booking_status(
        booking_id=booking_id,
        teacher=current_teacher,
        status_value=request.status,
    )


@router.get("/api/teacher/messages", response_model=TeacherMessagesInboxResponse)
def teacher_messages_inbox(
    current_teacher: User = Depends(get_current_teacher),
    db=Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TeacherMessagesInboxResponse:
    return TeacherService(db, settings.backend_origin).messages_inbox(current_teacher)


@router.get("/api/teacher/notifications", response_model=TeacherNotificationsResponse)
def teacher_notifications(
    current_teacher: User = Depends(get_current_teacher),
    db=Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TeacherNotificationsResponse:
    return TeacherService(db, settings.backend_origin).notifications_overview(current_teacher)


@router.get("/api/teacher/messages/{thread_id}", response_model=TeacherMessageThreadResponse)
def teacher_message_thread(
    thread_id: int,
    current_teacher: User = Depends(get_current_teacher),
    db=Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TeacherMessageThreadResponse:
    return TeacherService(db, settings.backend_origin).message_thread_detail(user=current_teacher, thread_id=thread_id)


@router.post("/api/teacher/messages/{thread_id}", response_model=TeacherMessageThreadResponse)
def teacher_send_message(
    thread_id: int,
    request: TeacherMessageCreateRequest,
    current_teacher: User = Depends(get_current_teacher),
    db=Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TeacherMessageThreadResponse:
    return TeacherService(db, settings.backend_origin).send_message(
        user=current_teacher,
        thread_id=thread_id,
        body=request.body,
    )
