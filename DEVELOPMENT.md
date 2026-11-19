# Getting Started

The app is a static React frontend (`frontend/`) that talks to Supabase directly (auth, `user_progress`, course
offer). The former Encore backend was removed on 2026-11-19 because nothing used it. See `.agents/workflow.md` for the
full data/update runbook (scrapers, predictor, publishing).

## Prerequisites

Install [bun](https://bun.sh) (or Node 20+ with npm):

```bash
npm install -g bun
```

## Running the Application

```bash
cd frontend
bun install
bun run dev
```

The frontend is served at `http://localhost:5173/malla-curricular-interactiva/` (or the next free port). Supabase
credentials come from `frontend/.env.development` / `.env.production` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

### Tests and production build

```bash
cd frontend
bun run test
bun run build   # vite production build + dist/404.html (dist/ is tracked and published to GitHub Pages)
```

## Deployment

`.github/workflows/deploy-pages.yml` builds `frontend/` and publishes it to GitHub Pages. Supabase configuration, SQL
migrations and Edge Functions are deployed separately (see `.agents/workflow.md`, section 9).
