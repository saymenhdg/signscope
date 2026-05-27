from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from api.app.dependencies import get_admin_service, get_current_admin
from api.app.models import User
from api.app.schemas import (
    AdminClassesResponse,
    AdminOverviewResponse,
    AdminTeacherProfileUpdateRequest,
    AdminTeacherProfilesResponse,
    AdminUserUpdateRequest,
    AdminUsersResponse,
)
from api.app.services.admin_service import AdminService


router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/overview", response_model=AdminOverviewResponse)
def admin_overview(
    _current_admin: User = Depends(get_current_admin),
    admin_service: AdminService = Depends(get_admin_service),
) -> AdminOverviewResponse:
    return AdminOverviewResponse(**admin_service.get_overview())


@router.get("/users", response_model=AdminUsersResponse)
def admin_users(
    _current_admin: User = Depends(get_current_admin),
    admin_service: AdminService = Depends(get_admin_service),
) -> AdminUsersResponse:
    return AdminUsersResponse(users=admin_service.list_users())


@router.get("/teachers", response_model=AdminTeacherProfilesResponse)
def admin_teachers(
    _current_admin: User = Depends(get_current_admin),
    admin_service: AdminService = Depends(get_admin_service),
) -> AdminTeacherProfilesResponse:
    return AdminTeacherProfilesResponse(teachers=admin_service.list_teacher_profiles())


@router.get("/classes", response_model=AdminClassesResponse)
def admin_classes(
    _current_admin: User = Depends(get_current_admin),
    admin_service: AdminService = Depends(get_admin_service),
) -> AdminClassesResponse:
    return AdminClassesResponse(classes=admin_service.list_classes())


@router.patch("/users/{user_id}")
def admin_update_user(
    user_id: int,
    request: AdminUserUpdateRequest,
    _current_admin: User = Depends(get_current_admin),
    admin_service: AdminService = Depends(get_admin_service),
):
    try:
        return admin_service.update_user(user_id=user_id, payload=request)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.patch("/teachers/{teacher_id}")
def admin_update_teacher(
    teacher_id: int,
    request: AdminTeacherProfileUpdateRequest,
    _current_admin: User = Depends(get_current_admin),
    admin_service: AdminService = Depends(get_admin_service),
):
    try:
        return admin_service.update_teacher_profile(teacher_id=teacher_id, payload=request)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
