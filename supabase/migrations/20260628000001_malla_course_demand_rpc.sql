-- RPC: demand per malla course — in_progress (this semester) + planned (next semester)

CREATE OR REPLACE FUNCTION public.get_malla_course_demand(p_course_ids TEXT[])
RETURNS TABLE(
  course_id TEXT,
  in_progress_count BIGINT,
  planned_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH course_ids AS (
    SELECT unnest(p_course_ids) AS course_id
  ),
  in_progress AS (
    SELECT
      cid AS course_id,
      COUNT(*)::bigint AS cnt
    FROM public.user_progress up,
         jsonb_array_elements_text(up.in_progress_courses) AS cid
    WHERE cid = ANY (p_course_ids)
    GROUP BY cid
  ),
  planned AS (
    SELECT
      cid AS course_id,
      COUNT(*)::bigint AS cnt
    FROM public.user_progress up,
         jsonb_array_elements_text(up.planned_courses) AS cid
    WHERE cid = ANY (p_course_ids)
    GROUP BY cid
  )
  SELECT
    c.course_id,
    COALESCE(ip.cnt, 0) AS in_progress_count,
    COALESCE(pl.cnt, 0)  AS planned_count
  FROM course_ids c
  LEFT JOIN in_progress ip ON ip.course_id = c.course_id
  LEFT JOIN planned pl ON pl.course_id = c.course_id
  ORDER BY COALESCE(pl.cnt, 0) + COALESCE(ip.cnt, 0) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_malla_course_demand(TEXT[]) TO authenticated;
