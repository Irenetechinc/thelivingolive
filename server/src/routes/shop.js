/**
 * shop.js — Olive Shop API
 * Mounted at /api/shop in index.js (all routes require Supabase JWT via requireUser).
 *
 * Products are church-scoped: a user only sees products belonging to their
 * home church (church_members table).  Org admins manage products and
 * categories through the /org-admin routes in orgAdmin.js.
 */

import { Router } from 'express';
import multer from 'multer';
import { logger } from '../lib/logger.js';

const log    = logger('shop');
const router = Router();

// ── Storage ───────────────────────────────────────────────────────────────────
const SHOP_BUCKET = 'shop-assets';
const SHOP_FILE_LIMIT = 50 * 1024 * 1024; // 50 MB — Supabase free tier cap

let _shopBucketReady = false;
async function ensureShopBucket(supabase) {
  if (_shopBucketReady) return;
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (buckets?.some(b => b.name === SHOP_BUCKET)) { _shopBucketReady = true; return; }
    const { error } = await supabase.storage.createBucket(SHOP_BUCKET, {
      public: true,
      fileSizeLimit: SHOP_FILE_LIMIT,
      allowedMimeTypes: ['image/*', 'audio/*', 'application/pdf', 'application/epub+zip', 'application/octet-stream'],
    });
    if (!error || error.message?.toLowerCase().includes('already exists')) {
      _shopBucketReady = true;
      log.info('shop-assets bucket ready');
    } else {
      log.error('shop-assets bucket error:', error.message);
    }
  } catch (e) { log.error('ensureShopBucket threw:', e.message); }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getUserChurch(supabase, userId) {
  const { data } = await supabase
    .from('church_members')
    .select('church_id, churches(id, name, slug, logo_url)')
    .eq('user_id', userId)
    .maybeSingle();
  return data ?? null;
}

function flutterwaveKey() {
  const k = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!k) throw new Error('FLUTTERWAVE_SECRET_KEY is not configured');
  return k;
}

// ── GET /api/shop/my-church ───────────────────────────────────────────────────
router.get('/my-church', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const membership = await getUserChurch(supabase, req.user.id);
  res.json({ ok: true, membership });
});

// ── GET /api/shop/churches ────────────────────────────────────────────────────
// Let unaffiliated users browse all churches before selecting one
router.get('/churches', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { data, error } = await supabase
    .from('churches')
    .select('id, name, slug, logo_url, description')
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, churches: data ?? [] });
});

// ── GET /api/shop/categories ──────────────────────────────────────────────────
router.get('/categories', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const membership = await getUserChurch(supabase, req.user.id);
  if (!membership) return res.status(403).json({ error: 'No church membership found' });

  const { data, error } = await supabase
    .from('shop_categories')
    .select('*')
    .eq('church_id', membership.church_id)
    .order('sort_order')
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, categories: data ?? [] });
});

// ── GET /api/shop/products ────────────────────────────────────────────────────
// Query params: category_id (optional), page (0-based), limit (max 40)
router.get('/products', async (req, res) => {
  const supabase  = req.app.locals.supabaseAdmin;
  const membership = await getUserChurch(supabase, req.user.id);
  if (!membership) return res.status(403).json({ error: 'No church membership found' });

  const { category_id, page = '0', limit: lim = '40' } = req.query;
  const pageN  = Math.max(0, parseInt(page, 10) || 0);
  const limitN = Math.min(40, Math.max(1, parseInt(lim, 10) || 40));
  const from   = pageN * limitN;

  let q = supabase
    .from('shop_products')
    .select('id, church_id, category_id, title, description, price, currency, is_free, product_type, thumbnail_url, stock_count, shop_categories(name, icon, color)')
    .eq('church_id', membership.church_id)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .range(from, from + limitN - 1);

  if (category_id) q = q.eq('category_id', category_id);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  // Attach church name for display in the card
  const churchName = membership.churches?.name ?? '';
  const products   = (data ?? []).map(p => ({ ...p, churchName }));
  res.json({ ok: true, products, churchName });
});

// ── GET /api/shop/products/:id ────────────────────────────────────────────────
router.get('/products/:id', async (req, res) => {
  const supabase   = req.app.locals.supabaseAdmin;
  const membership = await getUserChurch(supabase, req.user.id);
  if (!membership) return res.status(403).json({ error: 'No church membership found' });

  const { data, error } = await supabase
    .from('shop_products')
    .select('*, shop_categories(name, icon, color)')
    .eq('id', req.params.id)
    .eq('church_id', membership.church_id)  // enforce church scope
    .eq('is_published', true)
    .maybeSingle();
  if (error || !data) return res.status(404).json({ error: 'Product not found' });
  res.json({ ok: true, product: { ...data, churchName: membership.churches?.name ?? '' } });
});

// ── GET /api/shop/my-orders ───────────────────────────────────────────────────
router.get('/my-orders', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { data, error } = await supabase
    .from('shop_orders')
    .select('*, shop_products(id, title, thumbnail_url, product_type, media_url)')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, orders: data ?? [] });
});

