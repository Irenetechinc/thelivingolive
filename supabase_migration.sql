-- ============================================================
-- The Living Olive — Social Graph + Stories migration
-- Run this in your Supabase SQL editor (Database → SQL Editor)
-- ============================================================

-- 1. Extended profile columns
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS username          TEXT,
  ADD COLUMN IF NOT EXISTS church_affiliation TEXT,
  ADD COLUMN IF NOT EXISTS location          TEXT,
  ADD COLUMN IF NOT EXISTS state             TEXT,
  ADD COLUMN IF NOT EXISTS country           TEXT,
  ADD COLUMN IF NOT EXISTS education         TEXT,
  ADD COLUMN IF NOT EXISTS gender            TEXT,
  ADD COLUMN IF NOT EXISTS website           TEXT,
  ADD COLUMN IF NOT EXISTS dob_public        BOOLEAN NOT NULL DEFAULT FALSE;

-- Unique index on username (NULLs are not treated as equal, so multiple NULLs are fine)
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_username_unique
  ON user_profiles (username)
  WHERE username IS NOT NULL;

-- 2. Connections table
CREATE TABLE IF NOT EXISTS user_connections (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','accepted','blocked')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requester_id, addressee_id)
);

CREATE INDEX IF NOT EXISTS idx_uc_requester ON user_connections(requester_id);
CREATE INDEX IF NOT EXISTS idx_uc_addressee ON user_connections(addressee_id);
CREATE INDEX IF NOT EXISTS idx_uc_status    ON user_connections(status);

-- 3. Stories table
CREATE TABLE IF NOT EXISTS community_stories (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_url  TEXT        NOT NULL,
  media_type TEXT        NOT NULL DEFAULT 'photo' CHECK (media_type IN ('photo','video')),
  caption    TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stories_user    ON community_stories(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires ON community_stories(expires_at);

-- 4. Story views table (one row per viewer per story)
CREATE TABLE IF NOT EXISTS story_views (
  story_id  UUID        NOT NULL REFERENCES community_stories(id) ON DELETE CASCADE,
  viewer_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (story_id, viewer_id)
);

-- 5. Row-level security (enable and set basic policies)
ALTER TABLE user_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_views ENABLE ROW LEVEL SECURITY;

-- Connections: users can see connections they're part of
CREATE POLICY IF NOT EXISTS "connections_select" ON user_connections
  FOR SELECT USING (requester_id = auth.uid() OR addressee_id = auth.uid());
CREATE POLICY IF NOT EXISTS "connections_insert" ON user_connections
  FOR INSERT WITH CHECK (requester_id = auth.uid());
CREATE POLICY IF NOT EXISTS "connections_update" ON user_connections
  FOR UPDATE USING (requester_id = auth.uid() OR addressee_id = auth.uid());
CREATE POLICY IF NOT EXISTS "connections_delete" ON user_connections
  FOR DELETE USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- Stories: anyone authenticated can read non-expired; only owner can delete
CREATE POLICY IF NOT EXISTS "stories_select" ON community_stories
  FOR SELECT USING (expires_at > NOW());
CREATE POLICY IF NOT EXISTS "stories_insert" ON community_stories
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY IF NOT EXISTS "stories_delete" ON community_stories
  FOR DELETE USING (user_id = auth.uid());

-- Story views: only the viewer row owner can insert
CREATE POLICY IF NOT EXISTS "story_views_insert" ON story_views
  FOR INSERT WITH CHECK (viewer_id = auth.uid());
CREATE POLICY IF NOT EXISTS "story_views_select" ON story_views
  FOR SELECT USING (viewer_id = auth.uid());
