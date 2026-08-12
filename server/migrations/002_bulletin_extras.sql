-- Migration 002: Bulletin extras — announcements, order of service, social links
-- Run this in the Supabase SQL Editor (livingolive project)
-- These columns / table power the Announcements, Order of Service,
-- and Social Media sections that now appear in the app's bulletin screen.

-- 1. New columns on the churches table
ALTER TABLE churches
  ADD COLUMN IF NOT EXISTS website        TEXT,
  ADD COLUMN IF NOT EXISTS facebook_url   TEXT,
  ADD COLUMN IF NOT EXISTS instagram_url  TEXT,
  ADD COLUMN IF NOT EXISTS twitter_url    TEXT,
  ADD COLUMN IF NOT EXISTS youtube_url    TEXT,
  ADD COLUMN IF NOT EXISTS order_of_service JSONB DEFAULT '[]';

-- 2. Church announcements table
CREATE TABLE IF NOT EXISTS church_announcements (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id  UUID    NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  text       TEXT    NOT NULL,
  type       TEXT    NOT NULL DEFAULT 'general',   -- general | event | urgent | reminder
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_church_announcements_church
  ON church_announcements(church_id, is_active, created_at DESC);

-- 3. RLS: org-admins access their own church's announcements via service-role key
--    (the org-admin portal uses supabaseAdmin which bypasses RLS — no policy needed)
--    Mobile clients read active announcements via the server (not direct Supabase access)
--    so no additional policies are required.
