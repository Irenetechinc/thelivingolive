-- Migration: add title and verse_ref columns to notes table
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query).
-- Both columns are nullable so existing notes are unaffected.

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS title     text,
  ADD COLUMN IF NOT EXISTS verse_ref text;

-- Optional: index verse_ref for fast lookups if you later add search
-- CREATE INDEX IF NOT EXISTS notes_verse_ref_idx ON public.notes (user_id, verse_ref);
