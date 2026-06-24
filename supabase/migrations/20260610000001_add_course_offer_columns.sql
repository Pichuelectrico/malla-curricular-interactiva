-- Migration: add group_letters, paralelo, credits, college columns
-- These columns were discovered during live scraper testing.

-- course_offer
ALTER TABLE public.course_offer
  ADD COLUMN IF NOT EXISTS group_letters  TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS paralelo       TEXT,
  ADD COLUMN IF NOT EXISTS credits        INTEGER,
  ADD COLUMN IF NOT EXISTS college        TEXT;

-- Drop old section_letter index (replaced by group_letters)
DROP INDEX IF EXISTS idx_course_offer_letter;

-- Index on group_letters for efficient EJ/LAB matching
CREATE INDEX IF NOT EXISTS idx_course_offer_groups
  ON public.course_offer USING GIN (group_letters);

CREATE INDEX IF NOT EXISTS idx_course_offer_college
  ON public.course_offer (college);

-- course_offer_history: same additions
ALTER TABLE public.course_offer_history
  ADD COLUMN IF NOT EXISTS group_letters  TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS paralelo       TEXT,
  ADD COLUMN IF NOT EXISTS credits        INTEGER,
  ADD COLUMN IF NOT EXISTS college        TEXT;
