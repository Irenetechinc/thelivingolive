-- ============================================================
-- Migration: Add all columns that exist in schema.sql but are
-- absent from production tables.
-- Safe to run multiple times — uses IF NOT EXISTS / DO blocks.
-- Run this in the Supabase SQL editor or via psql.
-- ============================================================

-- ── user_profiles: extended profile fields ────────────────────────────────────
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS username          text,
  ADD COLUMN IF NOT EXISTS church_affiliation text,
  ADD COLUMN IF NOT EXISTS location          text,
  ADD COLUMN IF NOT EXISTS state             text,
  ADD COLUMN IF NOT EXISTS country           text,
  ADD COLUMN IF NOT EXISTS education         text,
  ADD COLUMN IF NOT EXISTS gender            text,
  ADD COLUMN IF NOT EXISTS website           text,
  ADD COLUMN IF NOT EXISTS dob_public        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS date_of_birth     date;

-- unique constraint on username (nullable so no duplicate NULL issue)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_username_key'
  ) THEN
    ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_username_key UNIQUE (username);
  END IF;
END $$;

-- ── bulletins: featured image ─────────────────────────────────────────────────
ALTER TABLE public.bulletins
  ADD COLUMN IF NOT EXISTS featured_image_url text;

-- ── verse_explanations: quality_score column ─────────────────────────────────
ALTER TABLE public.verse_explanations
  ADD COLUMN IF NOT EXISTS quality_score numeric;

-- ── message_requests: create table if missing, or add columns ────────────────
CREATE TABLE IF NOT EXISTS public.message_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     uuid REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  sender_id   uuid NOT NULL,
  receiver_id uuid NOT NULL,
  status      text NOT NULL DEFAULT 'pending',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- If the table already existed with old column names (from_user_id / to_user_id),
-- add the new canonical column names as aliases so both work during transition.
ALTER TABLE public.message_requests
  ADD COLUMN IF NOT EXISTS sender_id   uuid;
ALTER TABLE public.message_requests
  ADD COLUMN IF NOT EXISTS receiver_id uuid;

-- Copy data from old column names if they exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='message_requests' AND column_name='from_user_id'
  ) THEN
    UPDATE public.message_requests SET sender_id = from_user_id WHERE sender_id IS NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='message_requests' AND column_name='to_user_id'
  ) THEN
    UPDATE public.message_requests SET receiver_id = to_user_id WHERE receiver_id IS NULL;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE public.message_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_see_own_requests" ON public.message_requests;
CREATE POLICY "users_see_own_requests" ON public.message_requests
  FOR ALL USING (
    auth.uid() = sender_id OR auth.uid() = receiver_id
  );

-- ── bulletin_likes / bulletin_comments: ensure they exist ────────────────────
CREATE TABLE IF NOT EXISTS public.bulletin_likes (
  bulletin_id uuid NOT NULL,
  user_id     uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bulletin_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.bulletin_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bulletin_id uuid NOT NULL,
  parent_id   uuid REFERENCES public.bulletin_comments(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  body        text NOT NULL,
  like_count  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bulletin_comment_likes (
  comment_id uuid NOT NULL,
  user_id    uuid NOT NULL,
  PRIMARY KEY (comment_id, user_id)
);
