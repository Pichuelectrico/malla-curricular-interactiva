-- Faculty supervised courses: support multiple code prefixes (e.g. ECO → ECN-*)

CREATE OR REPLACE FUNCTION public.get_faculty_supervised_courses(
  p_prefixes TEXT[],
  p_extra_codes TEXT[] DEFAULT '{}'
)
RETURNS TABLE(course_code TEXT, title TEXT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT ON (h.course_code)
    h.course_code,
    COALESCE(h.title, h.course_code) AS title
  FROM public.course_offer_history h
  WHERE h.type = 'Teoría'
    AND (
      EXISTS (
        SELECT 1
        FROM unnest(p_prefixes) AS p(prefix)
        WHERE h.course_code ILIKE p.prefix || '-%'
      )
      OR h.course_code = ANY (p_extra_codes)
    )
  ORDER BY h.course_code, h.scraped_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_faculty_supervised_courses(TEXT[], TEXT[]) TO authenticated;

-- Drop legacy single-prefix overload if present
DROP FUNCTION IF EXISTS public.get_faculty_supervised_courses(TEXT, TEXT[]);
