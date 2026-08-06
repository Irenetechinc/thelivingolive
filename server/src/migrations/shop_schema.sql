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
