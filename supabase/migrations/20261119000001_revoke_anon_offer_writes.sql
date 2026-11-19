-- Migration: REVOKE anonymous write access to the course offer tables.
-- ---------------------------------------------------------------------------
-- 20260627000001_scraper_write_grants.sql opened INSERT/UPDATE/DELETE to the public `anon`
-- role (policies with USING/WITH CHECK (true)) so the local scraper could write with the anon key.
-- The anon key ships in the frontend bundle, so ANYONE can delete/rewrite course_offer,
-- course_offer_history and offer_metadata (current_period_code drives the predictor target).
--
-- DO NOT APPLY until offer-scraper/.env holds a REAL service_role key in SUPABASE_SERVICE_KEY
-- (check: `cd offer-scraper && .venv/bin/python supabase_key_check.py`), otherwise the cron
-- (11:00 / 15:00 America/Guayaquil) will start failing with HTTP 401/403.
--
-- This project's service_role does not get table privileges by default (it needed an explicit
-- SELECT grant in 20260708000002), so the write grants are added here BEFORE anon loses them.
-- Students keep reading through the existing SELECT grants/policies (not touched).

-- 1) Give service_role what the scraper needs (idempotent).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.course_offer TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.course_offer_history TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.offer_metadata TO service_role;

-- 2) Remove the anon policies created by 20260627000001.
DROP POLICY IF EXISTS "scraper insert course_offer" ON public.course_offer;
DROP POLICY IF EXISTS "scraper update course_offer" ON public.course_offer;
DROP POLICY IF EXISTS "scraper delete course_offer" ON public.course_offer;
DROP POLICY IF EXISTS "scraper insert course_offer_history" ON public.course_offer_history;
DROP POLICY IF EXISTS "scraper update course_offer_history" ON public.course_offer_history;
DROP POLICY IF EXISTS "scraper delete course_offer_history" ON public.course_offer_history;
DROP POLICY IF EXISTS "scraper insert offer_metadata" ON public.offer_metadata;
DROP POLICY IF EXISTS "scraper update offer_metadata" ON public.offer_metadata;

-- 3) Remove the anon write privileges.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.course_offer FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.course_offer_history FROM anon;
REVOKE INSERT, UPDATE ON TABLE public.offer_metadata FROM anon;
-- Also from `authenticated`, in case an earlier ad-hoc grant exists (SELECT stays).
REVOKE INSERT, UPDATE, DELETE ON TABLE public.course_offer FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.course_offer_history FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.offer_metadata FROM authenticated;
