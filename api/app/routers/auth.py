from __future__ import annotations

from authlib.integrations.base_client.errors import OAuthError
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.responses import RedirectResponse

from api.app.dependencies import get_auth_service, get_current_user, get_oauth_service
from api.app.models import User
from api.app.schemas import (
    AuthProviderOption,
    AuthProvidersResponse,
    AuthResponse,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    MessageResponse,
    ProfileUpdateRequest,
    RegisterRequest,
    ResetPasswordRequest,
    UserResponse,
)
from api.app.services.auth_service import AuthService
from api.app.services.oauth_service import OAuthService


router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/providers", response_model=AuthProvidersResponse)
def auth_providers(oauth_service: OAuthService = Depends(get_oauth_service)) -> AuthProvidersResponse:
    providers = [
        AuthProviderOption(
            id=provider,
            label=oauth_service.provider_label(provider),
            start_url=f"/api/auth/oauth/{provider}/start",
        )
        for provider in oauth_service.enabled_provider_names()
    ]
    return AuthProvidersResponse(providers=providers)


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(
    request: RegisterRequest,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service),
) -> AuthResponse:
    user, token, expires_at = auth_service.register_user(
        email=request.email,
        display_name=request.display_name,
        password=request.password,
        role=request.role,
    )
    auth_service.attach_session_cookie(response, token, expires_at)
    return AuthResponse(expires_at=expires_at.isoformat(), user=auth_service.user_response(user))


@router.post("/login", response_model=AuthResponse)
def login(
    request: LoginRequest,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service),
) -> AuthResponse:
    user, token, expires_at = auth_service.authenticate_user(
        email=request.email,
        password=request.password,
        expected_role=request.role,
    )
    auth_service.attach_session_cookie(response, token, expires_at)
    return AuthResponse(expires_at=expires_at.isoformat(), user=auth_service.user_response(user))


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(
    request: ForgotPasswordRequest,
    auth_service: AuthService = Depends(get_auth_service),
) -> ForgotPasswordResponse:
    token = auth_service.request_password_reset(email=request.email)
    reset_url = auth_service.password_reset_url(token) if token and auth_service.settings.app_env != "production" else None
    return ForgotPasswordResponse(
        status="ok",
        detail="If that email exists, a password reset link has been generated.",
        reset_url=reset_url,
    )


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(
    request: ResetPasswordRequest,
    auth_service: AuthService = Depends(get_auth_service),
) -> MessageResponse:
    auth_service.reset_password(token=request.token, password=request.password)
    return MessageResponse(status="ok", detail="Password updated. You can sign in with the new password.")


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user), auth_service: AuthService = Depends(get_auth_service)) -> UserResponse:
    return auth_service.user_response(current_user)


@router.patch("/profile", response_model=UserResponse)
def update_profile(
    request: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service),
) -> UserResponse:
    user = auth_service.update_profile(
        current_user,
        display_name=request.display_name if "display_name" in request.model_fields_set else current_user.display_name,
        age=request.age if "age" in request.model_fields_set else current_user.age,
        bio=request.bio if "bio" in request.model_fields_set else current_user.bio,
    )
    return auth_service.user_response(user)


@router.post("/profile/avatar", response_model=UserResponse)
async def upload_profile_avatar(
    avatar: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service),
) -> UserResponse:
    content = await avatar.read()
    user = auth_service.update_avatar(
        current_user,
        filename=avatar.filename,
        content_type=avatar.content_type,
        content=content,
    )
    return auth_service.user_response(user)


@router.post("/logout", response_model=MessageResponse)
def logout(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service),
) -> MessageResponse:
    del current_user
    auth_service.clear_session(request, response)
    return MessageResponse(status="ok", detail="Signed out.")


@router.get("/oauth/{provider}/start")
async def oauth_start(
    provider: str,
    request: Request,
    next_path: str = Query(default="/app/dashboard", alias="next"),
    oauth_service: OAuthService = Depends(get_oauth_service),
    auth_service: AuthService = Depends(get_auth_service),
) -> Response:
    try:
        sanitized_next = auth_service.sanitize_next_path(next_path)
        request.session["auth_next"] = sanitized_next
        redirect_uri = str(request.url_for("oauth_callback", provider=provider))
        return await oauth_service.authorize_redirect(provider, request, redirect_uri)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/oauth/{provider}/callback", name="oauth_callback")
async def oauth_callback(
    provider: str,
    request: Request,
    auth_service: AuthService = Depends(get_auth_service),
    oauth_service: OAuthService = Depends(get_oauth_service),
) -> RedirectResponse:
    next_path = auth_service.sanitize_next_path(request.session.pop("auth_next", "/app/dashboard"))
    try:
        identity = await oauth_service.fetch_identity(provider, request)
        user, token, expires_at = auth_service.authenticate_oauth_identity(identity)
        response = RedirectResponse(auth_service.frontend_redirect_url(next_path), status_code=status.HTTP_302_FOUND)
        auth_service.attach_session_cookie(response, token, expires_at)
        return response
    except (ValueError, OAuthError, KeyError) as exc:
        error = str(exc) or f"{provider} sign-in failed."
        return RedirectResponse(
            auth_service.frontend_redirect_url("/login", error=error),
            status_code=status.HTTP_302_FOUND,
        )
