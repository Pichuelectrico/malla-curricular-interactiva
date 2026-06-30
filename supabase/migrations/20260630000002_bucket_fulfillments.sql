-- Migration: store USFQ course codes chosen for generic curriculum buckets
ALTER TABLE public.user_progress
  ADD COLUMN IF NOT EXISTS bucket_fulfillments JSONB NOT NULL DEFAULT '{}'::jsonb;
