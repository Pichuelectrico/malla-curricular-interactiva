# Malla Curricular API (FastAPI + Supabase)

FastAPI backend to manage multiple careers, curricula, prerequisites, students, and student progress. Integrates Supabase (Postgres + Auth). Provides endpoints to import existing JSON curricula, list available courses given prerequisites, validate prerequisites, suggest a next-semester plan (<= 16 credits), and basic mocked metrics.

## Prerequisites
- Python 3.10+
- Supabase project (URL and keys)

## Setup
1) Copy environment example and fill it with your Supabase project values:

```bash
cp .env.example .env
# Edit .env and set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and optionally SUPABASE_ANON_KEY
```

2) Create a virtual environment and install requirements:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

3) Apply the database schema in Supabase:

- Open Supabase SQL editor and paste the contents of `db/schema.sql`.
- Run the script to create tables, indexes, RLS policies, and the `enrollment_estimate_by_course` RPC.

## Run the API

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Health check:

```bash
curl http://localhost:8000/health
```

## Auth
This backend expects Supabase Auth JWTs in the `Authorization: Bearer <token>` header. On the frontend, obtain the session access token from Supabase JS and call these endpoints with that header.

- Use `POST /students/me/init` once to create/update the current student's profile in `students` (stores `auth_user_id`, `email`, optional `name` and `career_id`).

## Importer
Import an existing career curriculum JSON (compatible with `frontend/data/Malla-*.json`). It will:
- Upsert a `career` by name
- Upsert all `courses` found in the JSON
- Create `curricula` links between the career and the courses
- Create `prerequisites` for each course

Request:

```bash
curl -X POST \
  'http://localhost:8000/import/career/CMP' \
  -H 'Authorization: Bearer <SUPABASE_JWT>' \
  -H 'Content-Type: application/json' \
  --data-binary @../frontend/data/Malla-CMP.json
```

Notes:
- The JSON supports `Last-Modified` and `source_file` fields; these are optional.
- Course `id` (e.g., `CMP1001`) is used as the primary key in `courses`.

## Course endpoints

- GET `/students/me` — returns `{ auth, student }` for the current JWT.
- POST `/students/me/init` — create/update student profile in `students`.
- GET `/students/{student_id}/available?career_id=<uuid>` — list courses available to the student given completed prerequisites.
- POST `/students/{student_id}/validate` — body `{ "course_id": "CMP3002" }`; returns missing prerequisites if any.
- POST `/students/{student_id}/suggest?career_id=<uuid>` — body `{ "max_credits": 16 }` (optional); suggests a semester plan up to the given credit limit.

Statuses considered as "passed" for prerequisite checks: `passed`, `aprobada`, `approved`.

To record completions, insert rows into `student_courses` with `status='passed'` (or one of the above) for that `student_id` and `course_id`.

## Metrics (Mocked)
- GET `/metrics/enrollment-estimate?course_ids=CMP3002&course_ids=CMP4002` — mock estimate count (uses RPC if present; falls back to a deterministic baseline).
- GET `/metrics/path-adherence?career_id=<uuid>` — mocked percentage of students following the official plan.
- GET `/metrics/trend-suggestions?career_id=<uuid>` — mocked set of trending courses from the curriculum.

## Frontend integration notes
- Use Supabase JS Auth; send the access token in `Authorization: Bearer <token>` for every call.
- After sign-in, call `POST /students/me/init` to ensure the student's profile exists.
- For the grid behavior you described:
  - Use `/students/{student_id}/available` to enable/disable selectable courses based on prerequisites.
  - Use `/students/{student_id}/suggest` to show suggestions for the next semester and keep within ~16 credits.

## CORS
CORS allowed origins are configured via `FRONTEND_ORIGINS` in `.env` (comma-separated). Defaults allow localhost:5173.

## Directory layout
- `app/main.py` — FastAPI app with routers and CORS.
- `app/core/` — configuration and auth dependency (Supabase JWT validation via service role key).
- `app/db/` — Supabase client.
- `app/models/schemas.py` — request models.
- `app/routers/` — endpoints: `importer.py`, `courses.py`, `metrics.py`.
- `db/schema.sql` — SQL to initialize Supabase.

## Notes
- Ensure your Supabase project's `auth.users` contains the user you log in with from the frontend; then call `/students/me/init` to create a profile linked via `auth_user_id`.
- The importer assumes course IDs in the JSON are unique and are the same you want in the DB.
