from __future__ import annotations

import numpy as np
from fastapi import APIRouter, Depends, HTTPException

from api.app.dependencies import (
    get_alphabet_inference_service,
    get_oauth_service,
    get_word_inference_service,
)
from api.app.schemas import (
    HealthResponse,
    LettersResponse,
    PredictRequest,
    PredictResponse,
    RandomLetterResponse,
    ValidateRequest,
    ValidateResponse,
    WordPredictFramesRequest,
    WordPredictRequest,
    WordPredictResponse,
    WordVocabularyResponse,
)
from api.app.services.ml_service import AlphabetInferenceService
from api.app.services.oauth_service import OAuthService
from api.app.services.word_service import WordInferenceService


router = APIRouter(prefix="/api", tags=["inference"])


@router.get("/health", response_model=HealthResponse)
def health(
    inference_service: AlphabetInferenceService = Depends(get_alphabet_inference_service),
    word_service: WordInferenceService = Depends(get_word_inference_service),
    oauth_service: OAuthService = Depends(get_oauth_service),
) -> HealthResponse:
    payload = inference_service.health()
    payload.oauth_providers = oauth_service.enabled_provider_names()
    payload.word_model_ready = word_service.ready
    payload.word_labels = word_service.labels
    if not payload.alphabet_model_ready and payload.word_model_ready:
        payload.status = "partial"
    return payload


@router.get("/alphabet/letters", response_model=LettersResponse)
def alphabet_letters(inference_service: AlphabetInferenceService = Depends(get_alphabet_inference_service)) -> LettersResponse:
    return LettersResponse(labels=inference_service.labels)


@router.get("/alphabet/random", response_model=RandomLetterResponse)
def random_letter(inference_service: AlphabetInferenceService = Depends(get_alphabet_inference_service)) -> RandomLetterResponse:
    if not inference_service.labels:
        raise HTTPException(status_code=503, detail="Alphabet labels are not available")
    index = int(np.random.randint(0, len(inference_service.labels)))
    return RandomLetterResponse(letter=inference_service.labels[index])


@router.post("/alphabet/predict", response_model=PredictResponse)
def predict_alphabet(
    request: PredictRequest,
    inference_service: AlphabetInferenceService = Depends(get_alphabet_inference_service),
) -> PredictResponse:
    return inference_service.predict(request)


@router.post("/alphabet/validate", response_model=ValidateResponse)
def validate_alphabet(
    request: ValidateRequest,
    inference_service: AlphabetInferenceService = Depends(get_alphabet_inference_service),
) -> ValidateResponse:
    return inference_service.validate(request)


@router.get("/word/vocabulary", response_model=WordVocabularyResponse)
def word_vocabulary(
    word_service: WordInferenceService = Depends(get_word_inference_service),
) -> WordVocabularyResponse:
    return word_service.vocabulary()


@router.get("/word/random", response_model=RandomLetterResponse)
def word_random(
    word_service: WordInferenceService = Depends(get_word_inference_service),
) -> RandomLetterResponse:
    if not word_service.labels:
        raise HTTPException(status_code=503, detail="Word labels are not available")
    index = int(np.random.randint(0, len(word_service.labels)))
    return RandomLetterResponse(letter=word_service.labels[index])


@router.post("/word/predict", response_model=WordPredictResponse)
def predict_word(
    request: WordPredictRequest,
    word_service: WordInferenceService = Depends(get_word_inference_service),
) -> WordPredictResponse:
    return word_service.predict(request)


@router.post("/word/predict-frames", response_model=WordPredictResponse)
def predict_word_from_frames(
    request: WordPredictFramesRequest,
    word_service: WordInferenceService = Depends(get_word_inference_service),
) -> WordPredictResponse:
    return word_service.predict_from_images(request)
