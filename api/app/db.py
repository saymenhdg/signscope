from __future__ import annotations

from collections.abc import Generator
from functools import lru_cache
from pathlib import Path
import sqlite3

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from api.app.config import get_settings


class Base(DeclarativeBase):
    pass


def _normalized_database_url(database_url: str) -> str:
    if database_url.startswith("postgres://"):
        return "postgresql+psycopg://" + database_url.removeprefix("postgres://")
    if database_url.startswith("postgresql://") and "+psycopg" not in database_url:
        return "postgresql+psycopg://" + database_url.removeprefix("postgresql://")
    return database_url


@lru_cache(maxsize=1)
def get_engine():
    settings = get_settings()
    database_url = _normalized_database_url(settings.database_url)
    if database_url.startswith("sqlite:///"):
        sqlite_path = Path(database_url.removeprefix("sqlite:///"))
        sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    return create_engine(
        database_url,
        future=True,
        pool_pre_ping=True,
        connect_args=connect_args,
    )


@lru_cache(maxsize=1)
def get_session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), autoflush=False, autocommit=False, expire_on_commit=False)


def init_db() -> None:
    from api.app import models  # noqa: F401

    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    if engine.dialect.name == "sqlite":
        _upgrade_sqlite_schema(engine)


def _upgrade_sqlite_schema(engine) -> None:
    raw_connection = engine.raw_connection()
    try:
        cursor = raw_connection.cursor()
        cursor.execute("PRAGMA table_info(users)")
        rows = cursor.fetchall()
        if not rows:
            raw_connection.commit()
            return

        columns = {
            row[1]: {
                "type": row[2],
                "notnull": row[3],
            }
            for row in rows
        }
        requires_rebuild = (
            "age" not in columns
            or "bio" not in columns
            or "avatar_url" not in columns
            or "is_email_verified" not in columns
            or "updated_at" not in columns
            or columns.get("password_hash", {}).get("notnull") == 1
            or columns.get("password_salt", {}).get("notnull") == 1
        )

        if not requires_rebuild:
            raw_connection.commit()
            return

        age_expr = "age" if "age" in columns else "NULL"
        bio_expr = "bio" if "bio" in columns else "NULL"
        avatar_expr = "avatar_url" if "avatar_url" in columns else "NULL"
        password_hash_expr = "password_hash" if "password_hash" in columns else "NULL"
        password_salt_expr = "password_salt" if "password_salt" in columns else "NULL"
        email_verified_expr = "is_email_verified" if "is_email_verified" in columns else "0"
        created_at_expr = "created_at" if "created_at" in columns else "CURRENT_TIMESTAMP"
        updated_at_expr = "updated_at" if "updated_at" in columns else created_at_expr

        cursor.execute("PRAGMA foreign_keys = OFF")
        cursor.execute("DROP TABLE IF EXISTS users__new")
        cursor.execute(
            """
            CREATE TABLE users__new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email VARCHAR(255) NOT NULL UNIQUE,
                display_name VARCHAR(80) NOT NULL,
                age INTEGER,
                bio TEXT,
                avatar_url TEXT,
                password_hash VARCHAR(128),
                password_salt VARCHAR(64),
                is_email_verified BOOLEAN NOT NULL DEFAULT 0,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            )
            """
        )
        cursor.execute(
            f"""
            INSERT INTO users__new (
                id,
                email,
                display_name,
                age,
                bio,
                avatar_url,
                password_hash,
                password_salt,
                is_email_verified,
                created_at,
                updated_at
            )
            SELECT
                id,
                email,
                display_name,
                {age_expr},
                {bio_expr},
                {avatar_expr},
                {password_hash_expr},
                {password_salt_expr},
                {email_verified_expr},
                {created_at_expr},
                {updated_at_expr}
            FROM users
            """
        )
        cursor.execute("DROP TABLE users")
        cursor.execute("ALTER TABLE users__new RENAME TO users")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_users_email ON users (email)")
        cursor.execute("PRAGMA foreign_keys = ON")
        raw_connection.commit()
    except sqlite3.Error:
        raw_connection.rollback()
        raise
    finally:
        raw_connection.close()


def get_db() -> Generator[Session, None, None]:
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()
