from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from api.app.dependencies import get_analytics_service, get_current_user, get_learning_catalog_service
from api.app.models import User
from api.app.schemas import (
    AlphabetLessonResponse,
    LearningAttemptRequest,
    LearningSessionRequest,
    MessageResponse,
    WordLessonResponse,
)
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


@router.get("/alphabet/reference-video/{label}")
def alphabet_reference_video(
    label: str,
    learning_service: LearningCatalogService = Depends(get_learning_catalog_service),
) -> FileResponse:
    path = learning_service.alphabet_reference_video(label)
    if path is None:
        raise HTTPException(status_code=404, detail=f"No alphabet reference video for {label}.")
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

    category = request.category.strip() if request.category else ("Alphabet Coach" if track == "alphabet" else "Word Studio")
    source_type = request.source_type.strip() if request.source_type else ("alphabet-coach" if track == "alphabet" else "word-practice")
    analytics_service.record_learning_session(
        user=current_user,
        track=track,
        category=category,
        unit_title=request.unit_title,
        accuracy=request.accuracy,
        completed_items=request.completed_items,
        correct_items=request.correct_items if request.correct_items is not None else request.completed_items,
        attempts_count=request.attempts_count if request.attempts_count is not None else request.completed_items,
        duration_seconds=request.duration_seconds,
        source_type=source_type,
        summary=request.summary,
    )
    return MessageResponse(status="ok", detail=f"Saved {request.unit_title} session.")


@router.post("/attempt", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
def record_learning_attempt(
    request: LearningAttemptRequest,
    current_user: User = Depends(get_current_user),
    analytics_service: AnalyticsService = Depends(get_analytics_service),
) -> MessageResponse:
    track = request.track.strip().lower()
    if track not in {"alphabet", "words"}:
        raise HTTPException(status_code=400, detail="Track must be alphabet or words.")

    analytics_service.record_learning_attempt(
        user=current_user,
        track=track,
        category=request.category,
        expected_label=request.expected_label,
        predicted_label=request.predicted_label,
        confidence=request.confidence,
        is_confident=request.is_confident,
        is_correct=request.is_correct,
        tracking_detected=request.tracking_detected,
        valid_frame_ratio=request.valid_frame_ratio,
    )
    return MessageResponse(status="ok", detail="Saved learning attempt.")