// ── POST /api/shop/orders/initiate ────────────────────────────────────────────
// Initiate a Flutterwave payment for a product.
// Body: { productId, buyerName, deliveryAddress? }
router.post('/orders/initiate', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { productId, buyerName, deliveryAddress } = req.body;
  if (!productId) return res.status(400).json({ error: 'productId is required' });

  const membership = await getUserChurch(supabase, req.user.id);
  if (!membership) return res.status(403).json({ error: 'No church membership found' });

  // Fetch product (church-scoped)
  const { data: product, error: pErr } = await supabase
    .from('shop_products')
    .select('id, title, price, currency, is_free, product_type, stock_count, church_id, is_published')
    .eq('id', productId)
    .eq('church_id', membership.church_id)
    .eq('is_published', true)
    .maybeSingle();
  if (pErr || !product) return res.status(404).json({ error: 'Product not found' });

  // Free product — create order immediately, no payment needed
  if (product.is_free || product.price <= 0) {
    const { data: order, error: oErr } = await supabase.from('shop_orders').insert({
      user_id: req.user.id,
      product_id: product.id,
      church_id: product.church_id,
      amount: 0,
      currency: product.currency,
      status: 'paid',
      buyer_name: buyerName?.trim() || req.user.email?.split('@')[0],
      buyer_email: req.user.email,
      delivery_address: deliveryAddress?.trim() || null,
    }).select().single();
    if (oErr) return res.status(500).json({ error: oErr.message });
    return res.json({ ok: true, free: true, orderId: order.id });
  }

  // Paid product — create pending order then initiate Flutterwave
  let key;
  try { key = flutterwaveKey(); }
  catch { return res.status(503).json({ error: 'Payment system not configured' }); }

  const txRef  = `shop_${req.user.id}_${product.id}_${Date.now()}`;
  const email  = req.user.email ?? 'buyer@livingolive.app';
  const name   = buyerName?.trim() || email.split('@')[0];
  const amount = parseFloat(product.price);

  const { data: order, error: oErr } = await supabase.from('shop_orders').insert({
    user_id: req.user.id,
    product_id: product.id,
    church_id: product.church_id,
    amount,
    currency: product.currency,
    status: 'pending',
    flw_tx_ref: txRef,
    buyer_name: name,
    buyer_email: email,
    delivery_address: deliveryAddress?.trim() || null,
  }).select().single();
  if (oErr) return res.status(500).json({ error: oErr.message });

  const flwRes = await fetch('https://api.flutterwave.com/v3/payments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tx_ref: txRef,
      amount,
      currency: product.currency,
      redirect_url: 'https://livingolive.adroomai.com/payment/success',
      customer: { email, name },
      customizations: {
        title: `Olive Shop — ${membership.churches?.name ?? 'Church'}`,
        description: product.title,
        logo: 'https://livingolive.adroomai.com/icon.png',
      },
      meta: { user_id: req.user.id, product_id: product.id, order_id: order.id },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!flwRes.ok) {
    const err = await flwRes.json().catch(() => ({}));
    return res.status(502).json({ error: err.message ?? 'Payment link creation failed' });
  }
  const flwData = await flwRes.json();
  const paymentLink = flwData.data?.link;
  if (!paymentLink) return res.status(502).json({ error: 'No payment link returned from provider' });

  log.info(`Shop order initiated: ${txRef} product=${product.id} amount=${amount}`);
  res.json({ ok: true, paymentLink, txRef, orderId: order.id });
});

// ── POST /api/shop/orders/verify ──────────────────────────────────────────────
// Body: { txRef } or { transactionId }
router.post('/orders/verify', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { txRef, transactionId } = req.body;
  if (!txRef && !transactionId) return res.status(400).json({ error: 'txRef or transactionId required' });

  let key;
  try { key = flutterwaveKey(); }
  catch { return res.status(503).json({ error: 'Payment system not configured' }); }

  let verifyId = transactionId;
  if (!verifyId) {
    const lookup = await fetch(
      `https://api.flutterwave.com/v3/transactions?tx_ref=${encodeURIComponent(txRef)}`,
      { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) }
    );
    const lookupData = await lookup.json().catch(() => ({}));
    verifyId = lookupData.data?.[0]?.id;
  }
  if (!verifyId) return res.status(400).json({ error: 'Transaction not found' });

  const vRes = await fetch(`https://api.flutterwave.com/v3/transactions/${verifyId}/verify`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10_000),
  });
  const vData = await vRes.json().catch(() => ({}));
  const tx    = vData.data;

  if (!tx || tx.status !== 'successful') {
    return res.status(400).json({ error: 'Payment not confirmed', status: tx?.status ?? 'unknown' });
  }

  // Update order to paid
  const { data: order, error: oErr } = await supabase
    .from('shop_orders')
    .update({ status: 'paid', flw_tx_id: String(verifyId) })
    .eq('flw_tx_ref', tx.tx_ref)
    .eq('user_id', req.user.id)
    .select('*, shop_products(title, product_type, media_url)')
    .maybeSingle();

  if (oErr) return res.status(500).json({ error: oErr.message });
  log.info(`Shop order paid: ${tx.tx_ref}`);
  res.json({ ok: true, order });
});

// ── GET /api/shop/download/:orderId ──────────────────────────────────────────
// Returns the media_url for a paid digital/media order (only for the buyer).
router.get('/download/:orderId', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { data: order, error } = await supabase
    .from('shop_orders')
    .select('status, shop_products(product_type, media_url, title)')
    .eq('id', req.params.orderId)
    .eq('user_id', req.user.id)
    .eq('status', 'paid')
    .maybeSingle();

  if (error || !order) return res.status(404).json({ error: 'Order not found or not paid' });
  const { product_type, media_url } = order.shop_products ?? {};
  if (!media_url || product_type === 'physical') {
    return res.status(400).json({ error: 'No downloadable file for this order' });
  }
  res.json({ ok: true, mediaUrl: media_url, title: order.shop_products?.title });
});

export { router as shopRouter };
