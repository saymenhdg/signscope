from __future__ import annotations

import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api.app.config import get_settings
from api.app.db import get_session_factory, init_db
from api.app.models import User
from api.app.security import PasswordManager
from sqlalchemy import select


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create or update an admin account in the configured database.")
    parser.add_argument("--email", required=True, help="Admin email address")
    parser.add_argument("--password", required=True, help="Admin password")
    parser.add_argument("--display-name", default="SignSpeak Admin", help="Admin display name")
    parser.add_argument("--verified", action="store_true", help="Mark the admin email as verified")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    settings = get_settings()
    init_db()

    password_manager = PasswordManager()
    password_hash, password_salt = password_manager.hash_password(args.password)

    session_factory = get_session_factory()
    with session_factory() as db:
        normalized_email = args.email.strip().lower()
        user = db.scalar(select(User).where(User.email == normalized_email))

        if user is None:
            user = User(
                email=normalized_email,
                display_name=args.display_name.strip() or "SignSpeak Admin",
                role="admin",
                age=None,
                bio="Platform administrator",
                avatar_url=None,
                password_hash=password_hash,
                password_salt=password_salt,
                is_email_verified=args.verified,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"Created admin user {user.email} in {settings.database_url}")
        else:
            user.display_name = args.display_name.strip() or user.display_name
            user.role = "admin"
            user.password_hash = password_hash
            user.password_salt = password_salt
            if args.verified:
                user.is_email_verified = True
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"Updated existing user {user.email} to admin in {settings.database_url}")

        print(f"Admin id: {user.id}")
        print("Login URL: /admin/login")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
