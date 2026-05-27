from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _configure_test_environment() -> tuple[str, Path]:
    temp_root = Path(tempfile.mkdtemp(prefix="signspeak-pytest-"))
    db_path = temp_root / "test.sqlite3"
    media_root = temp_root / "uploads"
    database_url = f"sqlite+pysqlite:///{db_path.as_posix()}"

    os.environ["DATABASE_URL"] = database_url
    os.environ["MEDIA_ROOT"] = str(media_root)
    os.environ["SESSION_SECRET_KEY"] = "pytest-session-secret"
    os.environ["BACKEND_ORIGIN"] = "http://testserver"
    os.environ["FRONTEND_ORIGIN"] = "http://localhost:5173"
    return database_url, temp_root


def _clear_cached_settings() -> None:
    from api.app.config import get_settings
    from api.app.db import get_engine, get_session_factory

    get_settings.cache_clear()
    get_engine.cache_clear()
    get_session_factory.cache_clear()


def _seed_admin() -> None:
    from api.app.db import get_session_factory, init_db
    from api.app.models import User
    from api.app.security import PasswordManager

    init_db()
    session = get_session_factory()()
    try:
        if session.query(User).filter(User.email == "admin.pytest@signspeak.local").first() is None:
            password_hash, password_salt = PasswordManager().hash_password("PytestAdmin123!")
            session.add(
                User(
                    email="admin.pytest@signspeak.local",
                    display_name="Pytest Admin",
                    role="admin",
                    age=None,
                    bio="Pytest admin",
                    avatar_url=None,
                    password_hash=password_hash,
                    password_salt=password_salt,
                    is_email_verified=True,
                )
            )
            session.commit()
    finally:
        session.close()


def _create_client() -> TestClient:
    _clear_cached_settings()
    _seed_admin()
    from api.app.main import create_app

    return TestClient(create_app())


def _unique_email(prefix: str) -> str:
    return f"{prefix}.{uuid4().hex[:10]}@signspeak.local"


def _register_user(client: TestClient, role: str, display_name: str) -> dict:
    response = client.post(
        "/api/auth/register",
        json={
            "email": _unique_email(role),
            "display_name": display_name,
            "password": "PytestPass123!",
            "role": role,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["user"]


def test_health_and_vocab_endpoints() -> None:
    _configure_test_environment()
    with _create_client() as client:
        health = client.get("/api/health")
        assert health.status_code == 200
        health_payload = health.json()
        assert "alphabet_model_ready" in health_payload
        assert "word_model_ready" in health_payload
        assert isinstance(health_payload["labels"], list)
        assert isinstance(health_payload["word_labels"], list)

        vocabulary = client.get("/api/word/vocabulary")
        assert vocabulary.status_code == 200
        vocabulary_payload = vocabulary.json()
        assert vocabulary_payload["sequence_length"] > 0
        assert vocabulary_payload["feature_dim"] > 0
        assert len(vocabulary_payload["labels"]) > 0


def test_student_auth_and_learning_flow() -> None:
    _configure_test_environment()
    with _create_client() as client:
        user = _register_user(client, "student", "Pytest Student")
        assert user["role"] == "student"

        me = client.get("/api/auth/me")
        assert me.status_code == 200
        assert me.json()["email"] == user["email"]

        alphabet = client.get("/api/learn/alphabet")
        assert alphabet.status_code == 200
        alphabet_payload = alphabet.json()
        assert len(alphabet_payload["sequence"]) >= 26

        words = client.get("/api/learn/words")
        assert words.status_code == 200
        words_payload = words.json()
        assert len(words_payload["items"]) > 0

        attempt = client.post(
            "/api/learn/attempt",
            json={
                "track": "alphabet",
                "category": "Pytest Alphabet",
                "expected_label": "A",
                "predicted_label": "A",
                "confidence": 0.91,
                "is_confident": True,
                "is_correct": True,
                "tracking_detected": True,
                "valid_frame_ratio": 1.0,
            },
        )
        assert attempt.status_code == 201, attempt.text

        session = client.post(
            "/api/learn/session",
            json={
                "track": "alphabet",
                "category": "Pytest Alphabet",
                "source_type": "pytest",
                "unit_title": "Pytest Session",
                "accuracy": 100.0,
                "completed_items": 1,
                "correct_items": 1,
                "attempts_count": 1,
                "duration_seconds": 30,
                "summary": "Pytest saved a graded alphabet session.",
            },
        )
        assert session.status_code == 201, session.text

        dashboard = client.get("/api/dashboard/overview")
        assert dashboard.status_code == 200
        dashboard_payload = dashboard.json()
        assert "stats" in dashboard_payload
        assert "categories" in dashboard_payload


def test_teacher_booking_and_admin_flow() -> None:
    _configure_test_environment()
    with _create_client() as student_client, _create_client() as teacher_client, _create_client() as admin_client:
        teacher = _register_user(teacher_client, "teacher", "Pytest Teacher")
        student = _register_user(student_client, "student", "Pytest Booking Student")

        profile = teacher_client.put(
            "/api/teacher/profile-card",
            json={
                "headline": "Pytest ASL Tutor",
                "intro": "Teacher profile for pytest smoke coverage.",
                "specialties": ["alphabet", "beginner"],
                "hourly_rate_usd": 20,
                "lesson_duration_minutes": 45,
                "is_public": True,
            },
        )
        assert profile.status_code == 200, profile.text
        assert profile.json()["is_public"] is True

        directory = student_client.get("/api/teachers")
        assert directory.status_code == 200
        assert any(item["teacher_id"] == teacher["id"] for item in directory.json()["teachers"])

        booking = student_client.post(
            f"/api/teachers/{teacher['id']}/bookings",
            json={
                "scheduled_at": "2026-12-01T10:00:00Z",
                "note": "Pytest booking",
                "duration_minutes": 45,
            },
        )
        assert booking.status_code == 200, booking.text
        booking_payload = booking.json()
        booking_id = booking_payload["id"]

        schedule = teacher_client.get("/api/teacher/schedule")
        assert schedule.status_code == 200
        assert any(item["id"] == booking_id for item in schedule.json()["bookings"])

        inbox = teacher_client.get("/api/teacher/messages")
        assert inbox.status_code == 200
        assert len(inbox.json()["threads"]) >= 1
        thread_id = inbox.json()["threads"][0]["thread_id"]

        reply = teacher_client.post(
            f"/api/teacher/messages/{thread_id}",
            json={"body": "Pytest teacher reply."},
        )
        assert reply.status_code == 200, reply.text
        assert len(reply.json()["messages"]) >= 1

        admin_login = admin_client.post(
            "/api/auth/login",
            json={
                "email": "admin.pytest@signspeak.local",
                "password": "PytestAdmin123!",
                "role": "admin",
            },
        )
        assert admin_login.status_code == 200, admin_login.text

        admin_overview = admin_client.get("/api/admin/overview")
        assert admin_overview.status_code == 200
        overview_payload = admin_overview.json()
        assert overview_payload["stats"]["total_users"] >= 3
        assert overview_payload["stats"]["total_bookings"] >= 1

        admin_users = admin_client.get("/api/admin/users")
        assert admin_users.status_code == 200
        assert len(admin_users.json()["users"]) >= 3

        admin_classes = admin_client.get("/api/admin/classes")
        assert admin_classes.status_code == 200
        assert any(item["id"] == booking_id for item in admin_classes.json()["classes"])
