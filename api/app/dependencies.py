from __future__ import annotations

from functools import lru_cache

from fastapi import Depends, HTTPException, Request, status

from api.app.config import Settings, get_settings
from api.app.db import get_db
from api.app.models import User
from api.app.repositories.analytics_repository import AnalyticsRepository
from api.app.repositories.auth_repository import AuthRepository
from api.app.services.analytics_service import AnalyticsService
from api.app.services.admin_service import AdminService
from api.app.services.auth_service import AuthService
from api.app.services.learning_service import LearningCatalogService
from api.app.services.ml_service import AlphabetInferenceService
from api.app.services.oauth_service import OAuthService
from api.app.services.word_service import WordInferenceService


def get_auth_service(db=Depends(get_db), settings: Settings = Depends(get_settings)) -> AuthService:
    return AuthService(AuthRepository(db), AnalyticsRepository(db), settings)


def get_analytics_service(db=Depends(get_db)) -> AnalyticsService:
    return AnalyticsService(AnalyticsRepository(db))


def get_admin_service(db=Depends(get_db), settings: Settings = Depends(get_settings)) -> AdminService:
    return AdminService(db, settings)


@lru_cache(maxsize=1)
def get_learning_catalog_service() -> LearningCatalogService:
    return LearningCatalogService(get_settings())


@lru_cache(maxsize=1)
def get_alphabet_inference_service() -> AlphabetInferenceService:
    return AlphabetInferenceService(get_settings())


@lru_cache(maxsize=1)
def get_word_inference_service() -> WordInferenceService:
    return WordInferenceService(get_settings())


@lru_cache(maxsize=1)
def get_oauth_service() -> OAuthService:
    return OAuthService(get_settings())


def get_current_user(request: Request, auth_service: AuthService = Depends(get_auth_service)) -> User:
    return auth_service.require_user(request)


def get_current_teacher(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "teacher":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teacher access required.")
    return current_user


def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")
    return current_user
