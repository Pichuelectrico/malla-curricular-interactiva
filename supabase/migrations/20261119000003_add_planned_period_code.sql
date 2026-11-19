-- Migration: record WHICH period a user's `planned_courses` were planned for.
-- Until now `planned_courses` mixed semesters (a plan made in July for 202610 looked like a 202620
-- pre-registration) and user_progress.updated_at is not reliable evidence either.
-- The app stamps this column (e.g. '202620') only when the user edits the planned set; NULL = legacy row.
-- The predictor counts a plan as 202620 demand only when planned_period_code = '202620' (NULL = legacy,
-- counted but reported separately; other codes are ignored).

ALTER TABLE public.user_progress
  ADD COLUMN IF NOT EXISTS planned_period_code TEXT;

COMMENT ON COLUMN public.user_progress.planned_period_code IS
  'Target period code (e.g. 202620) the planned_courses were last edited for; NULL for rows saved before this column existed.';
