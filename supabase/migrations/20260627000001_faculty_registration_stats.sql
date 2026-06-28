-- Aggregate registration counts per faculty (from user_progress curricula).
-- No PII exposed — only counts.

CREATE OR REPLACE FUNCTION public.get_faculty_registration_stats()
RETURNS TABLE(faculty TEXT, student_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    upper(substring(curriculum_id FROM 'Malla-(?:academica-)?([A-Z]{3})')) AS faculty,
    COUNT(DISTINCT user_id) AS student_count
  FROM public.user_progress
  WHERE curriculum_id ~* 'Malla-(?:academica-)?[A-Z]{3}'
  GROUP BY 1
  HAVING upper(substring(curriculum_id FROM 'Malla-(?:academica-)?([A-Z]{3})')) IS NOT NULL
  ORDER BY student_count DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_faculty_registration_stats() TO authenticated;
