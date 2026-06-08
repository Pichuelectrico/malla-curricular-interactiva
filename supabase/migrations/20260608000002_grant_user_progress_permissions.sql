-- Migration: grant API access to user_progress table
-- Required for authenticated users to read/write via PostgREST (Supabase JS client)

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_progress TO authenticated;
GRANT SELECT ON public.user_progress TO anon;
