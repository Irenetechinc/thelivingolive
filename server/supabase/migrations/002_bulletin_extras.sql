-- Migration 002: Bulletin extras — announcements, ads, social links
-- Run this in your Supabase project's SQL Editor (Database → SQL Editor).
-- All statements are idempotent (safe to run multiple times).

-- ── Social links + order-of-service columns on churches ──────────────────────
alter table public.churches add column if not exists website          text;
alter table public.churches add column if not exists facebook_url     text;
alter table public.churches add column if not exists instagram_url    text;
alter table public.churches add column if not exists twitter_url      text;
alter table public.churches add column if not exists youtube_url      text;
alter table public.churches add column if not exists order_of_service jsonb;

-- ── Ads feature gate columns on churches ─────────────────────────────────────
-- can_post_ads: super admin grants this before org-admin can post ads
-- ads_excluded: super admin uses this to exclude a church from seeing any ads
alter table public.churches add column if not exists can_post_ads  boolean not null default false;
alter table public.churches add column if not exists ads_excluded  boolean not null default false;

-- ── Church announcements ──────────────────────────────────────────────────────
create table if not exists public.church_announcements (
  id         uuid        primary key default gen_random_uuid(),
  church_id  uuid        not null references public.churches(id) on delete cascade,
  text       text        not null,
  type       text        not null default 'general'
               check (type in ('general','event','urgent','reminder')),
  is_active  boolean     not null default true,
  created_at timestamptz not null default now()
);
create index if not exists church_announcements_church_idx
  on public.church_announcements(church_id, is_active, created_at desc);

alter table public.church_announcements enable row level security;
-- Service role (backend) manages all rows; authenticated users can read active ones
drop policy if exists "service_all" on public.church_announcements;
create policy "service_all" on public.church_announcements
  for all using (true) with check (true);

-- ── Church ads ────────────────────────────────────────────────────────────────
create table if not exists public.church_ads (
  id         uuid        primary key default gen_random_uuid(),
  church_id  uuid        not null references public.churches(id) on delete cascade,
  title      text        not null,
  image_url  text,
  link_url   text,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now()
);
create index if not exists church_ads_active_idx
  on public.church_ads(is_active, created_at desc);
create index if not exists church_ads_church_idx
  on public.church_ads(church_id, created_at desc);

alter table public.church_ads enable row level security;
drop policy if exists "service_all" on public.church_ads;
create policy "service_all" on public.church_ads
  for all using (true) with check (true);
