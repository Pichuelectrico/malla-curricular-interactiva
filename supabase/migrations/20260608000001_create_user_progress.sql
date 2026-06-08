-- Migration: create user_progress table with RLS
-- Applied to project: lyneadzlvusjczxmvxuv

CREATE TABLE IF NOT EXISTS public.user_progress (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  curriculum_id        TEXT        NOT NULL,
  completed_courses    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  in_progress_courses  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  planned_courses      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  has_writing_intensive BOOLEAN    NOT NULL DEFAULT false,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, curriculum_id)
);

CREATE INDEX IF NOT EXISTS idx_user_progress_user_id
  ON public.user_progress (user_id);

CREATE INDEX IF NOT EXISTS idx_user_progress_curriculum
  ON public.user_progress (curriculum_id);

-- Row Level Security
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own progress"
  ON public.user_progress
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users can insert own progress"
  ON public.user_progress
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can update own progress"
  ON public.user_progress
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can delete own progress"
  ON public.user_progress
  FOR DELETE
  USING (auth.uid() = user_id);

-- Allow Supabase API roles to access the table (RLS still applies per row)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_progress TO authenticated;
GRANT SELECT ON public.user_progress TO anon;
