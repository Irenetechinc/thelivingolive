-- Migration 003: Ads system + bulletin extras columns
-- Run this in the Supabase SQL Editor (livingolive project)

-- 1. Church ads table (org-admins post ads; super-admin controls who can post)
CREATE TABLE IF NOT EXISTS church_ads (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id  UUID    NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  image_url  TEXT,
  link_url   TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_church_ads_active
  ON church_ads(is_active, created_at DESC);

-- 2. Per-church ad permissions on the churches table
ALTER TABLE churches
  ADD COLUMN IF NOT EXISTS can_post_ads  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ads_excluded  BOOLEAN NOT NULL DEFAULT false;

-- 3. Logo storage URL column (already set from migration 002; no-op if exists)
-- ALTER TABLE churches ADD COLUMN IF NOT EXISTS logo_url TEXT;  -- already exists

-- Notes:
-- can_post_ads  = super-admin grants this church the ability to post ads
-- ads_excluded  = this church's bulletin screen will NOT show any ads
