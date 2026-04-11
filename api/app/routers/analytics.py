from __future__ import annotations

from fastapi import APIRouter, Depends

from api.app.dependencies import get_analytics_service, get_current_user
from api.app.models import User
from api.app.schemas import DashboardOverviewResponse, ProgressOverviewResponse
from api.app.services.analytics_service import AnalyticsService


router = APIRouter(prefix="/api", tags=["analytics"])


@router.get("/dashboard/overview", response_model=DashboardOverviewResponse)
def dashboard_overview(
    current_user: User = Depends(get_current_user),
    analytics_service: AnalyticsService = Depends(get_analytics_service),
) -> DashboardOverviewResponse:
    return DashboardOverviewResponse(**analytics_service.get_dashboard_overview(current_user))


@router.get("/progress/overview", response_model=ProgressOverviewResponse)
def progress_overview(
    current_user: User = Depends(get_current_user),
    analytics_service: AnalyticsService = Depends(get_analytics_service),
) -> ProgressOverviewResponse:
    return ProgressOverviewResponse(**analytics_service.get_progress_overview(current_user))
