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

-- ──────────────────────────────────────────────────────────────
-- Rule-based (non-LLM) prayer/devotion engine — self-learning tables.
-- No user_id/RLS on these: they hold aggregate, anonymous learning state
-- shared across all users (which scripture performs well for a category,
-- which keywords map to which category), not any one person's data.
-- ──────────────────────────────────────────────────────────────

-- Per-verse weight per category, nudged up/down by user feedback ratings.
-- Read at generation time so well-received scripture is favored over time.
create table if not exists public.verse_category_weights (
  verse_ref text not null,
  category text not null,
  weight numeric not null default 1,
  rating_count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (verse_ref, category)
);

-- Raw feedback events (1 row per rating) — kept so weight updates can be
-- recomputed/audited later rather than only keeping a running average.
create table if not exists public.generation_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  entry_type text not null check (entry_type in ('prayer','devotion')),
  category text not null,
  verse_ref text,
  rating int not null check (rating between 1 and 5),
  source_text text,
  created_at timestamptz not null default now()
);
create index if not exists generation_feedback_created_idx on public.generation_feedback(created_at);

-- Keywords the daily learning pass has promoted from highly-rated requests,
-- so restarting the server doesn't lose what's been learned so far.
create table if not exists public.learned_keywords (
  category text not null,
  keyword text not null,
  weight numeric not null default 1,
  updated_at timestamptz not null default now(),
  primary key (category, keyword)
);

alter table public.verse_category_weights enable row level security;
alter table public.generation_feedback enable row level security;
alter table public.learned_keywords enable row level security;

-- These are shared/aggregate tables (no per-row user ownership), so allow
-- any authenticated user to read them and only the service role (server) to
-- write — the server always uses the service-role key, which bypasses RLS,
-- so these policies only govern direct client access.
drop policy if exists "authenticated_read" on public.verse_category_weights;
create policy "authenticated_read" on public.verse_category_weights for select using (auth.role() = 'authenticated');
drop policy if exists "authenticated_read" on public.learned_keywords;
create policy "authenticated_read" on public.learned_keywords for select using (auth.role() = 'authenticated');
drop policy if exists "owner_insert" on public.generation_feedback;
create policy "owner_insert" on public.generation_feedback for insert with check (auth.uid() = user_id);
drop policy if exists "owner_read" on public.generation_feedback;
create policy "owner_read" on public.generation_feedback for select using (auth.uid() = user_id);

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
