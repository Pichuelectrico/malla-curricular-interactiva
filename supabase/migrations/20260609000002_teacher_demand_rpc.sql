-- RPC: aggregate planned course demand by faculty prefix
-- Returns course_code counts from all users' planned_courses, filtered by faculty prefix.
-- SECURITY DEFINER so it can read all user_progress rows (bypasses RLS for aggregation only).
-- Returns only aggregate counts — no individual user data is exposed.

CREATE OR REPLACE FUNCTION public.get_faculty_demand(p_faculty TEXT)
RETURNS TABLE(course_id TEXT, planned_count BIGINT)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    planned_id AS course_id,
    COUNT(*)   AS planned_count
  FROM (
    SELECT jsonb_array_elements_text(planned_courses) AS planned_id
    FROM   public.user_progress
    WHERE  jsonb_array_length(planned_courses) > 0
  ) expanded
  WHERE planned_id ILIKE (p_faculty || '%')
  GROUP BY planned_id
  ORDER BY planned_count DESC;
$$;

-- Allow authenticated users (teachers) to call this function
GRANT EXECUTE ON FUNCTION public.get_faculty_demand(TEXT) TO authenticated;
