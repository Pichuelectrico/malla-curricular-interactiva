-- Migration: allow local offer-scraper (anon key) to write offer tables
-- The scraper runs only on your machine; students still read via SELECT policies.

GRANT INSERT, UPDATE, DELETE ON public.course_offer TO anon;
GRANT INSERT, UPDATE, DELETE ON public.course_offer_history TO anon;
GRANT INSERT, UPDATE ON public.offer_metadata TO anon;

CREATE POLICY "scraper insert course_offer"
  ON public.course_offer FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "scraper update course_offer"
  ON public.course_offer FOR UPDATE TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY "scraper delete course_offer"
  ON public.course_offer FOR DELETE TO anon
  USING (true);

CREATE POLICY "scraper insert course_offer_history"
  ON public.course_offer_history FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "scraper update course_offer_history"
  ON public.course_offer_history FOR UPDATE TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY "scraper delete course_offer_history"
  ON public.course_offer_history FOR DELETE TO anon
  USING (true);

CREATE POLICY "scraper insert offer_metadata"
  ON public.offer_metadata FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "scraper update offer_metadata"
  ON public.offer_metadata FOR UPDATE TO anon
  USING (true) WITH CHECK (true);
