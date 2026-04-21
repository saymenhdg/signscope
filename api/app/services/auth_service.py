from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
import secrets
from urllib.parse import urlencode

from fastapi import HTTPException, Request, Response, status

from api.app.config import Settings
from api.app.models import User
from api.app.repositories.analytics_repository import AnalyticsRepository
from api.app.repositories.auth_repository import AuthRepository
from api.app.schemas import UserResponse
from api.app.security import PasswordManager, SessionTokenManager
from api.app.services.analytics_service import AnalyticsService
from api.app.services.oauth_service import OAuthIdentity


UTC = timezone.utc


@dataclass
class AuthService:
    repository: AuthRepository
    analytics_repository: AnalyticsRepository
    settings: Settings

    def __post_init__(self) -> None:
        self.passwords = PasswordManager()
        self.tokens = SessionTokenManager()
        self.analytics = AnalyticsService(self.analytics_repository)

    def register_user(self, *, email: str, display_name: str, password: str) -> tuple[User, str, datetime]:
        normalized_email = self._validate_email(email)
        if self.repository.email_exists(normalized_email):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with that email already exists.")

        password_hash, password_salt = self.passwords.hash_password(password)
        user = self.repository.create_user(
            email=normalized_email,
            display_name=self._normalized_display_name(display_name),
            age=None,
            bio=None,
            avatar_url=None,
            password_hash=password_hash,
            password_salt=password_salt,
            is_email_verified=False,
        )
        token, expires_at = self.create_session(user)
        return user, token, expires_at

    def authenticate_user(self, *, email: str, password: str) -> tuple[User, str, datetime]:
        normalized_email = self._validate_email(email)
        user = self.repository.get_user_by_email(normalized_email)
        if user is None or not user.password_hash or not user.password_salt:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")
        if not self.passwords.verify_password(password, user.password_hash, user.password_salt):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")

        token, expires_at = self.create_session(user)
        return user, token, expires_at

    def request_password_reset(self, *, email: str) -> str | None:
        normalized_email = self._validate_email(email)
        now = datetime.now(UTC)
        self.repository.delete_expired_password_reset_tokens(now)
        user = self.repository.get_user_by_email(normalized_email)
        if user is None:
            return None

        self.repository.delete_password_reset_tokens_for_user(user)
        raw_token = self.tokens.create()
        token_hash = self.tokens.hash_token(raw_token)
        expires_at = now + timedelta(minutes=30)
        self.repository.create_password_reset_token(user=user, token_hash=token_hash, expires_at=expires_at)
        return raw_token

    def reset_password(self, *, token: str, password: str) -> None:
        now = datetime.now(UTC)
        self.repository.delete_expired_password_reset_tokens(now)
        token_record = self.repository.get_password_reset_token(self.tokens.hash_token(token))
        if token_record is None or token_record.used_at is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This reset link is invalid or expired.")

        expires_at = self._coerce_utc_datetime(token_record.expires_at)
        if expires_at < now:
            self.repository.delete_expired_password_reset_tokens(now)
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This reset link is invalid or expired.")

        password_hash, password_salt = self.passwords.hash_password(password)
        self.repository.update_user_password(token_record.user, password_hash=password_hash, password_salt=password_salt)
        self.repository.mark_password_reset_token_used(token_record, now)
        self.repository.delete_sessions_for_user(token_record.user)
        self.repository.delete_password_reset_tokens_for_user(token_record.user)

    def authenticate_oauth_identity(self, identity: OAuthIdentity) -> tuple[User, str, datetime]:
        user = self.repository.get_user_by_provider_identity(identity.provider, identity.provider_user_id)
        if user is None and identity.email:
            user = self.repository.get_user_by_email(identity.email.strip().lower())

        if user is None:
            email = self._resolve_oauth_email(identity)
            user = self.repository.create_user(
                email=email,
                display_name=self._normalized_display_name(identity.display_name or "SignSpeak User"),
                age=None,
                bio=None,
                avatar_url=identity.avatar_url,
                password_hash=None,
                password_salt=None,
                is_email_verified=identity.email_verified,
            )
        else:
            avatar_url = user.avatar_url if self._is_local_media_path(user.avatar_url) else identity.avatar_url
            user = self.repository.update_user_profile(
                user,
                display_name=self._normalized_display_name(identity.display_name or user.display_name),
                avatar_url=avatar_url,
                is_email_verified=user.is_email_verified or identity.email_verified,
            )

        account = self.repository.get_oauth_account(identity.provider, identity.provider_user_id)
        if account is None:
            self.repository.create_oauth_account(
                user=user,
                provider=identity.provider,
                provider_user_id=identity.provider_user_id,
                provider_email=identity.email,
            )
        else:
            self.repository.update_oauth_account_email(account, identity.email)

        token, expires_at = self.create_session(user)
        return user, token, expires_at

    def update_profile(
        self,
        user: User,
        *,
        display_name: str | None,
        age: int | None,
        bio: str | None,
    ) -> User:
        normalized_display_name = self._normalized_display_name(display_name) if display_name is not None else user.display_name
        normalized_bio = self._normalized_bio(bio)
        if age is not None and not (1 <= age <= 120):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Age must be between 1 and 120.")

        return self.repository.update_user_profile(
            user,
            display_name=normalized_display_name,
            age=age,
            bio=normalized_bio,
        )

    def update_avatar(
        self,
        user: User,
        *,
        filename: str | None,
        content_type: str | None,
        content: bytes,
    ) -> User:
        if not filename:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Select an image file to upload.")
        if not content_type or not content_type.startswith("image/"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Avatar upload must be an image.")
        if len(content) > 5 * 1024 * 1024:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Avatar image must be 5 MB or smaller.")

        suffix = Path(filename).suffix.lower()
        if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Avatar image must be .jpg, .jpeg, .png, or .webp.",
            )

        self.settings.avatar_upload_dir.mkdir(parents=True, exist_ok=True)
        stored_name = f"user-{user.id}-{secrets.token_hex(8)}{suffix}"
        target_path = self.settings.avatar_upload_dir / stored_name
        target_path.write_bytes(content)

        previous_avatar = user.avatar_url
        updated_user = self.repository.update_user_profile(
            user,
            avatar_url=f"/media/avatars/{stored_name}",
        )
        self._delete_local_avatar(previous_avatar)
        return updated_user

    def create_session(self, user: User) -> tuple[str, datetime]:
        now = datetime.now(UTC)
        self.repository.delete_expired_sessions(now)
        raw_token = self.tokens.create()
        token_hash = self.tokens.hash_token(raw_token)
        expires_at = now + timedelta(days=self.settings.session_duration_days)
        self.repository.create_session(user=user, token_hash=token_hash, expires_at=expires_at)
        return raw_token, expires_at

    def attach_session_cookie(self, response: Response, token: str, expires_at: datetime) -> None:
        response.set_cookie(
            key=self.settings.app_session_cookie_name,
            value=token,
            httponly=True,
            secure=self.settings.session_cookie_secure,
            samesite=self.settings.session_cookie_samesite,
            max_age=self.settings.session_max_age_seconds,
            expires=expires_at,
            domain=self.settings.session_cookie_domain,
            path="/",
        )

    def clear_session(self, request: Request, response: Response) -> None:
        token = self._token_from_request(request)
        if token:
            self.repository.delete_session_by_token_hash(self.tokens.hash_token(token))
        response.delete_cookie(
            key=self.settings.app_session_cookie_name,
            domain=self.settings.session_cookie_domain,
            path="/",
        )

    def current_user(self, request: Request) -> User | None:
        token = self._token_from_request(request)
        if not token:
            return None

        self.repository.delete_expired_sessions(datetime.now(UTC))
        session = self.repository.get_session_by_token_hash(self.tokens.hash_token(token))
        if session is None:
            return None
        expires_at = self._coerce_utc_datetime(session.expires_at)
        if expires_at < datetime.now(UTC):
            self.repository.delete_session_by_token_hash(self.tokens.hash_token(token))
            return None
        return session.user

    def require_user(self, request: Request) -> User:
        user = self.current_user(request)
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
        return user

    def user_response(self, user: User) -> UserResponse:
        return UserResponse(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            age=user.age,
            bio=user.bio,
            avatar_url=self._public_avatar_url(user.avatar_url),
            created_at=self._coerce_utc_datetime(user.created_at).isoformat(),
        )

    def sanitize_next_path(self, next_path: str | None) -> str:
        if not next_path or not next_path.startswith("/") or next_path.startswith("//"):
            return "/app/dashboard"
        return next_path

    def frontend_redirect_url(self, next_path: str | None = None, error: str | None = None) -> str:
        target = self.sanitize_next_path(next_path)
        if error:
            separator = "&" if "?" in target else "?"
            target = f"{target}{separator}{urlencode({'authError': error})}"
        return f"{self.settings.frontend_origin}{target}"

    def password_reset_url(self, token: str) -> str:
        encoded = urlencode({"token": token})
        return f"{self.settings.frontend_origin}/reset-password?{encoded}"

    def _validate_email(self, email: str) -> str:
        normalized = email.strip().lower()
        if "@" not in normalized or "." not in normalized.split("@")[-1]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Enter a valid email address.")
        return normalized

    def _resolve_oauth_email(self, identity: OAuthIdentity) -> str:
        if identity.email:
            candidate = identity.email.strip().lower()
        else:
            candidate = f"{identity.provider}-{identity.provider_user_id}@users.noreply.signspeak.local"

        if not self.repository.email_exists(candidate):
            return candidate

        local, _, domain = candidate.partition("@")
        index = 1
        while True:
            fallback = f"{local}+{index}@{domain}"
            if not self.repository.email_exists(fallback):
                return fallback
            index += 1

    def _token_from_request(self, request: Request) -> str | None:
        authorization = request.headers.get("Authorization")
        if authorization and authorization.startswith("Bearer "):
            token = authorization.split(" ", 1)[1].strip()
            if token:
                return token
        cookie_token = request.cookies.get(self.settings.app_session_cookie_name)
        return cookie_token.strip() if cookie_token else None

    def _coerce_utc_datetime(self, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    def _normalized_display_name(self, value: str) -> str:
        normalized = value.strip()[:80]
        if len(normalized) < 2:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Display name must be at least 2 characters.")
        return normalized

    def _normalized_bio(self, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized[:280] if normalized else None

    def _public_avatar_url(self, value: str | None) -> str | None:
        if not value:
            return None
        if value.startswith("http://") or value.startswith("https://"):
            return value
        if value.startswith("/"):
            return f"{self.settings.backend_origin.rstrip('/')}{value}"
        return value

    def _is_local_media_path(self, value: str | None) -> bool:
        return bool(value and value.startswith("/media/"))

    def _delete_local_avatar(self, value: str | None) -> None:
        if not self._is_local_media_path(value):
            return
        relative_path = Path(*value.removeprefix("/media/").split("/"))
        target_path = self.settings.media_root_path / relative_path
        try:
            if target_path.exists():
                target_path.unlink()
        except OSError:
            return
