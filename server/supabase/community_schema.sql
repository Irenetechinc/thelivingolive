-- ═══════════════════════════════════════════════════════════════════════════
-- Olive Chat — Community Schema
-- Run this file against your Supabase project (SQL Editor → Run).
-- Safe to re-run: uses IF NOT EXISTS / ON CONFLICT throughout.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. User profiles ─────────────────────────────────────────────────────────
create table if not exists public.user_profiles (
  id             uuid        primary key references auth.users on delete cascade,
  display_name   text,
  bio            text        check (length(bio) <= 500),
  avatar_url     text,
  cover_url      text,
  date_of_birth  date,
  chat_pin_hash  text,                         -- PBKDF2 hash; never exposed in API
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.user_profiles enable row level security;
drop policy if exists "profiles_public_read"    on public.user_profiles;
drop policy if exists "profiles_owner_write"    on public.user_profiles;
create policy "profiles_public_read"  on public.user_profiles for select using (true);
create policy "profiles_owner_write"  on public.user_profiles for all   using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create a profile row when a new auth user is created
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles(id, display_name)
    values (NEW.id, split_part(NEW.email, '@', 1))
    on conflict (id) do nothing;
  return NEW;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 2. Community posts (general timeline) ────────────────────────────────────
create table if not exists public.community_posts (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null references auth.users on delete cascade,
  body                 text        check (length(body) <= 2000),
  image_url            text,
  video_url            text,
  video_thumbnail_url  text,
  like_count           int         not null default 0,
  comment_count        int         not null default 0,
  created_at           timestamptz not null default now()
);
alter table public.community_posts enable row level security;
drop policy if exists "posts_read"       on public.community_posts;
drop policy if exists "posts_insert"     on public.community_posts;
drop policy if exists "posts_delete_own" on public.community_posts;
create policy "posts_read"       on public.community_posts for select using (true);
create policy "posts_insert"     on public.community_posts for insert with check (auth.uid() = user_id);
create policy "posts_delete_own" on public.community_posts for delete using (auth.uid() = user_id);
create index if not exists posts_created_at_idx on public.community_posts(created_at desc);

-- ── 3. Post likes ─────────────────────────────────────────────────────────────
create table if not exists public.post_likes (
  post_id uuid references public.community_posts on delete cascade,
  user_id uuid references auth.users on delete cascade,
  primary key (post_id, user_id)
);
alter table public.post_likes enable row level security;
drop policy if exists "post_likes_read"  on public.post_likes;
drop policy if exists "post_likes_write" on public.post_likes;
create policy "post_likes_read"  on public.post_likes for select using (true);
create policy "post_likes_write" on public.post_likes for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 4. Post comments ──────────────────────────────────────────────────────────
create table if not exists public.post_comments (
  id          uuid        primary key default gen_random_uuid(),
  post_id     uuid        not null references public.community_posts on delete cascade,
  parent_id   uuid        references public.post_comments on delete cascade,
  user_id     uuid        not null references auth.users on delete cascade,
  body        text        not null check (length(body) between 1 and 2000),
  like_count  int         not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.post_comments enable row level security;
drop policy if exists "pcomments_read"   on public.post_comments;
drop policy if exists "pcomments_insert" on public.post_comments;
drop policy if exists "pcomments_delete" on public.post_comments;
create policy "pcomments_read"   on public.post_comments for select using (true);
create policy "pcomments_insert" on public.post_comments for insert with check (auth.uid() = user_id);
create policy "pcomments_delete" on public.post_comments for delete using (auth.uid() = user_id);
create index if not exists pcomments_post_idx on public.post_comments(post_id, created_at);

-- ── 5. Post comment likes ─────────────────────────────────────────────────────
create table if not exists public.post_comment_likes (
  comment_id uuid references public.post_comments on delete cascade,
  user_id    uuid references auth.users on delete cascade,
  primary key (comment_id, user_id)
);
alter table public.post_comment_likes enable row level security;
drop policy if exists "pcl_read"  on public.post_comment_likes;
drop policy if exists "pcl_write" on public.post_comment_likes;
create policy "pcl_read"  on public.post_comment_likes for select using (true);
create policy "pcl_write" on public.post_comment_likes for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 6. Chat rooms ─────────────────────────────────────────────────────────────
create table if not exists public.chat_rooms (
  id         uuid        primary key default gen_random_uuid(),
  name       text,                                          -- null for DMs
  type       text        not null check (type in ('group','dm')),
  church_id  uuid        references public.churches on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.chat_rooms enable row level security;
drop policy if exists "chat_rooms_member_read" on public.chat_rooms;
create policy "chat_rooms_member_read" on public.chat_rooms for select using (
  exists (select 1 from public.chat_room_members where room_id = id and user_id = auth.uid())
);

-- ── 7. Chat room members ──────────────────────────────────────────────────────
create table if not exists public.chat_room_members (
  room_id     uuid        references public.chat_rooms on delete cascade,
  user_id     uuid        references auth.users on delete cascade,
  last_read_at timestamptz default now(),
  primary key (room_id, user_id)
);
alter table public.chat_room_members enable row level security;
drop policy if exists "crm_read"  on public.chat_room_members;
drop policy if exists "crm_write" on public.chat_room_members;
create policy "crm_read"  on public.chat_room_members for select using (auth.uid() = user_id);
create policy "crm_write" on public.chat_room_members for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists crm_user_idx on public.chat_room_members(user_id);

-- ── 8. Chat messages ──────────────────────────────────────────────────────────
create table if not exists public.chat_messages (
  id               uuid        primary key default gen_random_uuid(),
  room_id          uuid        not null references public.chat_rooms on delete cascade,
  user_id          uuid        not null references auth.users on delete cascade,
  type             text        not null default 'text' check (type in ('text','image','voice','post_share')),
  body             text,
  media_url        text,
  shared_post_id   uuid        references public.community_posts on delete set null,
  duration_seconds int,
  created_at       timestamptz not null default now()
);
alter table public.chat_messages enable row level security;
drop policy if exists "chat_msg_read"   on public.chat_messages;
drop policy if exists "chat_msg_insert" on public.chat_messages;
create policy "chat_msg_read" on public.chat_messages for select using (
  exists (select 1 from public.chat_room_members where room_id = chat_messages.room_id and user_id = auth.uid())
);
create policy "chat_msg_insert" on public.chat_messages for insert with check (
  auth.uid() = user_id and
  exists (select 1 from public.chat_room_members where room_id = chat_messages.room_id and user_id = auth.uid())
);
create index if not exists chat_msg_room_idx on public.chat_messages(room_id, created_at desc);

-- ── 9. Auto-join church group chat on church confirmation ─────────────────────
create or replace function public.ensure_church_group_room()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_room_id uuid;
  v_church_name text;
begin
  -- Resolve church name for room label
  select name into v_church_name from public.churches where id = NEW.church_id;

  -- Get or create the group room for this church
  select id into v_room_id from public.chat_rooms
    where church_id = NEW.church_id and type = 'group' limit 1;
  if v_room_id is null then
    insert into public.chat_rooms(name, type, church_id)
      values (coalesce(v_church_name, 'General'), 'group', NEW.church_id)
      returning id into v_room_id;
  end if;

  -- Add user to the group (idempotent)
  insert into public.chat_room_members(room_id, user_id)
    values (v_room_id, NEW.user_id)
    on conflict do nothing;
  return NEW;
end;
$$;
drop trigger if exists on_church_member_upsert on public.church_members;
create trigger on_church_member_upsert
  after insert or update on public.church_members
  for each row execute function public.ensure_church_group_room();

-- ── 10. Supabase Storage bucket: community ────────────────────────────────────
-- Run this separately in Supabase Dashboard > Storage, or via the API:
-- supabase.storage.createBucket('community', { public: true })
-- The bucket must be PUBLIC so avatar/cover/post images load without auth tokens.

-- ── 11. Realtime — enable for chat_messages ───────────────────────────────────
-- In Supabase Dashboard > Database > Replication, enable realtime for:
--   public.chat_messages
-- This powers live chat without polling.
