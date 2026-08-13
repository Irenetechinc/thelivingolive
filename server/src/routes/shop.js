/**
 * shop.js — Olive Shop API
 * Mounted at /api/shop in index.js (all routes require Supabase JWT via requireUser).
 *
 * Products are church-scoped: a user only sees products belonging to their
 * home church (church_members table).  Org admins manage products and
 * categories through the /org-admin routes in orgAdmin.js.
 */

import { Router } from 'express';
import crypto from 'node:crypto';
import { logger } from '../lib/logger.js';
import { sendInvoiceMail } from '../lib/mailer.js';
import QRCode from 'qrcode';
import { ensurePublicBucket } from '../lib/storage.js';

const log    = logger('shop');
const router = Router();

// ── Storage ───────────────────────────────────────────────────────────────────
const SHOP_BUCKET = 'shop-assets';
async function ensureShopBucket(supabase) {
  await ensurePublicBucket(supabase, SHOP_BUCKET, {
    allowedMimeTypes: ['image/*', 'video/*', 'audio/*', 'application/pdf', 'application/epub+zip', 'application/octet-stream'],
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getUserChurch(supabase, userId) {
  const { data } = await supabase
    .from('church_members')
    .select('church_id, churches(id, name, slug, logo_url, description, email, phone, website, seller_about, seller_address, seller_policies)')
    .eq('user_id', userId)
    .maybeSingle();
  return data ?? null;
}

function jsonArray(value) {
  return Array.isArray(value) ? value : [];
}

function jsonObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function makeInvoiceNumber() {
  return `LO-${new Date().getUTCFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function makeCollectionCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function trackingEvent(status, note) {
  return [{ status, note, at: new Date().toISOString() }];
}

function productPayload(product, churchName, seller = null) {
  return {
    ...product,
    image_urls: jsonArray(product.image_urls),
    specifications: jsonObject(product.specifications),
    available_colors: jsonArray(product.available_colors),
    available_sizes: jsonArray(product.available_sizes),
    churchName,
    seller,
  };
}

async function decrementStockForOrder(supabase, orderId) {
  const { data: order } = await supabase.from('shop_orders')
    .select('id, product_id, quantity, stock_decremented, shop_products(stock_count, product_type)')
    .eq('id', orderId).maybeSingle();
  if (!order || order.stock_decremented || order.shop_products?.product_type !== 'physical') return;
  if (order.shop_products.stock_count !== null && order.shop_products.stock_count !== undefined) {
    const nextStock = Math.max(0, Number(order.shop_products.stock_count) - Math.max(1, Number(order.quantity) || 1));
    await supabase.from('shop_products').update({ stock_count: nextStock }).eq('id', order.product_id);
  }
  await supabase.from('shop_orders').update({ stock_decremented: true }).eq('id', order.id);
}

async function getChurchForBrowse(supabase, req) {
  const churchId = typeof req.query.church_id === 'string' ? req.query.church_id : null;
  if (!churchId) return getUserChurch(supabase, req.user.id);
  const { data } = await supabase
    .from('churches')
    .select('id, name, slug, logo_url, description, email, phone, website, seller_about, seller_address, seller_policies')
    .eq('id', churchId)
    .maybeSingle();
  return data ? { church_id: data.id, churches: data } : null;
}

async function getMemberChurch(supabase, userId) {
  return getUserChurch(supabase, userId);
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
  const membership = await getChurchForBrowse(supabase, req);
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
  const membership = await getChurchForBrowse(supabase, req);
  if (!membership) return res.status(403).json({ error: 'No church membership found' });

  const { category_id, page = '0', limit: lim = '40' } = req.query;
  const pageN  = Math.max(0, parseInt(page, 10) || 0);
  const limitN = Math.min(40, Math.max(1, parseInt(lim, 10) || 40));
  const from   = pageN * limitN;

  let q = supabase
    .from('shop_products')
    .select('id, church_id, category_id, title, description, price, currency, is_free, product_type, thumbnail_url, stock_count, image_urls, condition, shipping_cost, return_policy, estimated_delivery, import_fee_info, specifications, available_colors, available_sizes, pickup_available, delivery_available, shop_categories(name, icon, color)')
    .eq('church_id', membership.church_id)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .range(from, from + limitN - 1);

  if (category_id) q = q.eq('category_id', category_id);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  // Attach church name for display in the card
  const churchName = membership.churches?.name ?? '';
  const products   = (data ?? []).map(p => productPayload(p, churchName));
  res.json({ ok: true, products, churchName });
});

// ── GET /api/shop/products/:id ────────────────────────────────────────────────
router.get('/products/:id', async (req, res) => {
  const supabase   = req.app.locals.supabaseAdmin;
  const membership = await getChurchForBrowse(supabase, req);
  if (!membership) return res.status(403).json({ error: 'No church membership found' });

  const { data, error } = await supabase
    .from('shop_products')
    .select('*, shop_categories(name, icon, color)')
    .eq('id', req.params.id)
    .eq('church_id', membership.church_id)  // enforce church scope
    .eq('is_published', true)
    .maybeSingle();
  if (error || !data) return res.status(404).json({ error: 'Product not found' });

  const seller = membership.churches
    ? {
        id: membership.churches.id,
        name: membership.churches.name,
        description: membership.churches.description ?? null,
        about: membership.churches.seller_about ?? membership.churches.description ?? null,
        address: membership.churches.seller_address ?? null,
        policies: membership.churches.seller_policies ?? null,
        email: membership.churches.email ?? null,
        phone: membership.churches.phone ?? null,
        website: membership.churches.website ?? null,
        logoUrl: membership.churches.logo_url ?? null,
      }
    : null;
  const { data: related } = data.category_id
    ? await supabase.from('shop_products')
         .select('id, church_id, category_id, title, description, price, currency, is_free, product_type, thumbnail_url, stock_count, image_urls, condition, shipping_cost, return_policy, estimated_delivery, import_fee_info, specifications, available_colors, available_sizes, pickup_available, delivery_available, shop_categories(name, icon, color)')
        .eq('church_id', membership.church_id)
        .eq('category_id', data.category_id)
        .eq('is_published', true)
        .neq('id', data.id)
        .order('created_at', { ascending: false })
        .limit(8)
    : { data: [] };
  res.json({
    ok: true,
    product: productPayload(data, membership.churches?.name ?? '', seller),
    relatedProducts: (related ?? []).map(p => productPayload(p, membership.churches?.name ?? '')),
  });
});

// ── Persistent cart and wishlist ─────────────────────────────────────────────
router.get('/cart', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { data, error } = await supabase.from('shop_cart_items')
    .select('id, product_id, quantity, selected_color, selected_size, shop_products(id, church_id, title, price, currency, is_free, product_type, thumbnail_url, stock_count, image_urls, is_published)')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, items: data ?? [] });
});

router.post('/cart', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { productId, quantity = 1, selectedColor = null, selectedSize = null } = req.body;
  const qty = Math.max(1, Math.min(99, parseInt(quantity, 10) || 1));
  if (!productId) return res.status(400).json({ error: 'productId is required' });
  const membership = await getMemberChurch(supabase, req.user.id);
  const { data: product } = await supabase.from('shop_products')
    .select('id, church_id, stock_count, is_published, product_type, available_colors, available_sizes').eq('id', productId).maybeSingle();
  if (!product?.is_published) return res.status(404).json({ error: 'Product not found' });
  if (!membership || membership.church_id !== product.church_id) {
    return res.status(403).json({ error: 'You must be a member of this church to use its shop' });
  }
  if (product.product_type !== 'physical') return res.status(400).json({ error: 'Only physical products can be added to the cart' });
  if (selectedColor && !jsonArray(product.available_colors).includes(selectedColor)) {
    return res.status(400).json({ error: 'That color is not available' });
  }
  if (selectedSize && !jsonArray(product.available_sizes).includes(selectedSize)) {
    return res.status(400).json({ error: 'That size is not available' });
  }
  if (product.stock_count !== null && qty > product.stock_count) {
    return res.status(409).json({ error: `Only ${product.stock_count} item(s) are available` });
  }
  const { data, error } = await supabase.from('shop_cart_items').upsert({
    user_id: req.user.id, product_id: productId, quantity: qty,
    selected_color: selectedColor || null, selected_size: selectedSize || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,product_id,selected_color,selected_size' }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, item: data });
});

router.put('/cart/:id', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const qty = Math.max(1, Math.min(99, parseInt(req.body.quantity, 10) || 1));
  const { data: existing } = await supabase.from('shop_cart_items')
    .select('product_id, shop_products(stock_count, is_published)').eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle();
  if (!existing || !existing.shop_products?.is_published) return res.status(404).json({ error: 'Cart item not found' });
  if (existing.shop_products.stock_count !== null && qty > existing.shop_products.stock_count) {
    return res.status(409).json({ error: `Only ${existing.shop_products.stock_count} item(s) are available` });
  }
  const { data, error } = await supabase.from('shop_cart_items')
    .update({ quantity: qty, updated_at: new Date().toISOString() })
    .eq('id', req.params.id).eq('user_id', req.user.id).select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Cart item not found' });
  res.json({ ok: true, item: data });
});

router.delete('/cart/:id', async (req, res) => {
  const { error } = await req.app.locals.supabaseAdmin.from('shop_cart_items')
    .delete().eq('id', req.params.id).eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

router.get('/wishlist', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const membership = await getMemberChurch(supabase, req.user.id);
  const { data, error } = await supabase.from('shop_wishlists')
    .select('id, product_id, created_at, shop_products(id, church_id, category_id, title, description, price, currency, is_free, product_type, thumbnail_url, stock_count, image_urls, condition, shipping_cost, estimated_delivery, available_colors, available_sizes, is_published, shop_categories(name, icon, color))')
    .eq('user_id', req.user.id).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  const items = (data ?? []).filter(item =>
    item.shop_products?.is_published && membership?.church_id === item.shop_products?.church_id
  );
  res.json({ ok: true, items });
});

router.post('/wishlist/:productId', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const membership = await getMemberChurch(supabase, req.user.id);
  const { data: product } = await supabase.from('shop_products').select('id, church_id').eq('id', req.params.productId).eq('is_published', true).maybeSingle();
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (!membership || membership.church_id !== product.church_id) return res.status(403).json({ error: 'You must be a member of this church to save its products' });
  const { data, error } = await supabase.from('shop_wishlists')
    .upsert({ user_id: req.user.id, product_id: req.params.productId }, { onConflict: 'user_id,product_id' })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, item: data });
});

router.delete('/wishlist/:productId', async (req, res) => {
  const { error } = await req.app.locals.supabaseAdmin.from('shop_wishlists')
    .delete().eq('user_id', req.user.id).eq('product_id', req.params.productId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── GET /api/shop/my-orders ───────────────────────────────────────────────────
router.get('/my-orders', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { data, error } = await supabase
    .from('shop_orders')
    .select('*, shop_products(id, title, thumbnail_url, product_type, media_url, image_urls)')
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
  const {
    productId, buyerName, deliveryAddress, shippingName, shippingPhone,
    fulfillmentMethod = 'delivery', quantity = 1, selectedColor = null, selectedSize = null,
  } = req.body;
  if (!productId) return res.status(400).json({ error: 'productId is required' });
  if (!['pickup', 'delivery'].includes(fulfillmentMethod)) return res.status(400).json({ error: 'Choose pickup or delivery' });
  const qty = Math.max(1, Math.min(99, parseInt(quantity, 10) || 1));

  // Browsing a selected church is public to signed-in users, but purchasing
  // remains restricted to members of that church.
  const membership = await getMemberChurch(supabase, req.user.id);
  if (!membership) return res.status(403).json({ error: 'No church membership found' });

  // Fetch product (church-scoped)
  const { data: product, error: pErr } = await supabase
    .from('shop_products')
    .select('id, title, price, currency, is_free, product_type, stock_count, church_id, is_published, shipping_cost, pickup_available, delivery_available, available_colors, available_sizes')
    .eq('id', productId)
    .eq('church_id', membership.church_id)
    .eq('is_published', true)
    .maybeSingle();
  if (pErr || !product) return res.status(404).json({ error: 'Product not found' });
  if (fulfillmentMethod === 'pickup' && product.pickup_available === false) return res.status(400).json({ error: 'Pickup is not available for this product' });
  if (fulfillmentMethod === 'delivery' && product.delivery_available === false) return res.status(400).json({ error: 'Delivery is not available for this product' });
  if (fulfillmentMethod === 'delivery' && !deliveryAddress?.trim()) return res.status(400).json({ error: 'Delivery address is required' });
  if (product.stock_count !== null && qty > product.stock_count) return res.status(409).json({ error: `Only ${product.stock_count} item(s) are available` });
  if (selectedColor && !jsonArray(product.available_colors).includes(selectedColor)) return res.status(400).json({ error: 'That color is not available' });
  if (selectedSize && !jsonArray(product.available_sizes).includes(selectedSize)) return res.status(400).json({ error: 'That size is not available' });
  const itemAmount = product.is_free ? 0 : Number(product.price) * qty;
  const shippingAmount = fulfillmentMethod === 'delivery' ? Number(product.shipping_cost ?? 0) : 0;
  const amount = itemAmount + shippingAmount;
  const invoiceNumber = makeInvoiceNumber();
  const commonOrder = {
    user_id: req.user.id, product_id: product.id, church_id: product.church_id,
    amount, currency: product.currency, quantity: qty, selected_color: selectedColor || null,
    selected_size: selectedSize || null, fulfillment_method: fulfillmentMethod,
    buyer_name: buyerName?.trim() || req.user.email?.split('@')[0], buyer_email: req.user.email,
    shipping_name: shippingName?.trim() || buyerName?.trim() || null,
    shipping_phone: shippingPhone?.trim() || null, shipping_address: deliveryAddress?.trim() || null,
    delivery_address: deliveryAddress?.trim() || null, invoice_number: invoiceNumber,
    tracking_status: fulfillmentMethod === 'pickup' ? 'ready_for_collection' : 'order_received',
    tracking_events: trackingEvent(fulfillmentMethod === 'pickup' ? 'ready_for_collection' : 'order_received', 'Order received'),
  };

  // Free product — create order immediately, no payment needed
  if (product.is_free || product.price <= 0) {
    const code = makeCollectionCode();
    const paidFields = fulfillmentMethod === 'pickup'
      ? { status: 'paid', paid_at: new Date().toISOString(), collection_code: code, collection_qr: `https://livingolive.adroomai.com/org-admin/shop/verify?code=${code}` }
      : { status: 'paid', paid_at: new Date().toISOString() };
    const { data: order, error: oErr } = await supabase.from('shop_orders').insert({ ...commonOrder, ...paidFields }).select().single();
    if (oErr) return res.status(500).json({ error: oErr.message });
    await decrementStockForOrder(supabase, order.id);
    // Generate QR image for collection_qr if not present and send invoice email
    try {
      if (order.collection_qr) {
        // attempt to create a data URL QR and store it in the order record as collection_qr if needed
        const qrDataUrl = await QRCode.toDataURL(order.collection_qr);
        await supabase.from('shop_orders').update({ collection_qr: qrDataUrl }).eq('id', order.id);
      }
      // send invoice email
      const html = `<p>Thank you for your order</p><p>Invoice: <strong>${order.invoice_number}</strong></p>` +
        (order.collection_code ? `<p>Collection code: <strong>${order.collection_code}</strong></p>` : '');
      await sendInvoiceMail(order.buyer_email, `Your Olive Shop Invoice ${order.invoice_number}`, html);
    } catch (e) { log.info('Invoice email/QR generation failed', e.message ?? e); }
    return res.json({ ok: true, free: true, orderId: order.id, invoiceNumber, collectionCode: order.collection_code });
  }

  // Paid product — create pending order then initiate Flutterwave
  let key;
  try { key = flutterwaveKey(); }
  catch { return res.status(503).json({ error: 'Payment system not configured' }); }

  const txRef  = `shop_${req.user.id}_${product.id}_${Date.now()}`;
  const email  = req.user.email ?? 'buyer@livingolive.app';
  const name   = buyerName?.trim() || email.split('@')[0];
  const { data: order, error: oErr } = await supabase.from('shop_orders').insert({
    ...commonOrder, amount, status: 'pending', flw_tx_ref: txRef, buyer_name: name, buyer_email: email,
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
       meta: { user_id: req.user.id, product_id: product.id, order_id: order.id, fulfillment_method: fulfillmentMethod },
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
   res.json({ ok: true, paymentLink, txRef, orderId: order.id, invoiceNumber });
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
  const { data: existingOrder } = await supabase.from('shop_orders')
    .select('id, fulfillment_method, collection_code, collection_qr, payment_group_ref')
    .or(`flw_tx_ref.eq.${txRef ?? ''},payment_group_ref.eq.${txRef ?? ''}`)
    .eq('user_id', req.user.id).limit(1).maybeSingle();
    const paidFields = {
    status: 'paid', flw_tx_id: String(verifyId), paid_at: new Date().toISOString(),
    ...(existingOrder?.fulfillment_method === 'pickup' && !existingOrder.collection_code
      ? (function(){ const c = makeCollectionCode(); return { collection_code: c, collection_qr: `https://livingolive.adroomai.com/org-admin/shop/verify?code=${c}` }; })()
      : {}),
  };
  const groupRef = existingOrder?.payment_group_ref;
  const orderQuery = supabase
    .from('shop_orders')
    .update(paidFields)
    .eq('user_id', req.user.id);
  if (groupRef) orderQuery.eq('payment_group_ref', groupRef);
  else orderQuery.eq('flw_tx_ref', tx.tx_ref);
  const { data: order, error: oErr } = await orderQuery
    .select('*, shop_products(title, product_type, media_url, image_urls)')
    .maybeSingle();

  if (oErr) return res.status(500).json({ error: oErr.message });
  if (groupRef) {
    const { data: groupOrders } = await supabase.from('shop_orders')
      .select('id').eq('user_id', req.user.id).eq('payment_group_ref', groupRef);
    for (const groupOrder of groupOrders ?? []) await decrementStockForOrder(supabase, groupOrder.id);
  } else if (order?.id) {
    await decrementStockForOrder(supabase, order.id);
  }
  // Generate QR data URL for collection_qr and send invoice email for the paid order
  try {
    if (order?.collection_qr) {
      const qrDataUrl = await QRCode.toDataURL(order.collection_qr);
      await supabase.from('shop_orders').update({ collection_qr: qrDataUrl }).eq('id', order.id);
    }
    const html = `<p>Payment received — thank you!</p><p>Invoice: <strong>${order?.invoice_number}</strong></p>` +
      (order?.collection_code ? `<p>Collection code: <strong>${order.collection_code}</strong></p>` : '');
    await sendInvoiceMail(order?.buyer_email, `Your Olive Shop Invoice ${order?.invoice_number}`, html);
  } catch (e) { log.info('Invoice email/QR generation failed', e.message ?? e); }
  log.info(`Shop order paid: ${tx.tx_ref}`);
  res.json({ ok: true, order });
});

// ── POST /api/shop/orders/cart — one payment for all physical cart lines ─────
router.post('/orders/cart', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { buyerName, deliveryAddress, shippingName, shippingPhone, fulfillmentMethod = 'delivery' } = req.body;
  if (!['pickup', 'delivery'].includes(fulfillmentMethod)) return res.status(400).json({ error: 'Choose pickup or delivery' });
  const membership = await getMemberChurch(supabase, req.user.id);
  if (!membership) return res.status(403).json({ error: 'No church membership found' });
  if (fulfillmentMethod === 'delivery' && !deliveryAddress?.trim()) return res.status(400).json({ error: 'Delivery address is required' });

  const { data: cart, error: cartError } = await supabase.from('shop_cart_items')
    .select('id, product_id, quantity, selected_color, selected_size, shop_products(*)')
    .eq('user_id', req.user.id);
  if (cartError) return res.status(500).json({ error: cartError.message });
  if (!cart?.length) return res.status(400).json({ error: 'Your cart is empty' });
  for (const item of cart) {
    const product = item.shop_products;
    if (!product?.is_published || product.church_id !== membership.church_id || product.product_type !== 'physical') {
      return res.status(400).json({ error: 'Your cart contains an unavailable product' });
    }
    if (product.stock_count !== null && item.quantity > product.stock_count) {
      return res.status(409).json({ error: `Only ${product.stock_count} item(s) are available for ${product.title}` });
    }
    if (fulfillmentMethod === 'pickup' && product.pickup_available === false) return res.status(400).json({ error: `Pickup is unavailable for ${product.title}` });
    if (fulfillmentMethod === 'delivery' && product.delivery_available === false) return res.status(400).json({ error: `Delivery is unavailable for ${product.title}` });
  }

  const groupRef = `shop_cart_${req.user.id}_${Date.now()}`;
  const currency = cart[0].shop_products.currency || 'NGN';
  const amount = cart.reduce((total, item) => total
    + Number(item.shop_products.price || 0) * item.quantity
    + (fulfillmentMethod === 'delivery' ? Number(item.shop_products.shipping_cost || 0) : 0), 0);
  const invoiceNumber = makeInvoiceNumber();
  const buyer = buyerName?.trim() || req.user.email?.split('@')[0];
  const rows = cart.map((item, index) => ({
    user_id: req.user.id, product_id: item.product_id, church_id: membership.church_id,
    amount: Number(item.shop_products.price || 0) * item.quantity
      + (fulfillmentMethod === 'delivery' ? Number(item.shop_products.shipping_cost || 0) : 0),
    currency, status: 'pending', flw_tx_ref: `${groupRef}_${index}`, payment_group_ref: groupRef,
    quantity: item.quantity, selected_color: item.selected_color, selected_size: item.selected_size,
    fulfillment_method: fulfillmentMethod, buyer_name: buyer, buyer_email: req.user.email,
    shipping_name: shippingName?.trim() || buyer, shipping_phone: shippingPhone?.trim() || null,
    shipping_address: deliveryAddress?.trim() || null, delivery_address: deliveryAddress?.trim() || null,
    invoice_number: invoiceNumber, tracking_status: 'order_received',
    tracking_events: trackingEvent('order_received', 'Cart order received'),
  }));
  const { data: orders, error: orderError } = await supabase.from('shop_orders').insert(rows).select();
  if (orderError) return res.status(500).json({ error: orderError.message });

  let key;
  try { key = flutterwaveKey(); } catch {
    await supabase.from('shop_orders').delete().eq('payment_group_ref', groupRef).eq('user_id', req.user.id);
    return res.status(503).json({ error: 'Payment system not configured' });
  }
  const email = req.user.email ?? 'buyer@livingolive.app';
  const paymentResponse = await fetch('https://api.flutterwave.com/v3/payments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tx_ref: groupRef, amount, currency,
      redirect_url: 'https://livingolive.adroomai.com/payment/success',
      customer: { email, name: buyer },
      customizations: { title: `Olive Shop — ${membership.churches?.name ?? 'Church'}`, description: `${cart.length} item cart` },
      meta: { user_id: req.user.id, order_group_id: groupRef },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!paymentResponse.ok) return res.status(502).json({ error: 'Payment link creation failed' });
  const paymentData = await paymentResponse.json().catch(() => ({}));
  if (!paymentData.data?.link) return res.status(502).json({ error: 'No payment link returned from provider' });
  res.json({ ok: true, paymentLink: paymentData.data.link, txRef: groupRef, orderId: orders?.[0]?.id, invoiceNumber });
});

router.get('/orders/:orderId', async (req, res) => {
  const { data, error } = await req.app.locals.supabaseAdmin.from('shop_orders')
    .select('*, shop_products(id, title, thumbnail_url, product_type, media_url, image_urls)')
    .eq('id', req.params.orderId).eq('user_id', req.user.id).maybeSingle();
  if (error || !data) return res.status(404).json({ error: 'Order not found' });
  res.json({ ok: true, order: data });
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
