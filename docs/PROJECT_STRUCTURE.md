# Project Structure

The app is now split by runtime responsibility instead of keeping API, auth, and storage logic in a single file.

## Root

```text
sign/
|-- api/                  # FastAPI backend
|   |-- app/
|   |   |-- config.py     # Env-driven settings
|   |   |-- db.py         # SQLAlchemy engine, sessions, SQLite upgrade path
|   |   |-- models.py     # Database models
|   |   |-- schemas.py    # API request/response schemas
|   |   |-- security.py   # Password hashing and session token hashing
|   |   |-- repositories/ # Database access layer
|   |   |-- routers/      # FastAPI route groups
|   |   `-- services/     # Auth, OAuth, ML, analytics, learning services
|   `-- main.py           # Public backend entrypoint for uvicorn
|-- web/                  # React + Vite frontend
|   |-- src/
|   |   |-- components/   # Shared UI and layout components
|   |   |-- pages/        # Route-level screens
|   |   `-- lib/          # API, auth, types, utils
|   `-- .env.example      # Frontend API base example
|-- signlang/             # ML/training/inference helpers
|-- scripts/              # Dataset prep and utility scripts
|-- uistitch/             # Source UI design references
|-- docs/                 # Project docs
|-- .env.example          # Backend DB/session/OAuth example
|-- train*.py             # Training entrypoints
|-- evaluate*.py          # Evaluation entrypoints
`-- realtime.py           # Local desktop real-time inference script
```

## Backend Responsibilities

- `routers/`: HTTP layer only
- `services/`: business logic, OAuth, ML inference, analytics, learning content
- `repositories/`: SQLAlchemy queries and persistence
- `models.py`: database schema shared across features
- `db.py`: database bootstrap and local SQLite compatibility handling

## Frontend Responsibilities

- `pages/`: dashboard, auth, live, upload, progress, learning flows
- `components/`: app shell, learning overlay, shared UI atoms
- `lib/api.ts`: cookie-based API client
- `lib/auth.tsx`: session restore, sign-in, sign-out, OAuth redirect helpers
- `lib/types.ts`: backend contract types shared across pages

## Static And Generated Content

- `web/src/assets/`: frontend-bundled static assets
- `uistitch/`: design references only, not runtime code
- `artifacts/`: models, checkpoints, and local database output
- `data/`: datasets and extracted training material

## Environment-Driven Integrations

- PostgreSQL: set `DATABASE_URL`
- Google OAuth: set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- GitHub OAuth: set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`
- Frontend API origin: set `VITE_API_BASE` in `web/.env`

