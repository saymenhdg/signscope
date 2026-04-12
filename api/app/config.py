from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "SignSpeak API"
    app_env: str = "development"
    frontend_origin: str = "http://127.0.0.1:5173"
    backend_origin: str = "http://127.0.0.1:8000"
    database_url: str = "sqlite+pysqlite:///artifacts/signspeak_app.sqlite3"

    session_secret_key: str = "change-me-in-env"
    oauth_session_cookie_name: str = "signspeak_oauth"
    app_session_cookie_name: str = "signspeak_session"
    session_cookie_secure: bool = False
    session_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    session_cookie_domain: str | None = None
    session_duration_days: int = 30

    google_client_id: str | None = None
    google_client_secret: str | None = None
    github_client_id: str | None = None
    github_client_secret: str | None = None
    google_server_metadata_url: str = "https://accounts.google.com/.well-known/openid-configuration"
    media_root: str = "artifacts/uploads"

    alphabet_image_checkpoint: str = "artifacts/alphabet_frames_v1/best.pt"
    alphabet_landmark_checkpoints: list[str] = Field(
        default_factory=lambda: [
            "artifacts/alphabet_landmarks_v8/best.pt",
        ]
    )
    alphabet_guide_records_path: str = "data/alphabet_landmarks_v6/records.json"
    alphabet_threshold: float = 0.45
    alphabet_min_margin: float = 0.10

    @property
    def allowed_origins(self) -> list[str]:
        defaults = {"http://127.0.0.1:5173", "http://localhost:5173", self.frontend_origin}
        return sorted(defaults)

    @property
    def session_max_age_seconds(self) -> int:
        return self.session_duration_days * 24 * 60 * 60

    @property
    def oauth_enabled_providers(self) -> list[str]:
        providers: list[str] = []
        if self.google_client_id and self.google_client_secret:
            providers.append("google")
        if self.github_client_id and self.github_client_secret:
            providers.append("github")
        return providers

    @property
    def media_root_path(self) -> Path:
        return Path(self.media_root)

    @property
    def avatar_upload_dir(self) -> Path:
        return self.media_root_path / "avatars"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
