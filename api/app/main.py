from __future__ import annotations

import threading
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from api.app.config import get_settings
from api.app.db import init_db
from api.app.routers.analytics import router as analytics_router
from api.app.routers.auth import router as auth_router
from api.app.routers.inference import router as inference_router
from api.app.routers.learning import router as learning_router
from api.app.routers.teacher import router as teacher_router


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="2.0.0")
    Path(settings.media_root).mkdir(parents=True, exist_ok=True)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.session_secret_key,
        same_site=settings.session_cookie_samesite,
        https_only=settings.session_cookie_secure,
        session_cookie=settings.oauth_session_cookie_name,
        max_age=600,
    )
    app.mount("/media", StaticFiles(directory=settings.media_root), name="media")

    @app.on_event("startup")
    def on_startup() -> None:
        init_db()
        from api.app.dependencies import get_alphabet_inference_service, get_word_inference_service
        threading.Thread(
            target=lambda: (get_alphabet_inference_service(), get_word_inference_service()),
            daemon=True,
        ).start()

    app.include_router(auth_router)
    app.include_router(analytics_router)
    app.include_router(teacher_router)
    app.include_router(learning_router)
    app.include_router(inference_router)
    return app


app = create_app()
