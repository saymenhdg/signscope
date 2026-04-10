from __future__ import annotations

import base64
from dataclasses import dataclass
from pathlib import Path
import threading
from typing import Any

import cv2
import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from api.app_store import AppStore, AppUser
from signlang.alphabet_inference import load_alphabet_checkpoint, predict_image
from signlang.alphabet_landmark_inference import load_landmark_checkpoint, predict_landmarks
from signlang.learning_content import (
    HAND_CONNECTIONS,
    PHRASE_DRILLS,
    alphabet_reference_image,
    alphabet_sequence,
    build_alphabet_guides,
    build_word_lessons,
    word_reference_video,
)
from signlang.mediapipe_hands import MediaPipeHandTracker, draw_landmarks
from signlang.tracking import crop_to_bbox


DEFAULT_IMAGE_CHECKPOINT = Path("artifacts/alphabet_frames_v1/best.pt")
DEFAULT_LANDMARK_CHECKPOINTS = (
    Path("artifacts/alphabet_landmarks_v2/best.pt"),
    Path("artifacts/alphabet_landmarks_v3/best.pt"),
)
DEFAULT_ALPHABET_GUIDE_RECORDS = Path("data/alphabet_landmarks_v2/records.json")
DEFAULT_THRESHOLD = 0.45
DEFAULT_MIN_MARGIN = 0.10


class HealthResponse(BaseModel):
    status: str
    alphabet_model_ready: bool
    image_model_ready: bool
    landmark_model_ready: bool
    labels: list[str]


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


class UserResponse(BaseModel):
    id: int
    email: str
    display_name: str
    created_at: str


class AuthRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)


class RegisterRequest(AuthRequest):
    display_name: str = Field(..., min_length=2, max_length=80)


class AuthResponse(BaseModel):
    token: str
    expires_at: str
    user: UserResponse


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


class LearningSessionRequest(BaseModel):
    track: str = Field(..., min_length=3, max_length=32)
    unit_title: str = Field(..., min_length=2, max_length=80)
    accuracy: float = Field(..., ge=0.0, le=100.0)
    completed_items: int = Field(..., ge=1, le=200)
    duration_seconds: int = Field(..., ge=1, le=14400)
    summary: str = Field(..., min_length=4, max_length=280)


