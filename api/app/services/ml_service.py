from __future__ import annotations

import base64
from dataclasses import dataclass
from pathlib import Path
import threading
from typing import Any

import cv2
import numpy as np
from fastapi import HTTPException

from api.app.config import Settings
from api.app.schemas import HealthResponse, PredictRequest, PredictResponse, TopPrediction, ValidateRequest, ValidateResponse
from signlang.alphabet_inference import load_alphabet_checkpoint, predict_image
from signlang.alphabet_landmark_inference import load_landmark_checkpoint, predict_landmarks
from signlang.mediapipe_hands import MediaPipeHandTracker, draw_landmarks
from signlang.tracking import crop_to_bbox


@dataclass
class AlphabetInferenceService:
    settings: Settings

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

    def health(self) -> HealthResponse:
        return HealthResponse(
            status="ok" if self.ready else "degraded",
            alphabet_model_ready=self.ready,
            image_model_ready=self.image_model is not None,
            landmark_model_ready=bool(self.landmark_models),
            labels=self.labels,
            oauth_providers=[],
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

        distribution, model_source = self._predict_distribution(frame_bgr=frame_bgr, crop_bgr=crop, tracking_result=tracking_result)
        top_predictions = [
            TopPrediction(label=label, score=float(score))
            for label, score in sorted(distribution.items(), key=lambda item: item[1], reverse=True)[:3]
        ]
        predicted_label = top_predictions[0].label
        confidence = top_predictions[0].score
        runner_up_score = top_predictions[1].score if len(top_predictions) > 1 else 0.0
        margin = confidence - runner_up_score
        threshold = request.threshold if request.threshold is not None else self.settings.alphabet_threshold
        min_margin = request.min_margin if request.min_margin is not None else self.settings.alphabet_min_margin
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

    def _load(self) -> None:
        try:
            image_checkpoint = Path(self.settings.alphabet_image_checkpoint)
            if image_checkpoint.exists():
                self.image_model, self.labels, self.image_model_config, self.image_device = load_alphabet_checkpoint(image_checkpoint)

            for checkpoint_path_str in self.settings.alphabet_landmark_checkpoints:
                checkpoint_path = Path(checkpoint_path_str)
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
                self.error = "No alphabet checkpoints could be loaded."
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

    def _predict_distribution(self, frame_bgr: np.ndarray, crop_bgr: np.ndarray, tracking_result) -> tuple[dict[str, float], str]:
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
