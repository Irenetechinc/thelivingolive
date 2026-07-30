-- ═══════════════════════════════════════════════════════════════════════════════
-- Olive Chat — Community Schema  (v2 — idempotent)
-- Run AFTER the main schema.sql in the Supabase SQL Editor.
-- Safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── User profiles ─────────────────────────────────────────────────────────────
create table if not exists public.user_profiles (
  id              uuid        primary key references auth.users(id) on delete cascade,
  display_name    text,
  bio             text,
  avatar_url      text,
  cover_url       text,
  date_of_birth   date,
  chat_pin_hash   text,               -- PBKDF2 hash; never exposed to client
  updated_at      timestamptz not null default now()
);
alter table public.user_profiles enable row level security;

drop policy if exists "profiles_read" on public.user_profiles;
create policy "profiles_read" on public.user_profiles
  for select using (auth.role() = 'authenticated');

drop policy if exists "profiles_owner_write" on public.user_profiles;
create policy "profiles_owner_write" on public.user_profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Chat rooms ────────────────────────────────────────────────────────────────
create table if not exists public.chat_rooms (
  id          uuid        primary key default gen_random_uuid(),
  type        text        not null check (type in ('group', 'dm')),
  name        text,
  church_id   uuid        references public.churches(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists chat_rooms_church_idx on public.chat_rooms(church_id);
alter table public.chat_rooms enable row level security;

-- ── Chat room members ─────────────────────────────────────────────────────────
create table if not exists public.chat_room_members (
  room_id       uuid        not null references public.chat_rooms(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  last_read_at  timestamptz,
  joined_at     timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists crm_user_idx on public.chat_room_members(user_id);
alter table public.chat_room_members enable row level security;

drop policy if exists "crm_owner_read" on public.chat_room_members;
create policy "crm_owner_read" on public.chat_room_members
  for select using (auth.uid() = user_id);

drop policy if exists "rooms_member_read" on public.chat_rooms;
create policy "rooms_member_read" on public.chat_rooms
  for select using (
    exists (
      select 1 from public.chat_room_members
      where room_id = id and user_id = auth.uid()
    )
  );

-- ── Message requests (first-time DM gate) ─────────────────────────────────────
create table if not exists public.message_requests (
  id            uuid        primary key default gen_random_uuid(),
  from_user_id  uuid        not null references auth.users(id) on delete cascade,
  to_user_id    uuid        not null references auth.users(id) on delete cascade,
  room_id       uuid        references public.chat_rooms(id) on delete cascade,
  status        text        not null default 'pending'
                            check (status in ('pending', 'accepted', 'rejected')),
  created_at    timestamptz not null default now(),
  unique (from_user_id, to_user_id)
);
create index if not exists mr_to_idx   on public.message_requests(to_user_id, status);
create index if not exists mr_from_idx on public.message_requests(from_user_id);
alter table public.message_requests enable row level security;

drop policy if exists "mr_owner_read" on public.message_requests;
create policy "mr_owner_read" on public.message_requests
  for select using (auth.uid() = from_user_id or auth.uid() = to_user_id);

-- ── Blocked users ─────────────────────────────────────────────────────────────
create table if not exists public.blocked_users (
  blocker_id  uuid        not null references auth.users(id) on delete cascade,
  blocked_id  uuid        not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
create index if not exists bu_blocker_idx on public.blocked_users(blocker_id);
alter table public.blocked_users enable row level security;

drop policy if exists "bu_owner_read" on public.blocked_users;
create policy "bu_owner_read" on public.blocked_users
  for select using (auth.uid() = blocker_id);

drop policy if exists "bu_owner_write" on public.blocked_users;
create policy "bu_owner_write" on public.blocked_users
  for all using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

-- ── Chat messages ─────────────────────────────────────────────────────────────
create table if not exists public.chat_messages (
  id              uuid        primary key default gen_random_uuid(),
  room_id         uuid        not null references public.chat_rooms(id) on delete cascade,
  user_id         uuid        not null references auth.users(id) on delete cascade,
  type            text        not null default 'text'
                              check (type in ('text', 'image', 'voice', 'post_share')),
  body            text,
  media_url       text,
  duration_seconds numeric,
  shared_post_id  uuid,
  created_at      timestamptz not null default now()
);
create index if not exists chat_messages_room_idx on public.chat_messages(room_id, created_at desc);
create index if not exists chat_messages_user_idx on public.chat_messages(user_id);
alter table public.chat_messages enable row level security;

drop policy if exists "messages_member_read" on public.chat_messages;
create policy "messages_member_read" on public.chat_messages
  for select using (
    exists (
      select 1 from public.chat_room_members
      where room_id = chat_messages.room_id and user_id = auth.uid()
    )
  );

drop policy if exists "messages_member_insert" on public.chat_messages;
create policy "messages_member_insert" on public.chat_messages
  for insert with check (
    auth.uid() = user_id and
    exists (
      select 1 from public.chat_room_members
      where room_id = chat_messages.room_id and user_id = auth.uid()
    )
  );

-- ── Community posts ───────────────────────────────────────────────────────────
create table if not exists public.community_posts (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users(id) on delete cascade,
  body                text,
  image_url           text,
  video_url           text,
  video_thumbnail_url text,
  tagged_user_ids     uuid[]      default '{}',
  like_count          int         not null default 0,
  comment_count       int         not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists community_posts_created_idx on public.community_posts(created_at desc);
create index if not exists community_posts_user_idx    on public.community_posts(user_id);
alter table public.community_posts enable row level security;

drop policy if exists "posts_authenticated_read" on public.community_posts;
create policy "posts_authenticated_read" on public.community_posts
  for select using (auth.role() = 'authenticated');

drop policy if exists "posts_owner_insert" on public.community_posts;
create policy "posts_owner_insert" on public.community_posts
  for insert with check (auth.uid() = user_id);

drop policy if exists "posts_owner_modify" on public.community_posts;
create policy "posts_owner_modify" on public.community_posts
  for update using (auth.uid() = user_id);

drop policy if exists "posts_owner_delete" on public.community_posts;
create policy "posts_owner_delete" on public.community_posts
  for delete using (auth.uid() = user_id);

-- ── Post likes ────────────────────────────────────────────────────────────────
create table if not exists public.post_likes (
  post_id     uuid    not null references public.community_posts(id) on delete cascade,
  user_id     uuid    not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists post_likes_user_idx on public.post_likes(user_id);
alter table public.post_likes enable row level security;

drop policy if exists "post_likes_read" on public.post_likes;
create policy "post_likes_read" on public.post_likes
  for select using (auth.role() = 'authenticated');

drop policy if exists "post_likes_owner" on public.post_likes;
create policy "post_likes_owner" on public.post_likes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Post comments ─────────────────────────────────────────────────────────────
create table if not exists public.post_comments (
  id          uuid        primary key default gen_random_uuid(),
  post_id     uuid        not null references public.community_posts(id) on delete cascade,
  parent_id   uuid        references public.post_comments(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  body        text        not null,
  like_count  int         not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists post_comments_post_idx    on public.post_comments(post_id, created_at);
create index if not exists post_comments_parent_idx  on public.post_comments(parent_id);
create index if not exists post_comments_user_idx    on public.post_comments(user_id);
alter table public.post_comments enable row level security;

drop policy if exists "comments_read" on public.post_comments;
create policy "comments_read" on public.post_comments
  for select using (auth.role() = 'authenticated');

drop policy if exists "comments_owner_insert" on public.post_comments;
create policy "comments_owner_insert" on public.post_comments
  for insert with check (auth.uid() = user_id);

drop policy if exists "comments_owner_modify" on public.post_comments;
create policy "comments_owner_modify" on public.post_comments
  for all using (auth.uid() = user_id);

-- ── Post comment likes ────────────────────────────────────────────────────────
create table if not exists public.post_comment_likes (
  comment_id  uuid    not null references public.post_comments(id) on delete cascade,
  user_id     uuid    not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index if not exists pcl_user_idx on public.post_comment_likes(user_id);
alter table public.post_comment_likes enable row level security;

drop policy if exists "comment_likes_read" on public.post_comment_likes;
create policy "comment_likes_read" on public.post_comment_likes
  for select using (auth.role() = 'authenticated');

drop policy if exists "comment_likes_owner" on public.post_comment_likes;
create policy "comment_likes_owner" on public.post_comment_likes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Community notifications ───────────────────────────────────────────────────
create table if not exists public.community_notifications (
  id            uuid        primary key default gen_random_uuid(),
  recipient_id  uuid        not null references auth.users(id) on delete cascade,
  actor_id      uuid        not null references auth.users(id) on delete cascade,
  type          text        not null
                            check (type in ('post_like','comment_like','comment','reply','dm_message','new_post','message_request','tag')),
  post_id       uuid        references public.community_posts(id) on delete cascade,
  comment_id    uuid        references public.post_comments(id) on delete cascade,
  room_id       uuid        references public.chat_rooms(id) on delete cascade,
  message_id    uuid        references public.chat_messages(id) on delete cascade,
  is_read       boolean     not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists cn_recipient_idx on public.community_notifications(recipient_id, created_at desc);
alter table public.community_notifications enable row level security;

drop policy if exists "cn_owner_read" on public.community_notifications;
create policy "cn_owner_read" on public.community_notifications
  for select using (auth.uid() = recipient_id);

drop policy if exists "cn_owner_update" on public.community_notifications;
create policy "cn_owner_update" on public.community_notifications
  for update using (auth.uid() = recipient_id);

-- ── Supabase Storage: create a public bucket named "community" ────────────────
-- Objects:  profiles/<userId>/avatar_*.jpg
--           profiles/<userId>/cover_*.jpg
--           posts/<userId>/<timestamp>.<ext>
--           messages/<roomId>/<userId>_<timestamp>.<ext>

-- ── Helper: ensure a church has a General group room ─────────────────────────
create or replace function public.ensure_church_general_room(p_church_id uuid)
returns uuid language plpgsql security definer as $$
declare v_room_id uuid;
begin
  select id into v_room_id
  from public.chat_rooms
  where church_id = p_church_id and type = 'group' and name = 'General'
  limit 1;
  if v_room_id is null then
    insert into public.chat_rooms (type, name, church_id)
    values ('group', 'General', p_church_id)
    returning id into v_room_id;
  end if;
  return v_room_id;
end;
$$;

-- ── Helper: add a user to the church General room (idempotent) ───────────────
create or replace function public.join_church_general_room(p_user_id uuid, p_church_id uuid)
returns void language plpgsql security definer as $$
declare v_room_id uuid;
begin
  v_room_id := public.ensure_church_general_room(p_church_id);
  insert into public.chat_room_members (room_id, user_id)
  values (v_room_id, p_user_id)
  on conflict (room_id, user_id) do nothing;
end;
$$;

-- ── Backfill: add tagged_user_ids column to existing community_posts ──────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'community_posts'
      and column_name  = 'tagged_user_ids'
  ) then
    alter table public.community_posts add column tagged_user_ids uuid[] default '{}';
  end if;
end $$;

-- ── Realtime publication for broadcast ───────────────────────────────────────
-- Enable realtime for chat_messages so clients receive new messages via
-- postgres_changes (reliable delivery, works without presence).
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.community_posts;
alter publication supabase_realtime add table public.community_notifications;
alter publication supabase_realtime add table public.message_requests;
