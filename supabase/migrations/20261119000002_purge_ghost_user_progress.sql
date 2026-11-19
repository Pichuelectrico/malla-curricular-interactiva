-- Migration (data cleanup): delete empty "ghost" user_progress rows.
-- ---------------------------------------------------------------------------
-- The old resetProgress saved empty progress under availableCurricula ids ('cmp-usfq') instead of
-- the real curriculum_id (source_file, 'Malla-academica-CMP'), creating ~40 empty rows per user
-- (231 of 330 rows at 2026-11-19). Backup of those rows:
--   offer-scraper/backups/user_progress_ghosts_20261119T201335Z.json
-- Criteria are strict: curriculum_id is not a real malla id AND every content column is empty.
-- Idempotent; real rows ('Malla-...') are never touched. (service_role has no DELETE grant on
-- user_progress, so this must run as postgres/migration, not through PostgREST with that key.)

DELETE FROM public.user_progress
WHERE curriculum_id !~ '^Malla-(academica-)?[A-Za-z0-9]+$'
  AND completed_courses = '[]'::jsonb
  AND in_progress_courses = '[]'::jsonb
  AND planned_courses = '[]'::jsonb
  AND has_writing_intensive = false
  AND COALESCE(bucket_fulfillments, '{}'::jsonb) = '{}'::jsonb;
