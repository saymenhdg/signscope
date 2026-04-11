from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from api.app.dependencies import get_analytics_service, get_current_user, get_learning_catalog_service
from api.app.models import User
from api.app.schemas import AlphabetLessonResponse, LearningSessionRequest, MessageResponse, WordLessonResponse
from api.app.services.analytics_service import AnalyticsService
from api.app.services.learning_service import LearningCatalogService


router = APIRouter(prefix="/api/learn", tags=["learning"])


@router.get("/alphabet", response_model=AlphabetLessonResponse)
def learn_alphabet(
    current_user: User = Depends(get_current_user),
    learning_service: LearningCatalogService = Depends(get_learning_catalog_service),
) -> AlphabetLessonResponse:
    del current_user
    return learning_service.alphabet_lesson()


@router.get("/words", response_model=WordLessonResponse)
def learn_words(
    current_user: User = Depends(get_current_user),
    learning_service: LearningCatalogService = Depends(get_learning_catalog_service),
) -> WordLessonResponse:
    del current_user
    return learning_service.word_lesson()


@router.get("/alphabet/reference/{label}")
def alphabet_reference(
    label: str,
    learning_service: LearningCatalogService = Depends(get_learning_catalog_service),
) -> FileResponse:
    path = learning_service.alphabet_reference(label)
    if path is None:
        raise HTTPException(status_code=404, detail=f"No alphabet reference image for {label}.")
    return FileResponse(path)


@router.get("/words/reference/{label}")
def word_reference(
    label: str,
    learning_service: LearningCatalogService = Depends(get_learning_catalog_service),
) -> FileResponse:
    path = learning_service.word_reference(label)
    if path is None:
        raise HTTPException(status_code=404, detail=f"No word reference video for {label}.")
    return FileResponse(path)


@router.post("/session", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
def record_learning_session(
    request: LearningSessionRequest,
    current_user: User = Depends(get_current_user),
    analytics_service: AnalyticsService = Depends(get_analytics_service),
) -> MessageResponse:
    track = request.track.strip().lower()
    if track not in {"alphabet", "words"}:
        raise HTTPException(status_code=400, detail="Track must be alphabet or words.")

    category = "Alphabet Coach" if track == "alphabet" else "Word Lab"
    source_type = "alphabet-coach" if track == "alphabet" else "word-lab"
    analytics_service.record_learning_session(
        user=current_user,
        category=category,
        accuracy=request.accuracy,
        signs_mastered=request.completed_items,
        duration_minutes=max(1, int(round(request.duration_seconds / 60))),
        source_type=source_type,
        transcript=request.summary,
    )
    return MessageResponse(status="ok", detail=f"Saved {request.unit_title} session.")
