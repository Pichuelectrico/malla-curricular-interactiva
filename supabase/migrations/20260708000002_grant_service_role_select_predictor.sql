-- service_role needs explicit SELECT for PostgREST exports.
-- These tables grant SELECT to anon, but not always to service_role,
-- so SUPABASE_SERVICE_KEY got HTTP 403 on raw table reads.

GRANT SELECT ON TABLE public.user_progress TO service_role;
GRANT SELECT ON TABLE public.course_offer TO service_role;
GRANT SELECT ON TABLE public.course_offer_history TO service_role;
GRANT SELECT ON TABLE public.offer_metadata TO service_role;
