-- Olive Shop schema
-- Run this once in your Supabase SQL editor to enable the shop feature.

-- ── Categories (per church) ───────────────────────────────────────────────────
create table if not exists shop_categories (
  id          uuid        primary key default gen_random_uuid(),
  church_id   uuid        not null references churches(id) on delete cascade,
  name        text        not null,
  icon        text        not null default '🛍',
  color       text        not null default '#5B6B45',
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists shop_categories_church_id on shop_categories(church_id);

-- ── Products ──────────────────────────────────────────────────────────────────
create table if not exists shop_products (
  id             uuid         primary key default gen_random_uuid(),
  church_id      uuid         not null references churches(id) on delete cascade,
  category_id    uuid         references shop_categories(id) on delete set null,
  title          text         not null,
  description    text,
  price          numeric(10,2) not null default 0,
  currency       text         not null default 'NGN',
  is_free        boolean      not null default false,
  product_type   text         not null default 'physical'
                   check (product_type in ('physical','digital','media')),
  thumbnail_url  text,
  media_url      text,        -- download URL for digital / media products
  stock_count    integer,     -- null = unlimited
  is_published   boolean      not null default false,
  created_at     timestamptz  not null default now(),
  updated_at     timestamptz  not null default now()
);
create index if not exists shop_products_church_id   on shop_products(church_id);
create index if not exists shop_products_category_id on shop_products(category_id);
create index if not exists shop_products_published   on shop_products(church_id, is_published);

-- ── Orders ────────────────────────────────────────────────────────────────────
create table if not exists shop_orders (
  id               uuid         primary key default gen_random_uuid(),
  user_id          uuid         not null,
  product_id       uuid         not null references shop_products(id),
  church_id        uuid         not null,
  amount           numeric(10,2) not null,
  currency         text         not null default 'NGN',
  status           text         not null default 'pending'
                     check (status in ('pending','paid','failed','refunded')),
  flw_tx_ref       text,
  flw_tx_id        text,
  delivery_address text,        -- physical products
  buyer_name       text,
  buyer_email      text,
  created_at       timestamptz  not null default now()
);
create index if not exists shop_orders_user_id    on shop_orders(user_id);
create index if not exists shop_orders_product_id on shop_orders(product_id);
create index if not exists shop_orders_flw_tx_ref on shop_orders(flw_tx_ref);

-- ── Product detail metadata (safe addendum for existing installations) ───────
alter table if exists shop_products
  add column if not exists image_urls jsonb not null default '[]'::jsonb,
  add column if not exists condition text,
  add column if not exists shipping_cost numeric(10,2) not null default 0,
  add column if not exists return_policy text,
  add column if not exists estimated_delivery text,
  add column if not exists import_fee_info text,
  add column if not exists specifications jsonb not null default '{}'::jsonb,
  add column if not exists available_colors jsonb not null default '[]'::jsonb,
  add column if not exists available_sizes jsonb not null default '[]'::jsonb,
  add column if not exists pickup_available boolean not null default true,
  add column if not exists delivery_available boolean not null default true;

-- Older deployments accidentally added a constraint that rejected valid
-- descriptions containing markup, punctuation, or longer text.
do $$
begin
  if to_regclass('public.shop_products') is not null then
    alter table public.shop_products drop constraint if exists shop_product_description_check;
  end if;
end $$;

-- ── Persistent cart and wishlist ──────────────────────────────────────────────
create table if not exists shop_cart_items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  product_id      uuid not null references shop_products(id) on delete cascade,
  quantity        integer not null default 1 check (quantity > 0),
  selected_color  text,
  selected_size   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(user_id, product_id, selected_color, selected_size)
);
create index if not exists shop_cart_user_idx on shop_cart_items(user_id);

create table if not exists shop_wishlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references shop_products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, product_id)
);
create index if not exists shop_wishlist_user_idx on shop_wishlists(user_id);

-- ── Fulfillment, invoice, collection, and tracking fields ─────────────────────
alter table if exists shop_orders
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

create unique index if not exists shop_orders_collection_code_idx
  on shop_orders(collection_code) where collection_code is not null;
create index if not exists shop_orders_group_idx on shop_orders(order_group_id);
create index if not exists shop_orders_payment_group_idx on shop_orders(payment_group_ref);

-- ── Seller profile details ───────────────────────────────────────────────────
-- These fields let each church present a complete seller profile on product
-- pages without introducing a second seller table.
alter table if exists churches
  add column if not exists seller_about text,
  add column if not exists seller_address text,
  add column if not exists seller_policies text;
