-- Migration: period_code, offer_metadata, admin_profiles, teacher RLS

-- ─────────────────────────────────────────────
-- 1. period_code on offer tables
-- ─────────────────────────────────────────────
ALTER TABLE public.course_offer
  ADD COLUMN IF NOT EXISTS period_code TEXT;

ALTER TABLE public.course_offer_history
  ADD COLUMN IF NOT EXISTS period_code TEXT;

CREATE INDEX IF NOT EXISTS idx_course_offer_period_code
  ON public.course_offer (period_code);

CREATE INDEX IF NOT EXISTS idx_offer_history_period_code
  ON public.course_offer_history (period_code);

-- Dedupe history rows per period + NRC (nullable nrc allowed for legacy rows)
CREATE UNIQUE INDEX IF NOT EXISTS idx_offer_history_period_nrc
  ON public.course_offer_history (period_code, nrc)
  WHERE period_code IS NOT NULL AND nrc IS NOT NULL;

-- ─────────────────────────────────────────────
-- 2. offer_metadata — singleton current period
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.offer_metadata (
  id                    SMALLINT    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  current_period_code   TEXT,
  current_period_label  TEXT,
  last_scraped_at       TIMESTAMPTZ,
  last_rollover_at      TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.offer_metadata (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.offer_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can read offer_metadata"
  ON public.offer_metadata
  FOR SELECT
  USING (true);

GRANT SELECT ON public.offer_metadata TO anon, authenticated;

-- ─────────────────────────────────────────────
-- 3. admin_profiles
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_profiles (
  id    UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT  NOT NULL UNIQUE,
  name  TEXT
);

ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin can read own profile"
  ON public.admin_profiles
  FOR SELECT
  USING (email = auth.email());

GRANT SELECT ON public.admin_profiles TO authenticated;

-- ─────────────────────────────────────────────
-- 4. is_admin() helper
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE email = auth.email()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ─────────────────────────────────────────────
-- 5. teacher_profiles — departments + admin RLS
-- ─────────────────────────────────────────────
ALTER TABLE public.teacher_profiles
  ADD COLUMN IF NOT EXISTS departments TEXT[] NOT NULL DEFAULT '{}';

CREATE POLICY "admin can insert teacher_profiles"
  ON public.teacher_profiles
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "admin can update teacher_profiles"
  ON public.teacher_profiles
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admin can delete teacher_profiles"
  ON public.teacher_profiles
  FOR DELETE
  USING (public.is_admin());

CREATE POLICY "admin can read all teacher_profiles"
  ON public.teacher_profiles
  FOR SELECT
  USING (public.is_admin());
