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
  -- quality_score (0-100): automatically computed by prayerEngine.scorePrayer()
  -- on vocabulary richness, scripture density, and desire relevance.
  -- Used by runPrayerQualitySync() in scheduler.js to nudge verse weights.
  quality_score int,
  created_at timestamptz not null default now()
);
-- Allow the backend (service role) to add quality_score without user auth
alter table public.prayer_entries add column if not exists quality_score int;

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
-- Church bulletin system
-- ──────────────────────────────────────────────────────────────

-- Churches onboarded by the Super Admin
create table if not exists public.churches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  admin_username text unique not null,
  password_hash text not null,
  email text,
  phone text,
  description text,
  logo_url text,
  bank_name text,
  bank_code text,
  account_number text,
  account_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists churches_slug_idx on public.churches(slug);
create index if not exists churches_username_idx on public.churches(admin_username);

-- Bulletins uploaded by church admins
create table if not exists public.bulletins (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  title text not null,
  content text not null default '',
  content_preview text not null default '',
  frequency text not null default 'weekly' check (frequency in ('daily','weekly','monthly','special')),
  publish_at timestamptz,
  expires_at timestamptz,
  is_paid boolean not null default false,
  price_ngn int not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bulletins_church_published_idx on public.bulletins(church_id, is_published, publish_at desc);

-- Tracks which user belongs to which church (their "home church" choice)
create table if not exists public.church_members (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id)
);
create index if not exists church_members_church_idx on public.church_members(church_id);

-- Tracks bulletin payment access per user (for paid bulletins)
create table if not exists public.bulletin_access (
  id uuid primary key default gen_random_uuid(),
  bulletin_id uuid not null references public.bulletins(id) on delete cascade,
  church_id uuid references public.churches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  flw_tx_ref text,
  flw_tx_id text,
  amount_ngn int not null default 0,
  status text not null default 'pending' check (status in ('pending','success','failed')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (bulletin_id, user_id)
);
create index if not exists bulletin_access_church_idx on public.bulletin_access(church_id, status);

-- Platform donations
create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  flw_tx_ref text unique,
  flw_tx_id text,
  amount_ngn int not null default 0,
  is_recurring boolean not null default false,
  status text not null default 'pending' check (status in ('pending','success','failed')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.churches enable row level security;
alter table public.bulletins enable row level security;
alter table public.church_members enable row level security;
alter table public.bulletin_access enable row level security;
alter table public.donations enable row level security;

-- Churches: readable by all authenticated users (for the picker list; server filters to active only)
drop policy if exists "authenticated_read" on public.churches;
create policy "authenticated_read" on public.churches for select using (auth.role() = 'authenticated');

-- Bulletins: readable by all authenticated users (server enforces is_published)
drop policy if exists "authenticated_read" on public.bulletins;
create policy "authenticated_read" on public.bulletins for select using (auth.role() = 'authenticated');

-- Church members: user can read/write their own row only
drop policy if exists "owner_all" on public.church_members;
create policy "owner_all" on public.church_members for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Bulletin access: user can read their own access records
drop policy if exists "owner_read" on public.bulletin_access;
create policy "owner_read" on public.bulletin_access for select using (auth.uid() = user_id);

-- Donations: user can read their own donations
drop policy if exists "owner_read" on public.donations;
create policy "owner_read" on public.donations for select using (auth.uid() = user_id);

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
  entry_type text not null check (entry_type in ('prayer','devotion','explanation')),
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

-- Scripture references the web crawler (lib/webCrawler.js) has discovered
-- from public Bible-topic reference pages, validated against local
-- scripture data before being added here. Verse TEXT is never stored — only
-- the reference/pointer; the prayer engine always re-derives the actual
-- text from server/src/data/bible/ at generation time.
create table if not exists public.discovered_verses (
  ref text not null,
  category text not null,
  book_id int not null,
  chapter int not null,
  verse_start int not null,
  verse_end int,
  keywords text[] not null default '{}',
  source_url text,
  discovered_at timestamptz not null default now(),
  primary key (ref, category)
);

-- Cached algorithmic verse explanations (verseExplainEngine.js).
-- One row per verse reference; regenerated after 48 h to benefit from
-- newly learned teaching context and dictionary data.
create table if not exists public.verse_explanations (
  verse_ref text primary key,
  explanation text not null,
  supporting_scriptures jsonb not null default '[]',
  total_rating numeric not null default 0,
  call_count int not null default 0,
  generated_at timestamptz not null default now()
);

-- Verse teaching context scraped by webCrawler.js (pass 2).
-- Snippets are short community-written teaching notes harvested from
-- openbible.info verse pages; fed into the explanation engine for richer,
-- varied explanations.
create table if not exists public.verse_teaching_context (
  verse_ref text primary key,
  snippets jsonb not null default '[]',
  source_url text,
  scraped_at timestamptz not null default now()
);

-- No RPC needed for rating increments — the server uses the service-role
-- key (which bypasses RLS) and updates verse_explanations directly.

-- Audit trail of each genetic-algorithm optimization run
-- (lib/geneticAlgorithm.js) — one row per category per run, so the
-- evolutionary process is queryable, not just visible in logs.
create table if not exists public.ga_generations (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  generations int not null,
  population_size int not null,
  best_fitness numeric not null,
  avg_fitness numeric not null,
  feedback_rows_used int not null default 0,
  best_weights jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists ga_generations_category_idx on public.ga_generations(category, created_at desc);

alter table public.verse_category_weights enable row level security;
alter table public.generation_feedback enable row level security;
alter table public.learned_keywords enable row level security;
alter table public.discovered_verses enable row level security;
alter table public.ga_generations enable row level security;
alter table public.verse_explanations enable row level security;
alter table public.verse_teaching_context enable row level security;

-- These are shared/aggregate tables (no per-row user ownership), so allow
-- any authenticated user to read them and only the service role (server) to
-- write — the server always uses the service-role key, which bypasses RLS,
-- so these policies only govern direct client access.
drop policy if exists "authenticated_read" on public.verse_category_weights;
create policy "authenticated_read" on public.verse_category_weights for select using (auth.role() = 'authenticated');
drop policy if exists "authenticated_read" on public.learned_keywords;
create policy "authenticated_read" on public.learned_keywords for select using (auth.role() = 'authenticated');
drop policy if exists "authenticated_read" on public.discovered_verses;
create policy "authenticated_read" on public.discovered_verses for select using (auth.role() = 'authenticated');
drop policy if exists "authenticated_read" on public.ga_generations;
create policy "authenticated_read" on public.ga_generations for select using (auth.role() = 'authenticated');
drop policy if exists "authenticated_read" on public.verse_explanations;
create policy "authenticated_read" on public.verse_explanations for select using (auth.role() = 'authenticated');
drop policy if exists "authenticated_read" on public.verse_teaching_context;
create policy "authenticated_read" on public.verse_teaching_context for select using (auth.role() = 'authenticated');
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

-- ── Feature flags — persists admin toggle state across Railway restarts ──────
-- Accessed only via the service role key (admin routes); never from the mobile app.
-- Run this block if you are adding feature_flags for the first time:
create table if not exists public.feature_flags (
  key        text        primary key,
  enabled    boolean     not null default true,
  updated_at timestamptz not null default now()
);
-- No RLS policies needed — service role bypasses RLS; anon/user roles never touch this table.
alter table public.feature_flags enable row level security;

do $
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
