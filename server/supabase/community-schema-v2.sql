-- ═══════════════════════════════════════════════════════════════════════════════
-- Olive Chat — Community Schema v2
-- Run AFTER community-schema.sql.  Adds:
--   • message_requests  (DM accept/reject flow)
--   • post_tags         (@ mentions in posts)
--   • message_reads     (per-message read receipts for ✓✓)
-- All idempotent. Copy-paste into Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Message requests ──────────────────────────────────────────────────────────
-- When user A sends a DM to user B for the first time, a "request" is created.
-- B must accept before A's message is fully shown. B can also reject (soft-block).
create table if not exists public.message_requests (
  id              uuid        primary key default gen_random_uuid(),
  from_user_id    uuid        not null references auth.users(id) on delete cascade,
  to_user_id      uuid        not null references auth.users(id) on delete cascade,
  room_id         uuid        not null references public.chat_rooms(id) on delete cascade,
  status          text        not null default 'pending'
                              check (status in ('pending', 'accepted', 'rejected')),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  unique (from_user_id, to_user_id)
);
create index if not exists mr_to_user_idx on public.message_requests(to_user_id, status);
create index if not exists mr_room_idx    on public.message_requests(room_id);
alter table public.message_requests enable row level security;

-- Sender and recipient can read the request
drop policy if exists "mr_parties_read" on public.message_requests;
create policy "mr_parties_read" on public.message_requests
  for select using (auth.uid() = from_user_id or auth.uid() = to_user_id);

-- Only recipient can update (accept/reject)
drop policy if exists "mr_recipient_update" on public.message_requests;
create policy "mr_recipient_update" on public.message_requests
  for update using (auth.uid() = to_user_id);

-- ── Post tags (@mentions) ─────────────────────────────────────────────────────
create table if not exists public.post_tags (
  post_id     uuid    not null references public.community_posts(id) on delete cascade,
  user_id     uuid    not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists pt_user_idx on public.post_tags(user_id);
alter table public.post_tags enable row level security;

drop policy if exists "post_tags_read" on public.post_tags;
create policy "post_tags_read" on public.post_tags
  for select using (auth.role() = 'authenticated');

drop policy if exists "post_tags_owner_insert" on public.post_tags;
create policy "post_tags_owner_insert" on public.post_tags
  for insert with check (
    exists (select 1 from public.community_posts where id = post_id and user_id = auth.uid())
  );

-- ── Message reads (per-user per-message read receipts) ────────────────────────
-- Lightweight: only track the LAST read message id per user per room.
-- The existing last_read_at on chat_room_members already handles the "unread count"
-- use case. This table allows ✓✓ display on individual bubbles in DMs.
-- We use a simple approach: update last_read_at per room on open (already done).
-- So we expose it as a joined field in messages API.
-- No new table needed — use existing chat_room_members.last_read_at.

-- ── Notification type extension ───────────────────────────────────────────────
-- Add 'message_request' type to community_notifications
alter table public.community_notifications
  drop constraint if exists community_notifications_type_check;

alter table public.community_notifications
  add constraint community_notifications_type_check
  check (type in ('post_like','comment_like','comment','reply','dm_message','new_post','message_request'));
