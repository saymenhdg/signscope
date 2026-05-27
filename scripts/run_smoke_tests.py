from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
import time
from pathlib import Path

from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def ensure(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def write_admin_user(database_url: str) -> None:
    os.environ["DATABASE_URL"] = database_url
    from api.app.config import get_settings
    from api.app.db import get_engine, get_session_factory, init_db
    from api.app.models import User
    from api.app.security import PasswordManager

    get_settings.cache_clear()
    get_engine.cache_clear()
    get_session_factory.cache_clear()
    init_db()

    session = get_session_factory()()
    try:
        existing = session.query(User).filter(User.email == "admin.smoke@signspeak.local").first()
        if existing is not None:
            return
        password_hash, password_salt = PasswordManager().hash_password("SmokeAdmin123!")
        session.add(
            User(
                email="admin.smoke@signspeak.local",
                display_name="Smoke Admin",
                role="admin",
                age=None,
                bio="Smoke test admin",
                avatar_url=None,
                password_hash=password_hash,
                password_salt=password_salt,
                is_email_verified=True,
            )
        )
        session.commit()
    finally:
        session.close()


def main() -> int:
    temp_root = Path(tempfile.mkdtemp(prefix="signspeak-smoke-"))
    db_path = temp_root / "smoke.sqlite3"
    media_root = temp_root / "uploads"
    database_url = f"sqlite+pysqlite:///{db_path.as_posix()}"

    os.environ["DATABASE_URL"] = database_url
    os.environ["MEDIA_ROOT"] = str(media_root)
    os.environ["SESSION_SECRET_KEY"] = "smoke-secret-key"
    os.environ["BACKEND_ORIGIN"] = "http://testserver"
    os.environ["FRONTEND_ORIGIN"] = "http://localhost:5173"

    from api.app.config import get_settings
    from api.app.db import get_engine, get_session_factory

    get_settings.cache_clear()
    get_engine.cache_clear()
    get_session_factory.cache_clear()

    write_admin_user(database_url)

    from api.app.main import create_app

    results: dict[str, object] = {
        "date": time.strftime("%Y-%m-%d %H:%M:%S"),
        "database_url": database_url,
        "checks": [],
    }

    def record(name: str, detail: str) -> None:
        checks = results["checks"]
        assert isinstance(checks, list)
        checks.append({"name": name, "detail": detail})

    app = create_app()

    try:
        with TestClient(app) as client_student, TestClient(app) as client_teacher, TestClient(app) as client_admin:
            health_payload = None
            for _ in range(20):
                response = client_student.get("/api/health")
                ensure(response.status_code == 200, f"health endpoint failed with {response.status_code}")
                health_payload = response.json()
                if health_payload.get("alphabet_model_ready") and health_payload.get("word_model_ready"):
                    break
                time.sleep(0.25)

            assert health_payload is not None
            record(
                "health",
                json.dumps(
                    {
                        "status": health_payload.get("status"),
                        "alphabet_model_ready": health_payload.get("alphabet_model_ready"),
                        "word_model_ready": health_payload.get("word_model_ready"),
                        "alphabet_labels": len(health_payload.get("labels", [])),
                        "word_labels": len(health_payload.get("word_labels", [])),
                    }
                ),
            )

            response = client_student.post(
                "/api/auth/register",
                json={
                    "email": "student.smoke@signspeak.local",
                    "display_name": "Smoke Student",
                    "password": "SmokePass123!",
                    "role": "student",
                },
            )
            ensure(response.status_code == 201, f"student registration failed: {response.text}")
            record("student_register", response.json()["user"]["email"])

            response = client_teacher.post(
                "/api/auth/register",
                json={
                    "email": "teacher.smoke@signspeak.local",
                    "display_name": "Smoke Teacher",
                    "password": "SmokePass123!",
                    "role": "teacher",
                },
            )
            ensure(response.status_code == 201, f"teacher registration failed: {response.text}")
            teacher_user = response.json()["user"]
            teacher_id = int(teacher_user["id"])
            record("teacher_register", teacher_user["email"])

            response = client_admin.post(
                "/api/auth/login",
                json={
                    "email": "admin.smoke@signspeak.local",
                    "password": "SmokeAdmin123!",
                    "role": "admin",
                },
            )
            ensure(response.status_code == 200, f"admin login failed: {response.text}")
            record("admin_login", response.json()["user"]["email"])

            response = client_student.get("/api/auth/me")
            ensure(response.status_code == 200, f"student session restore failed: {response.text}")
            record("student_me", response.json()["role"])

            response = client_student.get("/api/learn/alphabet")
            ensure(response.status_code == 200, f"alphabet lesson failed: {response.text}")
            alphabet_payload = response.json()
            ensure(len(alphabet_payload["sequence"]) >= 26, "alphabet lesson sequence is unexpectedly short")
            record("alphabet_lesson", f"sequence={len(alphabet_payload['sequence'])}")

            response = client_student.get("/api/word/vocabulary")
            ensure(response.status_code == 200, f"word vocabulary failed: {response.text}")
            vocabulary_payload = response.json()
            ensure(len(vocabulary_payload["labels"]) >= 1, "word vocabulary labels were empty")
            record(
                "word_vocabulary",
                json.dumps(
                    {
                        "ready": vocabulary_payload["ready"],
                        "labels": len(vocabulary_payload["labels"]),
                        "sequence_length": vocabulary_payload["sequence_length"],
                    }
                ),
            )

            response = client_teacher.put(
                "/api/teacher/profile-card",
                json={
                    "headline": "ASL Tutor",
                    "intro": "Experienced ASL tutor for smoke testing flows.",
                    "specialties": ["alphabet", "beginner conversation"],
                    "hourly_rate_usd": 25,
                    "lesson_duration_minutes": 45,
                    "is_public": True,
                },
            )
            ensure(response.status_code == 200, f"teacher profile update failed: {response.text}")
            record("teacher_profile_card", json.dumps({"is_public": True, "hourly_rate_usd": 25}))

            response = client_student.get("/api/teachers")
            ensure(response.status_code == 200, f"teacher directory failed: {response.text}")
            teachers_payload = response.json()["teachers"]
            ensure(any(int(item["teacher_id"]) == teacher_id for item in teachers_payload), "teacher not visible in directory")
            record("teacher_directory", f"teachers={len(teachers_payload)}")

            response = client_student.post(
                f"/api/teachers/{teacher_id}/bookings",
                json={
                    "scheduled_at": "2026-12-01T10:00:00Z",
                    "note": "Smoke booking request",
                    "duration_minutes": 45,
                },
            )
            ensure(response.status_code == 200, f"booking creation failed: {response.text}")
            booking_payload = response.json()
            booking_id = int(booking_payload["id"])
            record("booking_create", json.dumps({"booking_id": booking_id, "status": booking_payload["status"]}))

            response = client_teacher.get("/api/teacher/schedule")
            ensure(response.status_code == 200, f"teacher schedule failed: {response.text}")
            schedule_payload = response.json()
            ensure(any(int(item["id"]) == booking_id for item in schedule_payload["bookings"]), "booking missing from teacher schedule")
            record("teacher_schedule", f"bookings={len(schedule_payload['bookings'])}")

            response = client_teacher.get("/api/teacher/messages")
            ensure(response.status_code == 200, f"teacher inbox failed: {response.text}")
            inbox_payload = response.json()
            ensure(len(inbox_payload["threads"]) >= 1, "teacher inbox has no threads after booking")
            thread_id = int(inbox_payload["threads"][0]["thread_id"])
            record("teacher_messages", f"threads={len(inbox_payload['threads'])}")

            response = client_teacher.post(
                f"/api/teacher/messages/{thread_id}",
                json={"body": "Smoke test reply from teacher."},
            )
            ensure(response.status_code == 200, f"teacher send message failed: {response.text}")
            message_payload = response.json()
            ensure(len(message_payload["messages"]) >= 1, "thread messages missing after send")
            record("teacher_send_message", f"messages={len(message_payload['messages'])}")

            response = client_admin.get("/api/admin/overview")
            ensure(response.status_code == 200, f"admin overview failed: {response.text}")
            admin_overview = response.json()
            record(
                "admin_overview",
                json.dumps(
                    {
                        "total_users": admin_overview["stats"]["total_users"],
                        "total_bookings": admin_overview["stats"]["total_bookings"],
                        "recent_accuracy": admin_overview["stats"]["recent_accuracy"],
                    }
                ),
            )

            response = client_admin.get("/api/admin/users")
            ensure(response.status_code == 200, f"admin users failed: {response.text}")
            users_payload = response.json()["users"]
            ensure(len(users_payload) >= 3, "expected student, teacher, and admin users in admin list")
            record("admin_users", f"users={len(users_payload)}")

            response = client_admin.get("/api/admin/classes")
            ensure(response.status_code == 200, f"admin classes failed: {response.text}")
            classes_payload = response.json()["classes"]
            ensure(any(int(item["id"]) == booking_id for item in classes_payload), "booking missing from admin classes")
            record("admin_classes", f"classes={len(classes_payload)}")

            response = client_student.get("/api/dashboard/overview")
            ensure(response.status_code == 200, f"dashboard overview failed: {response.text}")
            dashboard_payload = response.json()
            record("dashboard_overview", json.dumps(dashboard_payload["stats"]))

    finally:
        pass

    proof_json = ROOT / "docs" / "smoke_test_proof.json"
    proof_md = ROOT / "docs" / "smoke_test_proof.md"
    proof_json.write_text(json.dumps(results, indent=2), encoding="utf-8")

    checks = results["checks"]
    assert isinstance(checks, list)
    md_lines = [
        "# Smoke Test Proof",
        "",
        f"- Date: `{results['date']}`",
        f"- Temp database: `{database_url}`",
        "",
        "## Executed Checks",
        "",
    ]
    for item in checks:
        md_lines.append(f"- `{item['name']}`: `{item['detail']}`")
    proof_md.write_text("\n".join(md_lines) + "\n", encoding="utf-8")

    print(proof_json)
    print(proof_md)

    shutil.rmtree(temp_root, ignore_errors=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
