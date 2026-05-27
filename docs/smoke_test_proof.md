# Smoke Test Proof

- Date: `2026-05-17 17:18:22`
- Temp database: `sqlite+pysqlite:///C:/Users/15047/AppData/Local/Temp/signspeak-smoke-fbbqu882/smoke.sqlite3`

## Executed Checks

- `health`: `{"status": "ok", "alphabet_model_ready": true, "word_model_ready": true, "alphabet_labels": 26, "word_labels": 80}`
- `student_register`: `student.smoke@signspeak.local`
- `teacher_register`: `teacher.smoke@signspeak.local`
- `admin_login`: `admin.smoke@signspeak.local`
- `student_me`: `student`
- `alphabet_lesson`: `sequence=26`
- `word_vocabulary`: `{"ready": true, "labels": 80, "sequence_length": 32}`
- `teacher_profile_card`: `{"is_public": true, "hourly_rate_usd": 25}`
- `teacher_directory`: `teachers=1`
- `booking_create`: `{"booking_id": 1, "status": "pending"}`
- `teacher_schedule`: `bookings=1`
- `teacher_messages`: `threads=1`
- `teacher_send_message`: `messages=2`
- `admin_overview`: `{"total_users": 3, "total_bookings": 1, "recent_accuracy": 0.0}`
- `admin_users`: `users=3`
- `admin_classes`: `classes=1`
- `dashboard_overview`: `{"signs_mastered": 0, "practice_streak": 0, "live_accuracy": 0.0, "translations_this_week": 0, "daily_goal_percent": 0, "daily_goal_remaining_minutes": 30, "rank_label": "Level 4 Learner"}`
