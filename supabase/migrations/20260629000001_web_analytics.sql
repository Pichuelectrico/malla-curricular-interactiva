-- Web analytics: page_views table, admin summary RPC, 90-day retention.

CREATE TABLE IF NOT EXISTS public.page_views (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  path        TEXT        NOT NULL,
  view_name   TEXT        NOT NULL CHECK (view_name IN ('curriculum', 'teacher', 'unknown')),
  visitor_id  TEXT        NOT NULL,
  referrer    TEXT,
  device_type TEXT,
  browser     TEXT,
  os          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_page_views_created_at
  ON public.page_views (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_page_views_view_name_created_at
  ON public.page_views (view_name, created_at DESC);

ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

-- No client policies: writes via service role (Edge Function), reads via RPC only.

CREATE OR REPLACE FUNCTION public.purge_old_page_views()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.page_views
  WHERE created_at < now() - interval '90 days';
$$;

-- Schedule daily purge when pg_cron is available (Supabase hosted).
DO $cron_setup$
DECLARE
  existing_job_id bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

    SELECT jobid INTO existing_job_id
    FROM cron.job
    WHERE jobname = 'purge-page-views-90d'
    LIMIT 1;

    IF existing_job_id IS NOT NULL THEN
      PERFORM cron.unschedule(existing_job_id);
    END IF;

    PERFORM cron.schedule(
      'purge-page-views-90d',
      '0 3 * * *',
      $job$SELECT public.purge_old_page_views()$job$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron setup skipped: %', SQLERRM;
END $cron_setup$;

CREATE OR REPLACE FUNCTION public.get_web_analytics_summary(p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  since timestamptz := now() - make_interval(days => GREATEST(1, LEAST(p_days, 90)));
  result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT jsonb_build_object(
    'total_page_views', (
      SELECT COUNT(*)::bigint FROM public.page_views WHERE created_at >= since
    ),
    'unique_visitors', (
      SELECT COUNT(DISTINCT visitor_id)::bigint FROM public.page_views WHERE created_at >= since
    ),
    'by_day', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'date', d.day,
          'views', d.views,
          'visitors', d.visitors
        )
        ORDER BY d.day
      )
      FROM (
        SELECT
          (date_trunc('day', created_at) AT TIME ZONE 'UTC')::date AS day,
          COUNT(*)::bigint AS views,
          COUNT(DISTINCT visitor_id)::bigint AS visitors
        FROM public.page_views
        WHERE created_at >= since
        GROUP BY 1
      ) d
    ), '[]'::jsonb),
    'top_views', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('view_name', t.view_name, 'count', t.cnt)
        ORDER BY t.cnt DESC
      )
      FROM (
        SELECT view_name, COUNT(*)::bigint AS cnt
        FROM public.page_views
        WHERE created_at >= since
        GROUP BY view_name
        ORDER BY cnt DESC
        LIMIT 10
      ) t
    ), '[]'::jsonb),
    'top_referrers', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('referrer', t.referrer, 'count', t.cnt)
        ORDER BY t.cnt DESC
      )
      FROM (
        SELECT referrer, COUNT(*)::bigint AS cnt
        FROM public.page_views
        WHERE created_at >= since
          AND referrer IS NOT NULL
          AND referrer <> ''
        GROUP BY referrer
        ORDER BY cnt DESC
        LIMIT 10
      ) t
    ), '[]'::jsonb),
    'by_device', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('device_type', t.device_type, 'count', t.cnt)
        ORDER BY t.cnt DESC
      )
      FROM (
        SELECT COALESCE(device_type, 'unknown') AS device_type, COUNT(*)::bigint AS cnt
        FROM public.page_views
        WHERE created_at >= since
        GROUP BY 1
        ORDER BY cnt DESC
      ) t
    ), '[]'::jsonb),
    'by_browser', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('browser', t.browser, 'count', t.cnt)
        ORDER BY t.cnt DESC
      )
      FROM (
        SELECT COALESCE(browser, 'unknown') AS browser, COUNT(*)::bigint AS cnt
        FROM public.page_views
        WHERE created_at >= since
        GROUP BY 1
        ORDER BY cnt DESC
        LIMIT 10
      ) t
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_web_analytics_summary(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_page_views() TO service_role;
