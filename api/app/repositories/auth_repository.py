from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from api.app.models import OAuthAccount, PasswordResetToken, User, UserSession


UNSET = object()


class AuthRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_user_by_email(self, email: str) -> User | None:
        statement = select(User).where(User.email == email)
        return self.db.scalar(statement)

    def get_user_by_id(self, user_id: int) -> User | None:
        statement = select(User).where(User.id == user_id)
        return self.db.scalar(statement)

    def get_user_by_provider_identity(self, provider: str, provider_user_id: str) -> User | None:
        statement = (
            select(User)
            .join(OAuthAccount)
            .where(
                OAuthAccount.provider == provider,
                OAuthAccount.provider_user_id == provider_user_id,
            )
        )
        return self.db.scalar(statement)

    def email_exists(self, email: str) -> bool:
        return self.get_user_by_email(email) is not None

    def create_user(
        self,
        *,
        email: str,
        display_name: str,
        age: int | None,
        bio: str | None,
        avatar_url: str | None,
        password_hash: str | None,
        password_salt: str | None,
        is_email_verified: bool,
    ) -> User:
        user = User(
            email=email,
            display_name=display_name,
            age=age,
            bio=bio,
            avatar_url=avatar_url,
            password_hash=password_hash,
            password_salt=password_salt,
            is_email_verified=is_email_verified,
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def update_user_profile(
        self,
        user: User,
        *,
        display_name: str | None | object = UNSET,
        age: int | None | object = UNSET,
        bio: str | None | object = UNSET,
        avatar_url: str | None | object = UNSET,
        is_email_verified: bool | None | object = UNSET,
    ) -> User:
        if display_name is not UNSET:
            user.display_name = display_name
        if age is not UNSET:
            user.age = age
        if bio is not UNSET:
            user.bio = bio
        if avatar_url is not UNSET:
            user.avatar_url = avatar_url
        if is_email_verified is not UNSET:
            user.is_email_verified = is_email_verified
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def get_oauth_account(self, provider: str, provider_user_id: str) -> OAuthAccount | None:
        statement = select(OAuthAccount).where(
            OAuthAccount.provider == provider,
            OAuthAccount.provider_user_id == provider_user_id,
        )
        return self.db.scalar(statement)

    def create_oauth_account(
        self,
        *,
        user: User,
        provider: str,
        provider_user_id: str,
        provider_email: str | None,
    ) -> OAuthAccount:
        account = OAuthAccount(
            user_id=user.id,
            provider=provider,
            provider_user_id=provider_user_id,
            provider_email=provider_email,
        )
        self.db.add(account)
        self.db.commit()
        self.db.refresh(account)
        return account

    def update_oauth_account_email(self, account: OAuthAccount, provider_email: str | None) -> OAuthAccount:
        account.provider_email = provider_email
        self.db.add(account)
        self.db.commit()
        self.db.refresh(account)
        return account

    def create_session(self, *, user: User, token_hash: str, expires_at: datetime) -> UserSession:
        session = UserSession(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        return session

    def get_session_by_token_hash(self, token_hash: str) -> UserSession | None:
        statement = (
            select(UserSession)
            .options(joinedload(UserSession.user))
            .where(UserSession.token_hash == token_hash)
        )
        return self.db.scalar(statement)

    def delete_session_by_token_hash(self, token_hash: str) -> None:
        session = self.get_session_by_token_hash(token_hash)
        if session is not None:
            self.db.delete(session)
            self.db.commit()

    def delete_expired_sessions(self, now: datetime) -> None:
        expired = self.db.scalars(select(UserSession).where(UserSession.expires_at < now)).all()
        if not expired:
            return
        for session in expired:
            self.db.delete(session)
        self.db.commit()

    def delete_sessions_for_user(self, user: User) -> None:
        sessions = self.db.scalars(select(UserSession).where(UserSession.user_id == user.id)).all()
        if not sessions:
            return
        for session in sessions:
            self.db.delete(session)
        self.db.commit()

    def create_password_reset_token(self, *, user: User, token_hash: str, expires_at: datetime) -> PasswordResetToken:
        token = PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        self.db.add(token)
        self.db.commit()
        self.db.refresh(token)
        return token

    def get_password_reset_token(self, token_hash: str) -> PasswordResetToken | None:
        statement = (
            select(PasswordResetToken)
            .options(joinedload(PasswordResetToken.user))
            .where(PasswordResetToken.token_hash == token_hash)
        )
        return self.db.scalar(statement)

    def mark_password_reset_token_used(self, token: PasswordResetToken, used_at: datetime) -> PasswordResetToken:
        token.used_at = used_at
        self.db.add(token)
        self.db.commit()
        self.db.refresh(token)
        return token

    def delete_expired_password_reset_tokens(self, now: datetime) -> None:
        expired = self.db.scalars(
            select(PasswordResetToken).where(
                (PasswordResetToken.expires_at < now) | (PasswordResetToken.used_at.is_not(None))
            )
        ).all()
        if not expired:
            return
        for token in expired:
            self.db.delete(token)
        self.db.commit()

    def delete_password_reset_tokens_for_user(self, user: User) -> None:
        tokens = self.db.scalars(select(PasswordResetToken).where(PasswordResetToken.user_id == user.id)).all()
        if not tokens:
            return
        for token in tokens:
            self.db.delete(token)
        self.db.commit()

    def update_user_password(self, user: User, *, password_hash: str, password_salt: str) -> User:
        user.password_hash = password_hash
        user.password_salt = password_salt
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user
