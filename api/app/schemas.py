from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class UserResponse(BaseModel):
    id: int
    email: str
    display_name: str
    age: int | None
    bio: str | None
    avatar_url: str | None
    created_at: str


class AuthRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)


class RegisterRequest(AuthRequest):
    display_name: str = Field(..., min_length=2, max_length=80)


class AuthResponse(BaseModel):
    expires_at: str
    user: UserResponse


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)


class ForgotPasswordResponse(BaseModel):
    status: str
    detail: str
    reset_url: str | None = None


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=16, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)


class AuthProviderOption(BaseModel):
    id: str
    label: str
    start_url: str


class AuthProvidersResponse(BaseModel):
    providers: list[AuthProviderOption]


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=2, max_length=80)
    age: int | None = Field(default=None, ge=1, le=120)
    bio: str | None = Field(default=None, max_length=280)


class MessageResponse(BaseModel):
    status: str
    detail: str


class DashboardOverviewResponse(BaseModel):
    stats: dict[str, Any]
    recent_translations: list[dict[str, Any]]
    recent_detections: list[str]
    categories: list[dict[str, Any]]
    insight: dict[str, str]


class ProgressOverviewResponse(BaseModel):
    totals: dict[str, Any]
    heatmap: list[int]
    weekly_accuracy: list[float]
    categories: list[dict[str, Any]]
    weak_areas: list[dict[str, Any]]
    achievements: list[dict[str, Any]]


class HealthResponse(BaseModel):
    status: str
    alphabet_model_ready: bool
    image_model_ready: bool
    landmark_model_ready: bool
    word_model_ready: bool = False
    word_labels: list[str] = Field(default_factory=list)
    labels: list[str]
    oauth_providers: list[str]


class LettersResponse(BaseModel):
    labels: list[str]


class RandomLetterResponse(BaseModel):
    letter: str


class TopPrediction(BaseModel):
    label: str
    score: float


class PredictRequest(BaseModel):
    image_base64: str = Field(..., description="Data URL or plain base64 encoded image")
    target_letter: str | None = Field(default=None, min_length=1, max_length=1)
    threshold: float | None = Field(default=None, ge=0.0, le=1.0)
    min_margin: float | None = Field(default=None, ge=0.0, le=1.0)
    include_annotated_image: bool = False


class PredictResponse(BaseModel):
    target_letter: str | None
    predicted_letter: str
    confidence: float
    is_confident: bool
    matches_target: bool | None
    tracking_detected: bool
    feedback: str
    top_predictions: list[TopPrediction]
    annotated_image_base64: str | None


class ValidateRequest(PredictRequest):
    target_letter: str = Field(..., min_length=1, max_length=1)
    include_annotated_image: bool = True


class ValidateResponse(PredictResponse):
    target_letter: str
    is_correct: bool


class GuidePoint(BaseModel):
    x: float
    y: float
    z: float


class AlphabetLessonItem(BaseModel):
    label: str
    cue: str
    motion_letter: bool
    guide_points: list[GuidePoint]
    reference_image_path: str | None


class AlphabetLessonResponse(BaseModel):
    sequence: list[AlphabetLessonItem]
    connections: list[tuple[int, int]]
    stable_frames: int
    threshold: float
    min_margin: float
    note: str


class WordLessonItem(BaseModel):
    label: str
    title: str
    category: str
    difficulty: str
    description: str
    coach_tip: str
    phrase: str
    reference_video_path: str | None


class PhraseDrill(BaseModel):
    title: str
    phrase: str
    focus: str


class WordLessonResponse(BaseModel):
    items: list[WordLessonItem]
    phrase_drills: list[PhraseDrill]
    note: str


class WordPredictRequest(BaseModel):
    frames: list[list[float]] = Field(
        ...,
        description="Sequence of per-frame landmark feature vectors, each 167-dim.",
        min_length=1,
    )
    top_k: int | None = Field(default=None, ge=1, le=25)
    target_word: str | None = Field(default=None, min_length=1, max_length=64)


class WordPredictFramesRequest(BaseModel):
    images_base64: list[str] = Field(
        ...,
        description="Ordered sequence of base64-encoded JPEG/PNG frames captured from the camera.",
        min_length=4,
        max_length=96,
    )
    top_k: int | None = Field(default=None, ge=1, le=25)
    target_word: str | None = Field(default=None, min_length=1, max_length=64)


class WordPrediction(BaseModel):
    label: str
    score: float


class WordPredictResponse(BaseModel):
    predicted_word: str
    confidence: float
    is_confident: bool = False
    matches_target: bool | None = None
    tracking_detected: bool = True
    valid_frame_ratio: float = 1.0
    feedback: str = ""
    target_word: str | None = None
    top_predictions: list[WordPrediction]


class WordVocabularyResponse(BaseModel):
    labels: list[str]
    sequence_length: int
    feature_dim: int
    ready: bool


class LearningSessionRequest(BaseModel):
    track: str = Field(..., min_length=3, max_length=32)
    unit_title: str = Field(..., min_length=2, max_length=80)
    accuracy: float = Field(..., ge=0.0, le=100.0)
    completed_items: int = Field(..., ge=1, le=200)
    duration_seconds: int = Field(..., ge=1, le=14400)
    summary: str = Field(..., min_length=4, max_length=280)
