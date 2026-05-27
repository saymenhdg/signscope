from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import threading
from typing import Any

import cv2
import numpy as np
from fastapi import HTTPException

from api.app.config import Settings
from api.app.schemas import (
    WordPredictFramesRequest,
    WordPredictRequest,
    WordPredictResponse,
    WordPrediction,
    WordVocabularyResponse,
)
from api.app.services.ml_service import decode_base64_image as _decode_base64_image
from signlang.word_landmark_data import PER_FRAME_FEATURE_DIM, fill_missing_frames, normalize_frame
from signlang.word_landmark_inference import load_word_checkpoint, predict_word_sequence


HAND_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
HAND_MODEL_PATH = Path("artifacts/models/hand_landmarker.task")
POSE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
POSE_MODEL_PATH = Path("artifacts/models/pose_landmarker_lite.task")


@dataclass
class WordInferenceService:
    """Lazy-loaded word recognition service.

    The checkpoint may not exist at boot (the user may not have trained yet),
    so loading is best-effort and the service reports ``ready=False`` until
    the model is present. This keeps the API server bootable even on a fresh
    clone where only the alphabet model is available.
    """

    settings: Settings

    def __post_init__(self) -> None:
        self.lock = threading.Lock()
        self.model = None
        self.labels: list[str] = []
        self.model_config: dict[str, Any] = {}
        self.device = None
        self.error: str | None = None
        # MediaPipe landmarkers are initialized lazily on the first frame-based
        # request so that API boot does not pay the model-download cost.
        self._hand_landmarker = None
        self._pose_landmarker = None
        self._landmarker_error: str | None = None
        self._timestamp_ms = 0
        self._try_load()

    @property
    def ready(self) -> bool:
        return self.model is not None

    def _try_load(self) -> None:
        checkpoint_path = Path(self.settings.word_landmark_checkpoint)
        if not checkpoint_path.exists():
            self.error = (
                f"Word checkpoint not found at {checkpoint_path}. "
                f"Train the model with train_word_landmarks.py."
            )
            return
        try:
            model, labels, config, device = load_word_checkpoint(checkpoint_path)
            self.model = model
            self.labels = labels
            self.model_config = config
            self.device = device
            self.error = None
        except Exception as exc:
            self.error = f"Failed to load word checkpoint: {exc}"
            self.model = None

    def reload(self) -> None:
        with self.lock:
            self._try_load()

    def vocabulary(self) -> WordVocabularyResponse:
        return WordVocabularyResponse(
            labels=self.labels,
            sequence_length=int(self.model_config.get("sequence_length", self.settings.word_sequence_length)),
            feature_dim=PER_FRAME_FEATURE_DIM,
            ready=self.ready,
        )

    def predict(self, request: WordPredictRequest) -> WordPredictResponse:
        if not self.ready:
            raise HTTPException(status_code=503, detail=self.error or "Word model is not ready")

        if any(len(frame) != PER_FRAME_FEATURE_DIM for frame in request.frames):
            raise HTTPException(
                status_code=400,
                detail=f"Each frame must have exactly {PER_FRAME_FEATURE_DIM} features",
            )

        sequence_length = int(self.model_config.get("sequence_length", self.settings.word_sequence_length))
        top_k = request.top_k or self.settings.word_top_k

        assert self.model is not None
        assert self.device is not None
        with self.lock:
            best_label, best_score, top = predict_word_sequence(
                model=self.model,
                frames=request.frames,
                labels=self.labels,
                device=self.device,
                sequence_length=sequence_length,
                top_k=top_k,
                mirror_tta=self.settings.word_mirror_tta,
            )

        runner_up = top[1][1] if len(top) > 1 else 0.0
        margin = best_score - runner_up
        target = request.target_word.upper() if request.target_word else None
        is_confident = (
            best_score >= self.settings.word_confidence_threshold
            and margin >= self.settings.word_min_margin
        )
        matches_target = (
            (best_label == target and is_confident) if target is not None else None
        )
        feedback = self._build_feedback(
            predicted_label=best_label,
            confidence=best_score,
            margin=margin,
            is_confident=is_confident,
            target_word=target,
            valid_frame_ratio=1.0,
            tracking_detected=True,
        )
        return WordPredictResponse(
            predicted_word=best_label,
            confidence=best_score,
            is_confident=is_confident,
            matches_target=matches_target,
            tracking_detected=True,
            valid_frame_ratio=1.0,
            feedback=feedback,
            target_word=target,
            top_predictions=[WordPrediction(label=label, score=score) for label, score in top],
        )

    def predict_from_images(self, request: WordPredictFramesRequest) -> WordPredictResponse:
        """Decode a batch of base64 frames, run MediaPipe server-side, and predict.

        This is the path used by the browser Word Practice page: the client
        captures a short clip as JPEG frames and posts them together, so the
        server handles all of the hand+pose extraction and normalization. The
        response mirrors the feature-based :meth:`predict` so the UI code can
        render both the same way.
        """

        if not self.ready:
            raise HTTPException(status_code=503, detail=self.error or "Word model is not ready")

        self._ensure_landmarkers()

        frames: list[list[float]] = []
        valid_frames = 0
        pending_missing: list[int] = []
        with self.lock:
            for encoded in request.images_base64:
                frame_bgr = _decode_base64_image(encoded)
                rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                left_hand, right_hand, pose = self._extract_landmarks(rgb)
                if pose is None and left_hand is None and right_hand is None:
                    if frames:
                        frames.append(list(frames[-1]))
                    else:
                        frames.append([0.0] * PER_FRAME_FEATURE_DIM)
                    pending_missing.append(len(frames) - 1)
                    continue
                valid_frames += 1
                feature = normalize_frame(left_hand, right_hand, pose)
                feature_list = feature.tolist()
                frames.append(feature_list)
                if pending_missing:
                    for missing_index in pending_missing:
                        frames[missing_index] = list(feature_list)
                    pending_missing.clear()

        valid_ratio = valid_frames / max(1, len(frames))
        tracking_detected = valid_ratio >= self.settings.word_min_valid_frame_ratio

        if valid_frames == 0:
            return WordPredictResponse(
                predicted_word="",
                confidence=0.0,
                is_confident=False,
                matches_target=False if request.target_word else None,
                tracking_detected=False,
                valid_frame_ratio=0.0,
                feedback=(
                    "No hands or pose detected in any of the captured frames. "
                    "Make sure you are fully in frame and the room is well lit, then try again."
                ),
                target_word=request.target_word.upper() if request.target_word else None,
                top_predictions=[],
            )

        dense_frames = fill_missing_frames(np.asarray(frames, dtype=np.float32)).tolist()
        inner_request = WordPredictRequest(
            frames=dense_frames,
            top_k=request.top_k,
            target_word=request.target_word,
        )
        response = self.predict(inner_request)
        # Re-compute confidence gating using the real tracking metrics so the
        # UI can distinguish "model is unsure" from "we never saw the hand".
        margin = response.confidence - (
            response.top_predictions[1].score if len(response.top_predictions) > 1 else 0.0
        )
        is_confident = (
            tracking_detected
            and response.confidence >= self.settings.word_confidence_threshold
            and margin >= self.settings.word_min_margin
        )
        target = request.target_word.upper() if request.target_word else None
        matches_target = (
            (response.predicted_word == target and is_confident) if target is not None else None
        )
        feedback = self._build_feedback(
            predicted_label=response.predicted_word,
            confidence=response.confidence,
            margin=margin,
            is_confident=is_confident,
            target_word=target,
            valid_frame_ratio=valid_ratio,
            tracking_detected=tracking_detected,
        )
        return WordPredictResponse(
            predicted_word=response.predicted_word,
            confidence=response.confidence,
            is_confident=is_confident,
            matches_target=matches_target,
            tracking_detected=tracking_detected,
            valid_frame_ratio=valid_ratio,
            feedback=feedback,
            target_word=target,
            top_predictions=response.top_predictions,
        )

    def _ensure_landmarkers(self) -> None:
        if self._hand_landmarker is not None and self._pose_landmarker is not None:
            return
        if self._landmarker_error is not None:
            raise HTTPException(status_code=503, detail=self._landmarker_error)

        try:
            import mediapipe as mp  # Imported lazily; boot-time optional.

            from signlang.mediapipe_hands import ensure_model_asset

            ensure_model_asset(HAND_MODEL_PATH, HAND_MODEL_URL)
            ensure_model_asset(POSE_MODEL_PATH, POSE_MODEL_URL)

            hand_options = mp.tasks.vision.HandLandmarkerOptions(
                base_options=mp.tasks.BaseOptions(model_asset_path=str(HAND_MODEL_PATH)),
                running_mode=mp.tasks.vision.RunningMode.VIDEO,
                num_hands=2,
                min_hand_detection_confidence=0.5,
                min_hand_presence_confidence=0.5,
                min_tracking_confidence=0.5,
            )
            pose_options = mp.tasks.vision.PoseLandmarkerOptions(
                base_options=mp.tasks.BaseOptions(model_asset_path=str(POSE_MODEL_PATH)),
                running_mode=mp.tasks.vision.RunningMode.VIDEO,
                num_poses=1,
                min_pose_detection_confidence=0.5,
                min_pose_presence_confidence=0.5,
                min_tracking_confidence=0.5,
            )
            self._hand_landmarker = mp.tasks.vision.HandLandmarker.create_from_options(hand_options)
            self._pose_landmarker = mp.tasks.vision.PoseLandmarker.create_from_options(pose_options)
        except Exception as exc:
            self._landmarker_error = f"Failed to initialize MediaPipe landmarkers: {exc}"
            raise HTTPException(status_code=503, detail=self._landmarker_error) from exc

    def _extract_landmarks(
        self, rgb: np.ndarray
    ) -> tuple[list[list[float]] | None, list[list[float]] | None, list[list[float]] | None]:
        import mediapipe as mp

        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        self._timestamp_ms += 33
        timestamp = self._timestamp_ms
        assert self._hand_landmarker is not None
        assert self._pose_landmarker is not None
        hand_result = self._hand_landmarker.detect_for_video(mp_image, timestamp)
        pose_result = self._pose_landmarker.detect_for_video(mp_image, timestamp)

        left_hand: list[list[float]] | None = None
        right_hand: list[list[float]] | None = None
        if hand_result and hand_result.hand_landmarks:
            for points, categories in zip(hand_result.hand_landmarks, hand_result.handedness):
                if not categories:
                    continue
                label = categories[0].category_name.upper()
                coords = [[float(p.x), float(p.y), float(p.z)] for p in points]
                if label.startswith("LEFT") and left_hand is None:
                    left_hand = coords
                elif label.startswith("RIGHT") and right_hand is None:
                    right_hand = coords
                elif left_hand is None:
                    left_hand = coords
                elif right_hand is None:
                    right_hand = coords

        pose: list[list[float]] | None = None
        if pose_result and pose_result.pose_landmarks:
            first_pose = pose_result.pose_landmarks[0]
            pose = [[float(p.x), float(p.y), float(p.z)] for p in first_pose]
        return left_hand, right_hand, pose

    def _build_feedback(
        self,
        *,
        predicted_label: str,
        confidence: float,
        margin: float,
        is_confident: bool,
        target_word: str | None,
        valid_frame_ratio: float,
        tracking_detected: bool,
    ) -> str:
        frame_pct = int(round(valid_frame_ratio * 100))
        if not tracking_detected:
            return (
                f"Only {frame_pct}% of frames had a clear view of your hands and pose. "
                "Step back so your full upper body is visible and try the sign again."
            )
        if target_word is None:
            if not is_confident:
                return (
                    f"Closest match is {predicted_label} at {confidence * 100:.0f}%. "
                    "Hold the movement steady and keep the sign within the frame."
                )
            return f"Recognized {predicted_label} at {confidence * 100:.0f}% confidence."
        if predicted_label == target_word and is_confident:
            return f"Nice, {predicted_label} locked in at {confidence * 100:.0f}% confidence."
        if not is_confident:
            return (
                f"Target {target_word}, saw {predicted_label} at {confidence * 100:.0f}%. "
                "Slow the motion down and keep the transition smooth."
            )
        return (
            f"That looks more like {predicted_label} ({confidence * 100:.0f}%). "
            f"Watch the reference for {target_word} and try again."
        )
