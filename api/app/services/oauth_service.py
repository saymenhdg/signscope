from __future__ import annotations

from dataclasses import dataclass

from authlib.integrations.starlette_client import OAuth
from starlette.requests import Request

from api.app.config import Settings


@dataclass(frozen=True)
class OAuthIdentity:
    provider: str
    provider_user_id: str
    email: str | None
    email_verified: bool
    display_name: str
    avatar_url: str | None


class OAuthService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.oauth = OAuth()
        self._register_clients()

    def enabled_provider_names(self) -> list[str]:
        return self.settings.oauth_enabled_providers

    def provider_label(self, provider: str) -> str:
        return {"google": "Google", "github": "GitHub"}.get(provider, provider.title())

    def ensure_enabled(self, provider: str) -> None:
        if provider not in self.enabled_provider_names():
            raise ValueError(f"{provider} login is not configured.")

    async def authorize_redirect(self, provider: str, request: Request, redirect_uri: str):
        self.ensure_enabled(provider)
        client = self.oauth.create_client(provider)
        if client is None:
            raise ValueError(f"{provider} login is not configured.")
        return await client.authorize_redirect(request, redirect_uri)

    async def fetch_identity(self, provider: str, request: Request) -> OAuthIdentity:
        self.ensure_enabled(provider)
        client = self.oauth.create_client(provider)
        if client is None:
            raise ValueError(f"{provider} login is not configured.")

        token = await client.authorize_access_token(request)
        if provider == "google":
            userinfo = token.get("userinfo") or {}
            return OAuthIdentity(
                provider="google",
                provider_user_id=str(userinfo["sub"]),
                email=userinfo.get("email"),
                email_verified=bool(userinfo.get("email_verified", False)),
                display_name=userinfo.get("name") or userinfo.get("email") or "Google User",
                avatar_url=userinfo.get("picture"),
            )

        profile_response = await client.get("user", token=token)
        profile = profile_response.json()
        email = profile.get("email")
        if not email:
            email_response = await client.get("user/emails", token=token)
            if email_response.is_success:
                emails = email_response.json()
                preferred = next((item for item in emails if item.get("primary") and item.get("verified")), None)
                verified = next((item for item in emails if item.get("verified")), None)
                chosen = preferred or verified or (emails[0] if emails else None)
                email = chosen.get("email") if chosen else None

        return OAuthIdentity(
            provider="github",
            provider_user_id=str(profile["id"]),
            email=email,
            email_verified=True,
            display_name=profile.get("name") or profile.get("login") or email or "GitHub User",
            avatar_url=profile.get("avatar_url"),
        )

    def _register_clients(self) -> None:
        if self.settings.google_client_id and self.settings.google_client_secret:
            self.oauth.register(
                name="google",
                client_id=self.settings.google_client_id,
                client_secret=self.settings.google_client_secret,
                server_metadata_url=self.settings.google_server_metadata_url,
                client_kwargs={"scope": "openid profile email"},
            )

        if self.settings.github_client_id and self.settings.github_client_secret:
            self.oauth.register(
                name="github",
                client_id=self.settings.github_client_id,
                client_secret=self.settings.github_client_secret,
                access_token_url="https://github.com/login/oauth/access_token",
                authorize_url="https://github.com/login/oauth/authorize",
                api_base_url="https://api.github.com/",
                client_kwargs={"scope": "read:user user:email"},
            )
