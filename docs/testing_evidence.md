# Testing Evidence

## Pytest Command
```powershell
.\.venv\Scripts\python.exe -m pytest -vv
```

## Result Summary
- Test framework: `pytest 9.0.3`
- Python interpreter: `Python 3.13.1`
- Platform: `win32`
- Collected tests: `3`
- Passed: `3`
- Failed: `0`
- Total runtime: `147.22s (0:02:27)`

## Covered Flows
The smoke and integration suite in [test_api_smoke.py](/abs/path/c:/Users/15047/Desktop/sign/tests/test_api_smoke.py) validates the following:

- FastAPI application startup
- Health and vocabulary endpoints
- Student registration and authenticated session restore
- Alphabet and word lesson retrieval
- Learning attempt and learning session persistence
- Teacher profile publication
- Teacher directory listing
- Student booking creation
- Teacher schedule and messaging flows
- Admin login
- Admin overview, users, and classes endpoints

## Raw Output
The captured pytest result is stored in:

- [pytest_run_output.txt](/abs/path/c:/Users/15047/Desktop/sign/docs/pytest_run_output.txt)

Result line:

```text
====================== 3 passed, 13 warnings in 147.22s (0:02:27) ======================
```

## Thesis-Ready Validation Paragraph
Backend smoke and integration testing was performed using `pytest` in the project virtual environment. The executed suite validated API startup, health and vocabulary endpoints, authentication, learning session persistence, teacher profile and booking workflows, messaging, and administrator monitoring routes. The suite completed successfully with 3 tests passed in 147.22 seconds. The warnings observed during execution were deprecation warnings and did not affect functional correctness.
