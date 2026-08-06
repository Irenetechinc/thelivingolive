-- ═══════════════════════════════════════════════════════════════════════════
-- 003_shop.sql — Olive Shop tables
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → paste → Run).
-- All statements are idempotent; safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── shop_categories ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shop_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id   UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT '🛍',
  color       TEXT NOT NULL DEFAULT '#C4860A',
  sort_order  INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shop_categories_church_idx ON shop_categories(church_id);

-- ── shop_products ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shop_products (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id      UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  category_id    UUID REFERENCES shop_categories(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  description    TEXT,
  price          NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL DEFAULT 'NGN',
  is_free        BOOLEAN NOT NULL DEFAULT FALSE,
  product_type   TEXT NOT NULL DEFAULT 'physical'
                   CHECK (product_type IN ('physical','digital','media')),
  thumbnail_url  TEXT,
  media_url      TEXT,           -- download link for digital/media products
  stock_count    INT,            -- NULL = unlimited
  is_published   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shop_products_church_idx    ON shop_products(church_id);
CREATE INDEX IF NOT EXISTS shop_products_category_idx  ON shop_products(category_id);
CREATE INDEX IF NOT EXISTS shop_products_published_idx ON shop_products(church_id, is_published);

-- ── shop_orders ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shop_orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL,
  product_id       UUID NOT NULL REFERENCES shop_products(id),
  church_id        UUID NOT NULL REFERENCES churches(id),
  amount           NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency         TEXT NOT NULL DEFAULT 'NGN',
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','paid','failed','refunded')),
  flw_tx_ref       TEXT,         -- Flutterwave transaction reference
  flw_tx_id        TEXT,         -- Flutterwave transaction ID after verification
  buyer_name       TEXT,
  buyer_email      TEXT,
  delivery_address TEXT,         -- physical product delivery address
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shop_orders_user_idx    ON shop_orders(user_id);
CREATE INDEX IF NOT EXISTS shop_orders_church_idx  ON shop_orders(church_id);
CREATE INDEX IF NOT EXISTS shop_orders_product_idx ON shop_orders(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS shop_orders_flw_ref_idx ON shop_orders(flw_tx_ref) WHERE flw_tx_ref IS NOT NULL;

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Categories: public read scoped to church
ALTER TABLE shop_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shop_categories_read" ON shop_categories;
CREATE POLICY "shop_categories_read" ON shop_categories
  FOR SELECT USING (true);

-- Products: public read for published products
ALTER TABLE shop_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shop_products_read" ON shop_products;
CREATE POLICY "shop_products_read" ON shop_products
  FOR SELECT USING (is_published = true);

-- Orders: users can only read their own
ALTER TABLE shop_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shop_orders_own" ON shop_orders;
CREATE POLICY "shop_orders_own" ON shop_orders
  FOR ALL USING (auth.uid() = user_id);
