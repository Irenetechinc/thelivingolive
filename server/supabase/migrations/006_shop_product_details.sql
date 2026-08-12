-- Olive Shop product detail fields.
-- Idempotent: run after 003_shop.sql and safe to re-run on existing projects.

alter table if exists public.shop_products
  add column if not exists image_urls jsonb not null default '[]'::jsonb,
  add column if not exists condition text,
  add column if not exists shipping_cost numeric(12,2) not null default 0,
  add column if not exists return_policy text,
  add column if not exists estimated_delivery text,
  add column if not exists import_fee_info text,
  add column if not exists specifications jsonb not null default '{}'::jsonb,
  add column if not exists available_colors jsonb not null default '[]'::jsonb,
  add column if not exists available_sizes jsonb not null default '[]'::jsonb,
  add column if not exists pickup_available boolean not null default true,
  add column if not exists delivery_available boolean not null default true;

alter table if exists public.churches
  add column if not exists seller_about text,
  add column if not exists seller_address text,
  add column if not exists seller_policies text;