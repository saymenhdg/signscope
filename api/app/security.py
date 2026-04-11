from __future__ import annotations

import hashlib
import hmac
import secrets


PBKDF2_ITERATIONS = 200_000


class PasswordManager:
    def hash_password(self, password: str, salt: str | None = None) -> tuple[str, str]:
        resolved_salt = salt or secrets.token_hex(16)
        hashed = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            resolved_salt.encode("utf-8"),
            PBKDF2_ITERATIONS,
        ).hex()
        return hashed, resolved_salt

    def verify_password(self, password: str, password_hash: str, salt: str) -> bool:
        candidate, _ = self.hash_password(password, salt)
        return hmac.compare_digest(candidate, password_hash)


class SessionTokenManager:
    def create(self) -> str:
        return secrets.token_urlsafe(32)

    def hash_token(self, token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()