@dataclass
class AlphabetService:
    image_checkpoint_path: Path
    landmark_checkpoint_paths: tuple[Path, ...]
    threshold: float = DEFAULT_THRESHOLD
    min_margin: float = DEFAULT_MIN_MARGIN

    def __post_init__(self) -> None:
        self.lock = threading.Lock()
        self.image_model = None
        self.landmark_models: list[dict[str, Any]] = []
        self.labels: list[str] = []
        self.image_model_config: dict[str, Any] = {}
        self.image_device = None
        self.tracker: MediaPipeHandTracker | None = None
        self.error: str | None = None
        self._load()

    @property
    def ready(self) -> bool:
        return (self.image_model is not None or self.landmark_models) and self.tracker is not None

    def _load(self) -> None:
        try:
            if self.image_checkpoint_path.exists():
                self.image_model, self.labels, self.image_model_config, self.image_device = load_alphabet_checkpoint(
                    self.image_checkpoint_path
                )
            for checkpoint_path in self.landmark_checkpoint_paths:
                if not checkpoint_path.exists():
                    continue
                model, landmark_labels, landmark_model_config, landmark_device = load_landmark_checkpoint(checkpoint_path)
                if not self.labels:
                    self.labels = landmark_labels
                elif landmark_labels != self.labels:
                    raise ValueError("Image and landmark checkpoint labels do not match")
                self.landmark_models.append(
                    {
                        "path": checkpoint_path,
                        "model": model,
                        "config": landmark_model_config,
                        "device": landmark_device,
                    }
                )
            if not self.labels:
                self.error = (
                    f"No alphabet checkpoint found at {self.image_checkpoint_path} "
                    f"or any of {[str(path) for path in self.landmark_checkpoint_paths]}"
                )
                return
            self.tracker = MediaPipeHandTracker(
                max_num_hands=1,
                min_hand_detection_confidence=0.4,
                min_hand_presence_confidence=0.35,
                min_tracking_confidence=0.3,
                pad_scale=2.0,
                min_crop_ratio=0.48,
            )
        except Exception as exc:
            self.error = str(exc)

    def health(self) -> HealthResponse:
        return HealthResponse(
            status="ok" if self.ready else "degraded",
            alphabet_model_ready=self.ready,
            image_model_ready=self.image_model is not None,
            landmark_model_ready=bool(self.landmark_models),
            labels=self.labels,
        )

    def predict(self, request: PredictRequest) -> PredictResponse:
        if not self.ready:
            raise HTTPException(status_code=503, detail=self.error or "Alphabet model is not ready")

        frame_bgr = decode_base64_image(request.image_base64)
        target_letter = request.target_letter.upper() if request.target_letter is not None else None
        if target_letter is not None and target_letter not in self.labels:
            raise HTTPException(status_code=400, detail=f"Unknown target letter: {target_letter}")

        assert self.tracker is not None
        with self.lock:
            tracking_result = self.tracker.update(frame_bgr)

        annotated = frame_bgr.copy()
        crop = frame_bgr
        tracking_detected = bool(tracking_result.landmarks)

        if tracking_detected and tracking_result.bbox is not None:
            x, y, width, height = tracking_result.bbox
            cv2.rectangle(annotated, (x, y), (x + width, y + height), (40, 220, 80), 2)
            crop = crop_to_bbox(frame_bgr, tracking_result.bbox)

        if tracking_result.landmarks:
            draw_landmarks(annotated, tracking_result)

        distribution, model_source = self._predict_distribution(
            frame_bgr=frame_bgr,
            crop_bgr=crop,
            tracking_result=tracking_result,
        )
        top_predictions = [
            TopPrediction(label=label, score=float(score))
            for label, score in sorted(distribution.items(), key=lambda item: item[1], reverse=True)[:3]
        ]
        predicted_label = top_predictions[0].label
        confidence = top_predictions[0].score
        runner_up_score = top_predictions[1].score if len(top_predictions) > 1 else 0.0
        margin = confidence - runner_up_score
        threshold = request.threshold if request.threshold is not None else self.threshold
        min_margin = request.min_margin if request.min_margin is not None else self.min_margin
        is_confident = tracking_detected and confidence >= threshold and margin >= min_margin
        matches_target = predicted_label == target_letter and is_confident if target_letter is not None else None

        feedback = build_feedback(
            target_letter=target_letter,
            predicted_label=predicted_label,
            confidence=confidence,
            threshold=threshold,
            margin=margin,
            min_margin=min_margin,
            tracking_detected=tracking_detected,
            model_source=model_source,
            top_predictions=top_predictions,
        )

        return PredictResponse(
            target_letter=target_letter,
            predicted_letter=predicted_label,
            confidence=confidence,
            is_confident=is_confident,
            matches_target=matches_target,
            tracking_detected=tracking_detected,
            feedback=feedback,
            top_predictions=top_predictions,
            annotated_image_base64=encode_base64_image(annotated) if request.include_annotated_image else None,
        )

    def validate(self, request: ValidateRequest) -> ValidateResponse:
        prediction = self.predict(
            PredictRequest(
                image_base64=request.image_base64,
                target_letter=request.target_letter,
                threshold=request.threshold,
                min_margin=request.min_margin,
                include_annotated_image=request.include_annotated_image,
            )
        )
        return ValidateResponse(
            target_letter=request.target_letter.upper(),
            predicted_letter=prediction.predicted_letter,
            confidence=prediction.confidence,
            is_confident=prediction.is_confident,
            matches_target=prediction.matches_target,
            is_correct=bool(prediction.matches_target),
            tracking_detected=prediction.tracking_detected,
            feedback=prediction.feedback,
            top_predictions=prediction.top_predictions,
            annotated_image_base64=prediction.annotated_image_base64,
        )

    def _predict_distribution(
        self,
        frame_bgr: np.ndarray,
        crop_bgr: np.ndarray,
        tracking_result,
    ) -> tuple[dict[str, float], str]:
        landmark_distribution: dict[str, float] | None = None
        image_distribution: dict[str, float] | None = None

        if self.landmark_models and tracking_result.landmarks:
            distributions: list[dict[str, float]] = []
            landmarks = tracking_result.landmarks_xyz[0] if tracking_result.landmarks_xyz else tracking_result.landmarks[0]
            handedness = tracking_result.handedness[0] if tracking_result.handedness else None
            for bundle in self.landmark_models:
                _label, _confidence, distribution = predict_landmarks(
                    model=bundle["model"],
                    landmarks=landmarks,
                    bbox=tracking_result.bbox,
                    handedness=handedness,
                    labels=self.labels,
                    device=bundle["device"],
                )
                distributions.append(distribution)
            landmark_distribution = {
                label: float(sum(distribution[label] for distribution in distributions) / len(distributions))
                for label in self.labels
            }

        if self.image_model is not None:
            _label, _confidence, image_distribution = predict_image(
                model=self.image_model,
                frame_bgr=crop_bgr,
                labels=self.labels,
                model_config=self.image_model_config,
                device=self.image_device,
            )

        if landmark_distribution is not None:
            source = "landmark-ensemble" if len(self.landmark_models) > 1 else "landmark"
            return landmark_distribution, source
        if image_distribution is not None:
            return image_distribution, "image"
        raise HTTPException(status_code=503, detail="No alphabet model is ready for prediction")


