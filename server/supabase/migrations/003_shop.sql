-- ═══════════════════════════════════════════════════════════════════════════
-- 003_shop.sql — Olive Shop tables (idempotent — safe to run multiple times)
--
-- Run in: Supabase Dashboard → SQL Editor → paste → Run
--
-- Strategy: CREATE TABLE IF NOT EXISTS for the base structure, then
-- ALTER TABLE … ADD COLUMN IF NOT EXISTS for every column so that
-- re-runs against a partially-created table (missing columns) still work.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. shop_categories ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shop_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id  UUID NOT NULL,
  name       TEXT NOT NULL,
  icon       TEXT NOT NULL DEFAULT '🛍',
  color      TEXT NOT NULL DEFAULT '#C4860A',
  sort_order INT  NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure all columns exist (handles tables created without some columns)
ALTER TABLE shop_categories
  ADD COLUMN IF NOT EXISTS icon       TEXT NOT NULL DEFAULT '🛍',
  ADD COLUMN IF NOT EXISTS color      TEXT NOT NULL DEFAULT '#C4860A',
  ADD COLUMN IF NOT EXISTS sort_order INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS shop_categories_church_idx ON shop_categories(church_id);

-- ── 2. shop_products ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shop_products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id     UUID NOT NULL,
  category_id   UUID,
  title         TEXT NOT NULL,
  description   TEXT,
  price         NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'NGN',
  is_free       BOOLEAN NOT NULL DEFAULT FALSE,
  product_type  TEXT NOT NULL DEFAULT 'physical',
  thumbnail_url TEXT,
  media_url     TEXT,
  stock_count   INT,
  is_published  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure every column exists — this is the key fix for the is_published error
ALTER TABLE shop_products
  ADD COLUMN IF NOT EXISTS category_id   UUID,
  ADD COLUMN IF NOT EXISTS description   TEXT,
  ADD COLUMN IF NOT EXISTS price         NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency      TEXT NOT NULL DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS is_free       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS product_type  TEXT NOT NULL DEFAULT 'physical',
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS media_url     TEXT,
  ADD COLUMN IF NOT EXISTS stock_count   INT,
  ADD COLUMN IF NOT EXISTS is_published  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ NOT NULL DEFAULT now();

-- Add CHECK constraint only if it doesn't exist yet
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shop_products_type_check'
      AND conrelid = 'shop_products'::regclass
  ) THEN
    ALTER TABLE shop_products
      ADD CONSTRAINT shop_products_type_check
      CHECK (product_type IN ('physical','digital','media'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS shop_products_church_idx    ON shop_products(church_id);
CREATE INDEX IF NOT EXISTS shop_products_category_idx  ON shop_products(category_id);
CREATE INDEX IF NOT EXISTS shop_products_published_idx ON shop_products(church_id, is_published);

-- ── 3. shop_orders ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shop_orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL,
  product_id       UUID NOT NULL,
  church_id        UUID NOT NULL,
  amount           NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency         TEXT NOT NULL DEFAULT 'NGN',
  status           TEXT NOT NULL DEFAULT 'pending',
  flw_tx_ref       TEXT,
  flw_tx_id        TEXT,
  buyer_name       TEXT,
  buyer_email      TEXT,
  delivery_address TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE shop_orders
  ADD COLUMN IF NOT EXISTS flw_tx_ref       TEXT,
  ADD COLUMN IF NOT EXISTS flw_tx_id        TEXT,
  ADD COLUMN IF NOT EXISTS buyer_name       TEXT,
  ADD COLUMN IF NOT EXISTS buyer_email      TEXT,
  ADD COLUMN IF NOT EXISTS delivery_address TEXT,
  ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ NOT NULL DEFAULT now();

-- Add status CHECK constraint only if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shop_orders_status_check'
      AND conrelid = 'shop_orders'::regclass
  ) THEN
    ALTER TABLE shop_orders
      ADD CONSTRAINT shop_orders_status_check
      CHECK (status IN ('pending','paid','failed','refunded'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS shop_orders_user_idx    ON shop_orders(user_id);
CREATE INDEX IF NOT EXISTS shop_orders_church_idx  ON shop_orders(church_id);
CREATE INDEX IF NOT EXISTS shop_orders_product_idx ON shop_orders(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS shop_orders_flw_ref_idx
  ON shop_orders(flw_tx_ref) WHERE flw_tx_ref IS NOT NULL;

-- ── 4. Row Level Security ─────────────────────────────────────────────────────
ALTER TABLE shop_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shop_categories_read" ON shop_categories;
CREATE POLICY "shop_categories_read" ON shop_categories
  FOR SELECT USING (true);

ALTER TABLE shop_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shop_products_read" ON shop_products;
CREATE POLICY "shop_products_read" ON shop_products
  FOR SELECT USING (is_published = true);

ALTER TABLE shop_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shop_orders_own" ON shop_orders;
CREATE POLICY "shop_orders_own" ON shop_orders
  FOR ALL USING (auth.uid() = user_id);
