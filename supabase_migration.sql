-- ============================================================
-- The Living Olive — Social Graph + Stories migration
-- Run this in your Supabase SQL editor (Database → SQL Editor)
-- ============================================================

-- 1. Extended profile columns
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS username          TEXT,
  ADD COLUMN IF NOT EXISTS church_affiliation TEXT,
  ADD COLUMN IF NOT EXISTS location          TEXT,
  ADD COLUMN IF NOT EXISTS state             TEXT,
  ADD COLUMN IF NOT EXISTS country           TEXT,
  ADD COLUMN IF NOT EXISTS education         TEXT,
  ADD COLUMN IF NOT EXISTS gender            TEXT,
  ADD COLUMN IF NOT EXISTS website           TEXT,
  ADD COLUMN IF NOT EXISTS dob_public        BOOLEAN NOT NULL DEFAULT FALSE;

-- Unique index on username (NULLs are not treated as equal, so multiple NULLs are fine)
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_username_unique
  ON user_profiles (username)
  WHERE username IS NOT NULL;

-- 2. Connections table
CREATE TABLE IF NOT EXISTS user_connections (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','accepted','blocked')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requester_id, addressee_id)
);

ALTER TABLE IF EXISTS user_connections
  ADD COLUMN IF NOT EXISTS requester_id UUID,
  ADD COLUMN IF NOT EXISTS addressee_id UUID,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_uc_requester ON user_connections(requester_id);
CREATE INDEX IF NOT EXISTS idx_uc_addressee ON user_connections(addressee_id);
CREATE INDEX IF NOT EXISTS idx_uc_status    ON user_connections(status);

