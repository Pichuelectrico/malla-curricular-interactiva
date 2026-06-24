-- Migration: course offer tables for scraper data + teacher profiles

-- ─────────────────────────────────────────────
-- 1. course_offer — current offer snapshot
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.course_offer (
  nrc            TEXT        PRIMARY KEY,
  course_code    TEXT        NOT NULL,
  title          TEXT        NOT NULL,
  type           TEXT        NOT NULL,        -- 'Teoría', 'Ejercicios', 'Laboratorio'
  section_letter TEXT,                        -- 'A', 'B', 'D', etc.
  days           TEXT[]      NOT NULL DEFAULT '{}',
  start_time     TEXT,
  end_time       TEXT,
  teacher        TEXT,
  available      INTEGER,
  total          INTEGER,
  period         TEXT        NOT NULL,        -- e.g. 'Semestre 2026-1', 'Verano 2026'
  last_updated   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_offer_code    ON public.course_offer (course_code);
CREATE INDEX IF NOT EXISTS idx_course_offer_period  ON public.course_offer (period);
CREATE INDEX IF NOT EXISTS idx_course_offer_letter  ON public.course_offer (section_letter);

ALTER TABLE public.course_offer ENABLE ROW LEVEL SECURITY;

-- Anyone can read the current offer (students, unauthenticated)
CREATE POLICY "anyone can read course_offer"
  ON public.course_offer
  FOR SELECT
  USING (true);

-- Only service role can write (scraper uses service key)
GRANT SELECT ON public.course_offer TO anon, authenticated;

-- ─────────────────────────────────────────────
-- 2. course_offer_history — per-period archive
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.course_offer_history (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nrc            TEXT,
  course_code    TEXT        NOT NULL,
  title          TEXT,
  type           TEXT,
  section_letter TEXT,
  days           TEXT[]      DEFAULT '{}',
  start_time     TEXT,
  end_time       TEXT,
  teacher        TEXT,
  available      INTEGER,
  total          INTEGER,
  period         TEXT        NOT NULL,
  scraped_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offer_history_code   ON public.course_offer_history (course_code);
CREATE INDEX IF NOT EXISTS idx_offer_history_period ON public.course_offer_history (period);

ALTER TABLE public.course_offer_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can read offer_history"
  ON public.course_offer_history
  FOR SELECT
  USING (true);

GRANT SELECT ON public.course_offer_history TO anon, authenticated;

-- ─────────────────────────────────────────────
-- 3. teacher_profiles — admin-managed table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.teacher_profiles (
  id       UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  email    TEXT  NOT NULL UNIQUE,
  name     TEXT,
  faculty  TEXT  NOT NULL    -- 'CMP', 'MAT', 'MAC', 'LIT', 'ECN', etc.
);

ALTER TABLE public.teacher_profiles ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their own profile row (to check if they are a teacher)
CREATE POLICY "teacher can read own profile"
  ON public.teacher_profiles
  FOR SELECT
  USING (email = auth.email());

GRANT SELECT ON public.teacher_profiles TO authenticated;
