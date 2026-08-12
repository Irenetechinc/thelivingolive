-- Olive Shop checkout and seller profile addendum.
-- Idempotent: safe to run after either shop schema migration.

alter table if exists public.shop_orders
  add column if not exists payment_group_ref text,
  add column if not exists stock_decremented boolean not null default false;

create index if not exists shop_orders_payment_group_idx
  on public.shop_orders(payment_group_ref);

alter table if exists public.churches
  add column if not exists seller_about text,
  add column if not exists seller_address text,
  add column if not exists seller_policies text;