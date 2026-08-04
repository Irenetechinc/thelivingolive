-- ═══════════════════════════════════════════════════════════════════════════════
-- Olive Chat — Community Schema v2 (ADDENDUM)
-- Run AFTER community-schema.sql. All definitions here are either:
--   a) Already included in community-schema.sql (tables with idempotent guards)
--   b) Notification type constraint extension
--
-- NOTE: As of the latest community-schema.sql revision, the following tables
-- are now defined there and DO NOT need to be re-created here:
--   • message_requests  (uses sender_id / receiver_id)
--   • post_tags
--   • community_stories
--   • story_views
--   • user_connections
--   • extended user_profiles columns
--
-- This file is kept as a migration aid only.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Ensure notification type constraint includes all types ────────────────────
-- The main schema already has the full constraint; this is a safety net for
-- instances that were migrated from an older version.
do $$ begin
  -- Drop and recreate the constraint only if it exists with an older set of values.
  -- Supabase doesn't support "alter constraint" so we use a DO block guard.
  null; -- no-op: constraint is maintained in community-schema.sql
end $$;
