-- Olive Shop checkout and seller profile addendum.
-- Idempotent: safe to run after either shop schema migration.

alter table if exists public.shop_orders
  add column if not exists amount numeric(10,2) not null default 0,
  add column if not exists currency text not null default 'NGN',
  add column if not exists status text not null default 'pending',
  add column if not exists flw_tx_ref text,
  add column if not exists flw_tx_id text,
  add column if not exists delivery_address text,
  add column if not exists buyer_name text,
  add column if not exists buyer_email text,
  add column if not exists quantity integer not null default 1,
  add column if not exists selected_color text,
  add column if not exists selected_size text,
  add column if not exists fulfillment_method text not null default 'delivery',
  add column if not exists shipping_name text,
  add column if not exists shipping_phone text,
  add column if not exists shipping_address text,
  add column if not exists collection_code text,
  add column if not exists collection_qr text,
  add column if not exists invoice_number text,
  add column if not exists order_group_id uuid,
  add column if not exists tracking_status text not null default 'order_received',
  add column if not exists tracking_number text,
  add column if not exists tracking_events jsonb not null default '[]'::jsonb,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_group_ref text,
  add column if not exists stock_decremented boolean not null default false;

create index if not exists shop_orders_payment_group_idx
  on public.shop_orders(payment_group_ref);

alter table if exists public.churches
  add column if not exists seller_about text,
  add column if not exists seller_address text,
  add column if not exists seller_policies text;