def decode_base64_image(payload: str) -> np.ndarray:
    encoded = payload.split(",", 1)[1] if "," in payload else payload
    buffer = base64.b64decode(encoded)
    array = np.frombuffer(buffer, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Failed to decode image")
    return image


def encode_base64_image(frame_bgr: np.ndarray) -> str:
    ok, encoded = cv2.imencode(".jpg", frame_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    if not ok:
        return ""
    return "data:image/jpeg;base64," + base64.b64encode(encoded.tobytes()).decode("ascii")


def build_feedback(
    target_letter: str | None,
    predicted_label: str,
    confidence: float,
    threshold: float,
    margin: float,
    min_margin: float,
    tracking_detected: bool,
    model_source: str,
    top_predictions: list[TopPrediction],
) -> str:
    guesses = ", ".join(f"{item.label} {item.score:.2f}" for item in top_predictions)
    tracking_line = "hand tracked" if tracking_detected else "no stable hand crop detected"
    margin_line = f"margin {margin:.2f}"
    note = ""
    if target_letter in {"J", "Z"}:
        note = " J and Z are motion letters, so single-frame validation is weaker."
    if not tracking_detected and confidence < threshold:
        return (
            f"Move one hand closer to the camera and keep it centered; {tracking_line}. "
            f"Predictor {model_source}. Top guesses: {guesses}.{note}"
        )
    if not tracking_detected:
        if target_letter is None:
            return (
                f"Live prediction is {predicted_label} at confidence {confidence:.2f}, but hand tracking is weak. "
                f"Center the hand more clearly. Predictor {model_source}. Top guesses: {guesses}.{note}"
            )
        return (
            f"Target {target_letter}; current guess is {predicted_label} at confidence {confidence:.2f}, "
            f"but hand tracking is weak. Center the hand more clearly. Predictor {model_source}. Top guesses: {guesses}.{note}"
        )
    if confidence < threshold or margin < min_margin:
        if target_letter is None:
            return (
                f"Live guess is {predicted_label} at confidence {confidence:.2f}, but it is still unstable. "
                f"Hold the handshape steady. Predictor {model_source}, {margin_line}. Top guesses: {guesses}.{note}"
            )
        return (
            f"Target {target_letter}; current guess is {predicted_label} at confidence {confidence:.2f}. "
            f"Hold the handshape steady. Predictor {model_source}, {margin_line}. Top guesses: {guesses}.{note}"
        )
    if target_letter is None:
        return (
            f"Live prediction: {predicted_label} at confidence {confidence:.2f}; {tracking_line}. "
            f"Predictor {model_source}, {margin_line}. Top guesses: {guesses}.{note}"
        )
    verdict = "Correct" if predicted_label == target_letter else "Try again"
    return (
        f"{verdict}. Target {target_letter}, predicted {predicted_label} at confidence {confidence:.2f}; "
        f"{tracking_line}. Predictor {model_source}, {margin_line}. Top guesses: {guesses}.{note}"
    )


def _validate_email(email: str) -> str:
    normalized = email.strip().lower()
    if "@" not in normalized or "." not in normalized.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    return normalized


def _user_response(user: AppUser) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        created_at=user.created_at,
    )


app_store = AppStore()
service = AlphabetService(DEFAULT_IMAGE_CHECKPOINT, DEFAULT_LANDMARK_CHECKPOINTS)
try:
    alphabet_guides = build_alphabet_guides(DEFAULT_ALPHABET_GUIDE_RECORDS)
except Exception:
    alphabet_guides = {}
word_lessons = build_word_lessons()


def get_current_user(authorization: str | None = Header(default=None)) -> AppUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    user = app_store.get_user_by_token(token)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired. Please sign in again.")
    return user

app = FastAPI(title="Sign Language Learning API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/auth/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(request: RegisterRequest) -> AuthResponse:
    email = _validate_email(request.email)
    try:
        user = app_store.create_user(
            email=email,
            display_name=request.display_name,
            password=request.password,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    token, expires_at = app_store.create_session(user_id=user.id)
    return AuthResponse(token=token, expires_at=expires_at, user=_user_response(user))


@app.post("/api/auth/login", response_model=AuthResponse)
def login(request: AuthRequest) -> AuthResponse:
    email = _validate_email(request.email)
    user = app_store.authenticate_user(email=email, password=request.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")
    token, expires_at = app_store.create_session(user_id=user.id)
    return AuthResponse(token=token, expires_at=expires_at, user=_user_response(user))


@app.get("/api/auth/me", response_model=UserResponse)
def me(current_user: AppUser = Depends(get_current_user)) -> UserResponse:
    return _user_response(current_user)


@app.post("/api/auth/logout", response_model=MessageResponse)
def logout(
    current_user: AppUser = Depends(get_current_user),
    authorization: str | None = Header(default=None),
) -> MessageResponse:
    del current_user
    assert authorization is not None
    token = authorization.split(" ", 1)[1].strip()
    app_store.delete_session(token)
    return MessageResponse(status="ok", detail="Signed out.")


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return service.health()


@app.get("/api/dashboard/overview", response_model=DashboardOverviewResponse)
def dashboard_overview(current_user: AppUser = Depends(get_current_user)) -> DashboardOverviewResponse:
    try:
        payload = app_store.get_dashboard_overview(current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return DashboardOverviewResponse(**payload)


@app.get("/api/progress/overview", response_model=ProgressOverviewResponse)
def progress_overview(current_user: AppUser = Depends(get_current_user)) -> ProgressOverviewResponse:
    try:
        payload = app_store.get_progress_overview(current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ProgressOverviewResponse(**payload)


@app.get("/api/learn/alphabet", response_model=AlphabetLessonResponse)
def learn_alphabet(current_user: AppUser = Depends(get_current_user)) -> AlphabetLessonResponse:
    del current_user
    labels = alphabet_sequence(list(alphabet_guides))
    sequence = [
        AlphabetLessonItem(
            label=label,
            cue=str(alphabet_guides[label]["cue"]),
            motion_letter=bool(alphabet_guides[label]["motion_letter"]),
            guide_points=[GuidePoint(**point) for point in alphabet_guides[label]["guide_points"]],
            reference_image_path=(
                f"/api/learn/alphabet/reference/{label}"
                if alphabet_reference_image(label) is not None
                else None
            ),
        )
        for label in labels
    ]
    return AlphabetLessonResponse(
        sequence=sequence,
        connections=HAND_CONNECTIONS,
        stable_frames=3,
        threshold=DEFAULT_THRESHOLD,
        min_margin=DEFAULT_MIN_MARGIN,
        note=(
            "J and Z are motion letters. The live coach will still confirm them, "
            "but they need a clearer movement path than the other letters."
        ),
    )


@app.get("/api/learn/words", response_model=WordLessonResponse)
def learn_words(current_user: AppUser = Depends(get_current_user)) -> WordLessonResponse:
    del current_user
    items = [
        WordLessonItem(
            label=str(item["label"]),
            title=str(item["title"]),
            category=str(item["category"]),
            difficulty=str(item["difficulty"]),
            description=str(item["description"]),
            coach_tip=str(item["coach_tip"]),
            phrase=str(item["phrase"]),
            reference_video_path=(
                f"/api/learn/words/reference/{item['label']}"
                if item.get("reference_video_path") is not None
                else None
            ),
        )
        for item in word_lessons
    ]
    return WordLessonResponse(
        items=items,
        phrase_drills=[PhraseDrill(**item) for item in PHRASE_DRILLS],
        note=(
            "This word track is curated around the seven most reliable words in the current PyTorch word model. "
            "Use it as a guided vocabulary set before moving into longer sentence work."
        ),
    )


@app.get("/api/learn/alphabet/reference/{label}")
def alphabet_reference(label: str) -> FileResponse:
    path = alphabet_reference_image(label)
    if path is None:
        raise HTTPException(status_code=404, detail=f"No alphabet reference image for {label}.")
    return FileResponse(path)


@app.get("/api/learn/words/reference/{label}")
def word_reference(label: str) -> FileResponse:
    path = word_reference_video(label)
    if path is None:
        raise HTTPException(status_code=404, detail=f"No word reference video for {label}.")
    return FileResponse(path)


@app.post("/api/learn/session", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
def record_learning_session(
    request: LearningSessionRequest,
    current_user: AppUser = Depends(get_current_user),
) -> MessageResponse:
    track = request.track.strip().lower()
    if track not in {"alphabet", "words"}:
        raise HTTPException(status_code=400, detail="Track must be alphabet or words.")

    category = "Alphabet Coach" if track == "alphabet" else "Word Lab"
    source_type = "alphabet-coach" if track == "alphabet" else "word-lab"
    duration_minutes = max(1, int(round(request.duration_seconds / 60)))

    try:
        app_store.record_learning_session(
            user_id=current_user.id,
            category=category,
            accuracy=request.accuracy,
            signs_mastered=request.completed_items,
            duration_minutes=duration_minutes,
            source_type=source_type,
            transcript=request.summary,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return MessageResponse(
        status="ok",
        detail=f"Saved {request.unit_title} session.",
    )


@app.get("/api/alphabet/letters", response_model=LettersResponse)
def alphabet_letters() -> LettersResponse:
    return LettersResponse(labels=service.labels)


@app.get("/api/alphabet/random", response_model=RandomLetterResponse)
def random_letter() -> RandomLetterResponse:
    if not service.labels:
        raise HTTPException(status_code=503, detail="Alphabet labels are not available")
    index = int(np.random.randint(0, len(service.labels)))
    return RandomLetterResponse(letter=service.labels[index])


@app.post("/api/alphabet/predict", response_model=PredictResponse)
def predict_alphabet(request: PredictRequest) -> PredictResponse:
    return service.predict(request)


@app.post("/api/alphabet/validate", response_model=ValidateResponse)
def validate_alphabet(request: ValidateRequest) -> ValidateResponse:
    return service.validate(request)
