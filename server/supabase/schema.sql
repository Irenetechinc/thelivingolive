-- The Living Olive — Supabase schema
-- Run this once in your Supabase project's SQL editor (Database > SQL Editor).
-- Requires Supabase Auth with email OTP (magic link) enabled — no passwords.

create extension if not exists "pgcrypto";

-- Verse & chapter highlights
create table if not exists public.highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  version text not null default 'KJV',
  book_id int not null,
  book_name text not null,
  chapter int not null,
  verse int not null,
  color text not null default '#F4B400',
  created_at timestamptz not null default now()
);
create index if not exists highlights_user_idx on public.highlights(user_id, book_id, chapter);

-- Notes attached to a verse OR an entire chapter (verse is null for chapter notes)
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  version text not null default 'KJV',
  book_id int not null,
  book_name text not null,
  chapter int not null,
  verse int,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_user_idx on public.notes(user_id, book_id, chapter);

-- Devotion plans the user has configured
create table if not exists public.devotion_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal text not null,
  duration text not null check (duration in ('daily','weekly','monthly','yearly')),
  preferred_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Generated devotional entries (AI output, saved for history/offline reading)
create table if not exists public.devotion_entries (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.devotion_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  scripture_reference text,
  scripture_text text,
  body text not null,
  closing_prayer text,
  created_at timestamptz not null default now()
);

-- Prayer plans the user has configured
create table if not exists public.prayer_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  desires text not null,
  prayer_type text not null,
  point_count int not null default 3,
  preferred_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Generated prayer points (AI output)
create table if not exists public.prayer_entries (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.prayer_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  prayer_text text not null,
  scripture_reference text,
  created_at timestamptz not null default now()
);

-- Expo push tokens for server-driven notifications
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, token)
);
create index if not exists push_tokens_user_idx on public.push_tokens(user_id);

-- Row Level Security: every table is scoped to the owning user
alter table public.highlights enable row level security;
alter table public.notes enable row level security;
alter table public.devotion_plans enable row level security;
alter table public.devotion_entries enable row level security;
alter table public.prayer_plans enable row level security;
alter table public.prayer_entries enable row level security;
alter table public.push_tokens enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'highlights','notes','devotion_plans','devotion_entries',
    'prayer_plans','prayer_entries','push_tokens'
  ])
  loop
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format(
      'create policy "owner_all" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t
    );
  end loop;
end $$;