-- 3. Stories table
CREATE TABLE IF NOT EXISTS community_stories (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_url  TEXT        NOT NULL,
  media_type TEXT        NOT NULL DEFAULT 'photo' CHECK (media_type IN ('photo','video')),
  caption    TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stories_user    ON community_stories(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires ON community_stories(expires_at);

-- 4. Story views table (one row per viewer per story)
CREATE TABLE IF NOT EXISTS story_views (
  story_id  UUID        NOT NULL REFERENCES community_stories(id) ON DELETE CASCADE,
  viewer_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (story_id, viewer_id)
);

-- 5. Reels table (separate from stories)
CREATE TABLE IF NOT EXISTS community_reels (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_url          TEXT        NOT NULL,
  thumbnail_url      TEXT,
  caption            TEXT,
  visibility         TEXT        NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','friends','private')),
  genre              TEXT        NOT NULL DEFAULT 'general',
  like_count         INTEGER     NOT NULL DEFAULT 0,
  comment_count      INTEGER     NOT NULL DEFAULT 0,
  view_count         INTEGER     NOT NULL DEFAULT 0,
  watch_time_seconds INTEGER     NOT NULL DEFAULT 0,
  trending_score     NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reels_user ON community_reels(user_id);
CREATE INDEX IF NOT EXISTS idx_reels_visibility ON community_reels(visibility);
CREATE INDEX IF NOT EXISTS idx_reels_created ON community_reels(created_at DESC);

CREATE TABLE IF NOT EXISTS reel_views (
  reel_id          UUID        NOT NULL REFERENCES community_reels(id) ON DELETE CASCADE,
  viewer_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  watch_seconds    INTEGER     NOT NULL DEFAULT 0,
  completion_ratio NUMERIC(5,2) NOT NULL DEFAULT 0,
  viewed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (reel_id, viewer_id)
);

CREATE TABLE IF NOT EXISTS reel_likes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id    UUID        NOT NULL REFERENCES community_reels(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(reel_id, user_id)
);

CREATE TABLE IF NOT EXISTS reel_comments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id    UUID        NOT NULL REFERENCES community_reels(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Row-level security (enable and set basic policies)
ALTER TABLE user_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_reels ENABLE ROW LEVEL SECURITY;
ALTER TABLE reel_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE reel_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reel_comments ENABLE ROW LEVEL SECURITY;

-- Connections: users can see connections they're part of
DROP POLICY IF EXISTS "connections_select" ON user_connections;
CREATE POLICY "connections_select" ON user_connections
  FOR SELECT USING (requester_id = auth.uid() OR addressee_id = auth.uid());
DROP POLICY IF EXISTS "connections_insert" ON user_connections;
CREATE POLICY "connections_insert" ON user_connections
  FOR INSERT WITH CHECK (requester_id = auth.uid());
DROP POLICY IF EXISTS "connections_update" ON user_connections;
CREATE POLICY "connections_update" ON user_connections
  FOR UPDATE USING (requester_id = auth.uid() OR addressee_id = auth.uid());
DROP POLICY IF EXISTS "connections_delete" ON user_connections;
CREATE POLICY "connections_delete" ON user_connections
  FOR DELETE USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- Stories: anyone authenticated can read non-expired; only owner can delete
DROP POLICY IF EXISTS "stories_select" ON community_stories;
CREATE POLICY "stories_select" ON community_stories
  FOR SELECT USING (expires_at > NOW());
DROP POLICY IF EXISTS "stories_insert" ON community_stories;
CREATE POLICY "stories_insert" ON community_stories
  FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "stories_delete" ON community_stories;
CREATE POLICY "stories_delete" ON community_stories
  FOR DELETE USING (user_id = auth.uid());

-- Story views: only the viewer row owner can insert
DROP POLICY IF EXISTS "story_views_insert" ON story_views;
CREATE POLICY "story_views_insert" ON story_views
  FOR INSERT WITH CHECK (viewer_id = auth.uid());
DROP POLICY IF EXISTS "story_views_select" ON story_views;
CREATE POLICY "story_views_select" ON story_views
  FOR SELECT USING (viewer_id = auth.uid());

-- Reels are visible to anyone authenticated for public or friends content; private is owner-only
DROP POLICY IF EXISTS "reels_select" ON community_reels;
CREATE POLICY "reels_select" ON community_reels
  FOR SELECT USING (visibility IN ('public','friends') OR user_id = auth.uid());
DROP POLICY IF EXISTS "reels_insert" ON community_reels;
CREATE POLICY "reels_insert" ON community_reels
  FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "reels_update" ON community_reels;
CREATE POLICY "reels_update" ON community_reels
  FOR UPDATE USING (user_id = auth.uid());
DROP POLICY IF EXISTS "reels_delete" ON community_reels;
CREATE POLICY "reels_delete" ON community_reels
  FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "reel_views_insert" ON reel_views;
CREATE POLICY "reel_views_insert" ON reel_views
  FOR INSERT WITH CHECK (viewer_id = auth.uid());
DROP POLICY IF EXISTS "reel_views_select" ON reel_views;
CREATE POLICY "reel_views_select" ON reel_views
  FOR SELECT USING (viewer_id = auth.uid());

DROP POLICY IF EXISTS "reel_likes_insert" ON reel_likes;
CREATE POLICY "reel_likes_insert" ON reel_likes
  FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "reel_likes_select" ON reel_likes;
CREATE POLICY "reel_likes_select" ON reel_likes
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "reel_likes_delete" ON reel_likes;
CREATE POLICY "reel_likes_delete" ON reel_likes
  FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "reel_comments_insert" ON reel_comments;
CREATE POLICY "reel_comments_insert" ON reel_comments
  FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "reel_comments_select" ON reel_comments;
CREATE POLICY "reel_comments_select" ON reel_comments
  FOR SELECT USING (true);

-- ============================================================
-- Olive Shop Schema
-- ============================================================

-- 7. Categories (per church)
CREATE TABLE IF NOT EXISTS shop_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id   UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  icon        TEXT        NOT NULL DEFAULT 'bag-outline',
  color       TEXT        NOT NULL DEFAULT '#5B6B45',
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS shop_categories_church_id ON shop_categories(church_id);

-- 7. Products
CREATE TABLE IF NOT EXISTS shop_products (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  category_id     UUID        REFERENCES shop_categories(id) ON DELETE SET NULL,
  title           TEXT        NOT NULL,
  description     TEXT,
  price           NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency        TEXT        NOT NULL DEFAULT 'NGN',
  is_free         BOOLEAN     NOT NULL DEFAULT FALSE,
  product_type    TEXT        NOT NULL DEFAULT 'physical'
                  CHECK (product_type IN ('physical','digital','media')),
  thumbnail_url   TEXT,
  media_url       TEXT,
  image_urls      JSONB       NOT NULL DEFAULT '[]'::JSONB,
  stock_count     INTEGER,
  is_published    BOOLEAN     NOT NULL DEFAULT FALSE,
  condition       TEXT,
  shipping_cost   NUMERIC(10,2) NOT NULL DEFAULT 0,
  return_policy   TEXT,
  estimated_delivery TEXT,
  import_fee_info TEXT,
  specifications  JSONB       NOT NULL DEFAULT '{}'::JSONB,
  available_colors JSONB      NOT NULL DEFAULT '[]'::JSONB,
  available_sizes JSONB       NOT NULL DEFAULT '[]'::JSONB,
  pickup_available BOOLEAN    NOT NULL DEFAULT TRUE,
  delivery_available BOOLEAN  NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS shop_products_church_id ON shop_products(church_id);
CREATE INDEX IF NOT EXISTS shop_products_category_id ON shop_products(category_id);
CREATE INDEX IF NOT EXISTS shop_products_published ON shop_products(church_id, is_published);

-- 8. Orders
CREATE TABLE IF NOT EXISTS shop_orders (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL,
  product_id         UUID        NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
  church_id          UUID        NOT NULL,
  amount             NUMERIC(10,2) NOT NULL,
  currency           TEXT        NOT NULL DEFAULT 'NGN',
  status             TEXT        NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','paid','failed','refunded')),
  flw_tx_ref         TEXT,
  flw_tx_id          TEXT,
  delivery_address   TEXT,
  buyer_name         TEXT,
  buyer_email        TEXT,
  quantity           INTEGER     NOT NULL DEFAULT 1,
  selected_color     TEXT,
  selected_size      TEXT,
  fulfillment_method TEXT        NOT NULL DEFAULT 'delivery',
  shipping_name      TEXT,
  shipping_phone     TEXT,
  shipping_address   TEXT,
  collection_code    TEXT,
  collection_qr      TEXT,
  invoice_number     TEXT,
  order_group_id     UUID,
  tracking_status    TEXT        NOT NULL DEFAULT 'order_received',
  tracking_number    TEXT,
  tracking_events    JSONB       NOT NULL DEFAULT '[]'::JSONB,
  paid_at            TIMESTAMPTZ,
  payment_group_ref  TEXT,
  stock_decremented  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS shop_orders
  ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS flw_tx_ref TEXT,
  ADD COLUMN IF NOT EXISTS flw_tx_id TEXT,
  ADD COLUMN IF NOT EXISTS delivery_address TEXT,
  ADD COLUMN IF NOT EXISTS buyer_name TEXT,
  ADD COLUMN IF NOT EXISTS buyer_email TEXT,
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS selected_color TEXT,
  ADD COLUMN IF NOT EXISTS selected_size TEXT,
  ADD COLUMN IF NOT EXISTS fulfillment_method TEXT NOT NULL DEFAULT 'delivery',
  ADD COLUMN IF NOT EXISTS shipping_name TEXT,
  ADD COLUMN IF NOT EXISTS shipping_phone TEXT,
  ADD COLUMN IF NOT EXISTS shipping_address TEXT,
  ADD COLUMN IF NOT EXISTS collection_code TEXT,
  ADD COLUMN IF NOT EXISTS collection_qr TEXT,
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS order_group_id UUID,
  ADD COLUMN IF NOT EXISTS tracking_status TEXT NOT NULL DEFAULT 'order_received',
  ADD COLUMN IF NOT EXISTS tracking_number TEXT,
  ADD COLUMN IF NOT EXISTS tracking_events JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_group_ref TEXT,
  ADD COLUMN IF NOT EXISTS stock_decremented BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS shop_orders_user_id ON shop_orders(user_id);
CREATE INDEX IF NOT EXISTS shop_orders_product_id ON shop_orders(product_id);
CREATE INDEX IF NOT EXISTS shop_orders_flw_tx_ref ON shop_orders(flw_tx_ref);
CREATE UNIQUE INDEX IF NOT EXISTS shop_orders_collection_code_idx ON shop_orders(collection_code) WHERE collection_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS shop_orders_group_idx ON shop_orders(order_group_id);
CREATE INDEX IF NOT EXISTS shop_orders_payment_group_idx ON shop_orders(payment_group_ref);

-- 9. Cart items
CREATE TABLE IF NOT EXISTS shop_cart_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id      UUID        NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
  quantity        INTEGER     NOT NULL DEFAULT 1 CHECK (quantity > 0),
  selected_color  TEXT,
  selected_size   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id, selected_color, selected_size)
);
CREATE INDEX IF NOT EXISTS shop_cart_user_idx ON shop_cart_items(user_id);

-- 10. Wishlists
CREATE TABLE IF NOT EXISTS shop_wishlists (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID        NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);
CREATE INDEX IF NOT EXISTS shop_wishlist_user_idx ON shop_wishlists(user_id);

-- 11. Seller profile columns on churches table
ALTER TABLE IF EXISTS churches
  ADD COLUMN IF NOT EXISTS seller_about TEXT,
  ADD COLUMN IF NOT EXISTS seller_address TEXT,
  ADD COLUMN IF NOT EXISTS seller_policies TEXT;
