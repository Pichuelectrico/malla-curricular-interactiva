-- Planner preference: include planned courses from other careers
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS include_other_mallas BOOLEAN NOT NULL DEFAULT false;
