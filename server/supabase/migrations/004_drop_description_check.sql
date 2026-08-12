-- ═══════════════════════════════════════════════════════════════════════════
-- 004_drop_description_check.sql
--
-- Drops the rogue shop_product_description_check constraint that was added
-- directly to the live database outside of migrations.  That constraint
-- blocked inserts/updates where description is NULL (i.e. optional / not
-- provided), which is valid — description is intentionally optional on
-- shop_products.
--
-- Safe to run multiple times (DO $$ … $$ guard).
-- Run in: Supabase Dashboard → SQL Editor → paste → Run
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  tbl regclass;
BEGIN
  -- The constraint may live on shop_products (current name) or shop_product
  -- (an older singular form).  Try both so this is safe regardless of history.
  FOR tbl IN
    SELECT oid FROM pg_class
    WHERE relname IN ('shop_products', 'shop_product')
      AND relnamespace = 'public'::regnamespace
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'shop_product_description_check'
        AND conrelid = tbl
    ) THEN
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT shop_product_description_check', tbl);
      RAISE NOTICE 'Dropped shop_product_description_check from %', tbl;
    END IF;
  END LOOP;
END$$;
