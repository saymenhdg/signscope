from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
import hashlib
import hmac
from pathlib import Path
import random
import secrets
import sqlite3
from typing import Any


UTC = timezone.utc
DB_PATH = Path("artifacts/signspeak_app.sqlite3")


@dataclass(frozen=True)
class AppUser:
    id: int
    email: str
    display_name: str
    created_at: str


class AppStore:
    def __init__(self, db_path: str | Path = DB_PATH) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT NOT NULL UNIQUE,
                    display_name TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    password_salt TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS translation_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    source_type TEXT NOT NULL,
                    transcript TEXT NOT NULL,
                    confidence REAL NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS practice_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    practiced_on TEXT NOT NULL,
                    accuracy REAL NOT NULL,
                    category TEXT NOT NULL,
                    signs_mastered INTEGER NOT NULL,
                    duration_minutes INTEGER NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );
                """
            )

    def create_user(self, *, email: str, display_name: str, password: str) -> AppUser:
        normalized_email = email.strip().lower()
        created_at = self._now_iso()
        salt = secrets.token_hex(16)
        password_hash = self._hash_password(password, salt)

        with self._connect() as connection:
            try:
                cursor = connection.execute(
                    """
                    INSERT INTO users (email, display_name, password_hash, password_salt, created_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (normalized_email, display_name.strip(), password_hash, salt, created_at),
                )
            except sqlite3.IntegrityError as exc:
                raise ValueError("An account with that email already exists.") from exc
            user_id = int(cursor.lastrowid)

        self._seed_user_data(user_id, display_name.strip())
        user = self.get_user_by_id(user_id)
        if user is None:
            raise RuntimeError("Failed to create user record")
        return user

    def authenticate_user(self, *, email: str, password: str) -> AppUser | None:
        normalized_email = email.strip().lower()
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT id, email, display_name, password_hash, password_salt, created_at
                FROM users
                WHERE email = ?
                """,
                (normalized_email,),
            ).fetchone()
        if row is None:
            return None
        candidate_hash = self._hash_password(password, row["password_salt"])
        if not hmac.compare_digest(candidate_hash, row["password_hash"]):
            return None
        return self._row_to_user(row)

    def create_session(self, *, user_id: int) -> tuple[str, str]:
        token = secrets.token_urlsafe(32)
        created_at = self._now()
        expires_at = created_at + timedelta(days=30)
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO sessions (token, user_id, created_at, expires_at)
                VALUES (?, ?, ?, ?)
                """,
                (token, user_id, created_at.isoformat(), expires_at.isoformat()),
            )
        return token, expires_at.isoformat()

    def delete_session(self, token: str) -> None:
        with self._connect() as connection:
            connection.execute("DELETE FROM sessions WHERE token = ?", (token,))

    def get_user_by_token(self, token: str) -> AppUser | None:
        self._delete_expired_sessions()
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT users.id, users.email, users.display_name, users.created_at
                FROM sessions
                INNER JOIN users ON users.id = sessions.user_id
                WHERE sessions.token = ?
                """,
                (token,),
            ).fetchone()
        return self._row_to_user(row) if row is not None else None

    def get_user_by_id(self, user_id: int) -> AppUser | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT id, email, display_name, created_at
                FROM users
                WHERE id = ?
                """,
                (user_id,),
            ).fetchone()
        return self._row_to_user(row) if row is not None else None

    def get_dashboard_overview(self, user_id: int) -> dict[str, Any]:
        user = self.get_user_by_id(user_id)
        if user is None:
            raise ValueError("Unknown user")
        self._ensure_user_seeded(user)

        practice_rows = self._practice_rows(user_id)
        history_rows = self._history_rows(user_id)
        total_signs = sum(int(row["signs_mastered"]) for row in practice_rows)
        average_accuracy = round(sum(float(row["accuracy"]) for row in practice_rows) / max(len(practice_rows), 1), 1)
        streak_days = self._practice_streak(practice_rows)
        translations_this_week = self._translations_this_week(history_rows)
        daily_goal_percent = min(100, 45 + (streak_days * 4))
        daily_goal_remaining_minutes = max(6, 42 - (streak_days * 2))
        recent_translations = [self._translation_item(row) for row in history_rows[:4]]
        categories = self._category_totals(practice_rows)
        weak_areas = self._weak_areas(practice_rows)
        insight = weak_areas[0] if weak_areas else {"name": "Movement fluency", "accuracy": 82.0}

        return {
            "stats": {
                "signs_mastered": total_signs,
                "practice_streak": streak_days,
                "live_accuracy": average_accuracy,
                "translations_this_week": translations_this_week,
                "daily_goal_percent": daily_goal_percent,
                "daily_goal_remaining_minutes": daily_goal_remaining_minutes,
                "rank_label": self._rank_label(total_signs),
            },
            "recent_translations": recent_translations,
            "recent_detections": [item["transcript"].split()[0].strip('",.') for item in recent_translations],
            "categories": categories[:3],
            "insight": {
                "headline": f"Review {insight['name']}",
                "detail": (
                    f"Your recent sessions are strongest on hand shape accuracy, but {insight['name']} "
                    f"is still averaging {insight['accuracy']:.0f}% and should be the next drill focus."
                ),
            },
        }

    def get_progress_overview(self, user_id: int) -> dict[str, Any]:
        user = self.get_user_by_id(user_id)
        if user is None:
            raise ValueError("Unknown user")
        self._ensure_user_seeded(user)

        practice_rows = self._practice_rows(user_id)
        total_signs = sum(int(row["signs_mastered"]) for row in practice_rows)
        streak_days = self._practice_streak(practice_rows)
        xp_points = total_signs * 7 + streak_days * 35
        level = max(1, min(12, xp_points // 350 + 1))
        next_level_xp = level * 350
        previous_level_xp = (level - 1) * 350
        progress_to_next_level = xp_points - previous_level_xp
        required_for_next_level = max(1, next_level_xp - previous_level_xp)
        heatmap = self._heatmap(practice_rows)
        weekly_accuracy = self._weekly_accuracy(practice_rows)
        categories = self._category_totals(practice_rows)
        weak_areas = self._weak_areas(practice_rows)
        achievements = self._achievements(total_signs=total_signs, streak_days=streak_days, average_accuracy=weekly_accuracy[-1])

        return {
            "totals": {
                "signs_mastered": total_signs,
                "streak_days": streak_days,
                "level": level,
                "level_title": self._rank_label(total_signs),
                "xp_points": xp_points,
                "next_level_xp": next_level_xp,
                "progress_percent": round((progress_to_next_level / required_for_next_level) * 100, 1),
            },
            "heatmap": heatmap,
            "weekly_accuracy": weekly_accuracy,
            "categories": categories,
            "weak_areas": weak_areas,
            "achievements": achievements,
        }

    def record_learning_session(
        self,
        *,
        user_id: int,
        category: str,
        accuracy: float,
        signs_mastered: int,
        duration_minutes: int,
        source_type: str,
        transcript: str,
    ) -> None:
        user = self.get_user_by_id(user_id)
        if user is None:
            raise ValueError("Unknown user")

        practiced_on = date.today().isoformat()
        created_at = self._now_iso()
        bounded_accuracy = max(0.0, min(100.0, float(accuracy)))
        bounded_mastered = max(0, int(signs_mastered))
        bounded_duration = max(1, int(duration_minutes))
        bounded_confidence = max(0.0, min(1.0, bounded_accuracy / 100.0))

        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO practice_sessions (
                    user_id, practiced_on, accuracy, category, signs_mastered, duration_minutes
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    practiced_on,
                    bounded_accuracy,
                    category,
                    bounded_mastered,
                    bounded_duration,
                ),
            )
            connection.execute(
                """
                INSERT INTO translation_history (user_id, source_type, transcript, confidence, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    source_type,
                    transcript,
                    bounded_confidence,
                    created_at,
                ),
            )

    def _ensure_user_seeded(self, user: AppUser) -> None:
        with self._connect() as connection:
            practice_count = connection.execute(
                "SELECT COUNT(*) AS total FROM practice_sessions WHERE user_id = ?",
                (user.id,),
            ).fetchone()["total"]
        if int(practice_count) == 0:
            self._seed_user_data(user.id, user.display_name)

    def _seed_user_data(self, user_id: int, display_name: str) -> None:
        rng = random.Random(user_id * 97 + len(display_name))
        today = date.today()
        categories = [
            "Conversational",
            "Professional",
            "Medical",
            "Emergency",
            "Alphabet",
            "Restaurant",
        ]
        transcripts = [
            "Can you help me find the library?",
            "Thank you for the wonderful meal.",
            "Where is the nearest subway station?",
            "I am learning sign language with SignSpeak AI.",
            "Please show me the emergency exit.",
            "We are meeting tomorrow afternoon.",
        ]

        practice_rows: list[tuple[int, str, float, str, int, int]] = []
        history_rows: list[tuple[int, str, str, float, str]] = []

        active_days = sorted({rng.randint(0, 83) for _ in range(48)})
        for offset in active_days:
            practiced_on = (today - timedelta(days=offset)).isoformat()
            category = rng.choice(categories)
            accuracy = round(rng.uniform(68.0, 99.0), 1)
            signs_mastered = rng.randint(4, 18)
            duration_minutes = rng.randint(8, 32)
            practice_rows.append((user_id, practiced_on, accuracy, category, signs_mastered, duration_minutes))

        for index in range(12):
            created_at = datetime.now(UTC) - timedelta(hours=index * rng.randint(6, 20))
            transcript = transcripts[index % len(transcripts)]
            source_type = rng.choice(["live-camera", "uploaded-video", "alphabet-practice"])
            confidence = round(rng.uniform(0.78, 0.99), 3)
            history_rows.append((user_id, source_type, transcript, confidence, created_at.isoformat()))

        with self._connect() as connection:
            connection.executemany(
                """
                INSERT INTO practice_sessions (
                    user_id, practiced_on, accuracy, category, signs_mastered, duration_minutes
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                practice_rows,
            )
            connection.executemany(
                """
                INSERT INTO translation_history (user_id, source_type, transcript, confidence, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                history_rows,
            )

    def _practice_rows(self, user_id: int) -> list[sqlite3.Row]:
        with self._connect() as connection:
            return connection.execute(
                """
                SELECT practiced_on, accuracy, category, signs_mastered, duration_minutes
                FROM practice_sessions
                WHERE user_id = ?
                ORDER BY practiced_on DESC
                """,
                (user_id,),
            ).fetchall()

    def _history_rows(self, user_id: int) -> list[sqlite3.Row]:
        with self._connect() as connection:
            return connection.execute(
                """
                SELECT id, source_type, transcript, confidence, created_at
                FROM translation_history
                WHERE user_id = ?
                ORDER BY created_at DESC
                """,
                (user_id,),
            ).fetchall()

    def _delete_expired_sessions(self) -> None:
        now_iso = self._now_iso()
        with self._connect() as connection:
            connection.execute("DELETE FROM sessions WHERE expires_at < ?", (now_iso,))

    def _translation_item(self, row: sqlite3.Row) -> dict[str, Any]:
        confidence = float(row["confidence"])
        return {
            "id": int(row["id"]),
            "source_type": row["source_type"],
            "transcript": row["transcript"],
            "confidence": round(confidence * 100, 1),
            "created_at": row["created_at"],
            "status_label": "High Accuracy" if confidence >= 0.9 else "Review Needed",
        }

    def _category_totals(self, practice_rows: list[sqlite3.Row]) -> list[dict[str, Any]]:
        totals: dict[str, int] = {}
        for row in practice_rows:
            category = str(row["category"])
            totals[category] = totals.get(category, 0) + int(row["signs_mastered"])
        ordered = sorted(totals.items(), key=lambda item: item[1], reverse=True)
        max_value = max((value for _, value in ordered), default=1)
        return [
            {
                "name": name,
                "mastered": value,
                "percent": round((value / max_value) * 100, 1),
            }
            for name, value in ordered
        ]

    def _weak_areas(self, practice_rows: list[sqlite3.Row]) -> list[dict[str, Any]]:
        per_category: dict[str, list[float]] = {}
        for row in practice_rows:
            per_category.setdefault(str(row["category"]), []).append(float(row["accuracy"]))
        ranked = sorted(
            (
                {
                    "name": category,
                    "accuracy": round(sum(scores) / len(scores), 1),
                }
                for category, scores in per_category.items()
            ),
            key=lambda item: item["accuracy"],
        )
        return ranked[:4]

    def _practice_streak(self, practice_rows: list[sqlite3.Row]) -> int:
        practice_days = {date.fromisoformat(str(row["practiced_on"])) for row in practice_rows}
        streak = 0
        cursor = date.today()
        while cursor in practice_days:
            streak += 1
            cursor -= timedelta(days=1)
        return streak

    def _translations_this_week(self, history_rows: list[sqlite3.Row]) -> int:
        threshold = datetime.now(UTC) - timedelta(days=7)
        count = 0
        for row in history_rows:
            created_at = datetime.fromisoformat(str(row["created_at"]))
            if created_at >= threshold:
                count += 1
        return count

    def _heatmap(self, practice_rows: list[sqlite3.Row]) -> list[int]:
        counts: dict[str, int] = {}
        for row in practice_rows:
            key = str(row["practiced_on"])
            counts[key] = counts.get(key, 0) + int(row["signs_mastered"])
        days: list[int] = []
        for offset in range(83, -1, -1):
            day_key = (date.today() - timedelta(days=offset)).isoformat()
            value = counts.get(day_key, 0)
            if value == 0:
                days.append(0)
            elif value < 8:
                days.append(1)
            elif value < 14:
                days.append(2)
            elif value < 20:
                days.append(3)
            else:
                days.append(4)
        return days

    def _weekly_accuracy(self, practice_rows: list[sqlite3.Row]) -> list[float]:
        buckets: list[list[float]] = [[] for _ in range(7)]
        for row in practice_rows[:28]:
            practiced_on = date.fromisoformat(str(row["practiced_on"]))
            buckets[practiced_on.weekday()].append(float(row["accuracy"]))
        return [
            round(sum(scores) / len(scores), 1) if scores else 0.0
            for scores in buckets
        ]

    def _achievements(self, *, total_signs: int, streak_days: int, average_accuracy: float) -> list[dict[str, Any]]:
        return [
            {
                "name": "Early Bird",
                "description": "Practice 5 times before 8 AM",
                "unlocked": streak_days >= 5,
            },
            {
                "name": "Swift Hand",
                "description": "Clear 10 signs in under 30 seconds",
                "unlocked": total_signs >= 120,
            },
            {
                "name": "Perfect Week",
                "description": "Maintain 95%+ weekly accuracy",
                "unlocked": average_accuracy >= 95.0,
            },
            {
                "name": "The Veteran",
                "description": "Complete 1,000 total signs",
                "unlocked": total_signs >= 1000,
            },
        ]

    def _row_to_user(self, row: sqlite3.Row) -> AppUser:
        return AppUser(
            id=int(row["id"]),
            email=str(row["email"]),
            display_name=str(row["display_name"]),
            created_at=str(row["created_at"]),
        )

    def _rank_label(self, total_signs: int) -> str:
        if total_signs >= 850:
            return "Level 9 Communicator"
        if total_signs >= 600:
            return "Level 8 Interpreter"
        if total_signs >= 350:
            return "Level 6 Mentor"
        return "Level 4 Learner"

    def _hash_password(self, password: str, salt: str) -> str:
        return hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            200_000,
        ).hex()

    def _now(self) -> datetime:
        return datetime.now(UTC)

    def _now_iso(self) -> str:
        return self._now().isoformat()
