from __future__ import annotations

import numpy as np
from fastapi import APIRouter, Depends, HTTPException

from api.app.dependencies import get_alphabet_inference_service, get_oauth_service
from api.app.schemas import HealthResponse, LettersResponse, PredictRequest, PredictResponse, RandomLetterResponse, ValidateRequest, ValidateResponse
from api.app.services.ml_service import AlphabetInferenceService
from api.app.services.oauth_service import OAuthService


router = APIRouter(prefix="/api", tags=["inference"])


@router.get("/health", response_model=HealthResponse)
def health(
    inference_service: AlphabetInferenceService = Depends(get_alphabet_inference_service),
    oauth_service: OAuthService = Depends(get_oauth_service),
) -> HealthResponse:
    payload = inference_service.health()
    payload.oauth_providers = oauth_service.enabled_provider_names()
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
