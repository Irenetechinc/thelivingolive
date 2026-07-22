/**
 * bulletins.js — Mobile-facing bulletin & donation API
 * Mounted at /api/bulletins and /api/donate in index.js.
 * All endpoints that read bulletin content require requireUser (Supabase JWT).
 * The church list endpoint is public so the picker can load without auth.
 */

import { Router } from 'express';
import { logger } from '../lib/logger.js';

const log = logger('bulletins');
const router = Router();

// Injected by index.js via router.use((req, _res, next) => { req.supabase = ...; next(); })
// We access it via req.app.locals.supabaseAdmin and req.user (set by requireUser).

// ── Helpers ────────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10); // "2025-01-19"
}

function flutterwaveSecret() {
  const key = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!key) throw new Error('FLUTTERWAVE_SECRET_KEY environment variable is not set');
  return key;
}

async function verifyFlwTransaction(txId) {
  const key = flutterwaveSecret();
  const res = await fetch(`https://api.flutterwave.com/v3/transactions/${txId}/verify`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Flutterwave verify returned ${res.status}`);
  return res.json();
}

// ── Public: list churches with active bulletins ────────────────────────────────
router.get('/churches', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  if (!supabase) return res.json({ churches: [] });

  const { data, error } = await supabase
    .from('churches')
    .select('id, name, slug, description, logo_url')
    .eq('active', true)
    .order('name');

  if (error) return res.status(500).json({ error: error.message });

  // Filter to only churches that have at least one published bulletin
  const { data: published } = await supabase
    .from('bulletins')
    .select('church_id')
    .eq('is_published', true)
    .gte('publish_at', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()); // active last 30d

  const activeIds = new Set((published ?? []).map((r) => r.church_id));
  const churches = (data ?? []).filter((c) => activeIds.has(c.id));

  res.json({ churches });
});

// ── Auth-required routes (requireUser middleware applied in index.js) ──────────

// Get the user's saved home church
router.get('/my-church', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { data, error } = await supabase
    .from('church_members')
    .select('church_id, confirmed_at, churches(id, name, slug, description, logo_url)')
    .eq('user_id', req.user.id)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ membership: data ?? null });
});

// Set/confirm user's home church
router.post('/my-church', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { churchId } = req.body;
  if (!churchId) return res.status(400).json({ error: 'churchId is required' });

  const { error } = await supabase.from('church_members').upsert(
    { user_id: req.user.id, church_id: churchId, confirmed_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
  if (error) return res.status(500).json({ error: error.message });
  log.info(`User ${req.user.id} joined church ${churchId}`);
  res.json({ ok: true });
});

// Clear home church (user answered "No, not my church")
router.delete('/my-church', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { error } = await supabase.from('church_members').delete().eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// Today's bulletin for a given church
router.get('/:churchId/today', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { churchId } = req.params;

  // Verify church exists
  const { data: church } = await supabase.from('churches').select('id, name, active').eq('id', churchId).maybeSingle();
  if (!church || !church.active) return res.status(404).json({ error: 'Church not found' });

  const todayStr = today();
  const { data: bulletins, error } = await supabase
    .from('bulletins')
    .select('id, title, content_preview, frequency, publish_at, expires_at, is_paid, price_ngn, is_published')
    .eq('church_id', churchId)
    .eq('is_published', true)
    .lte('publish_at', new Date().toISOString())
    .or(`expires_at.is.null,expires_at.gte.${todayStr}`)
    .order('publish_at', { ascending: false })
    .limit(1);

  if (error) return res.status(500).json({ error: error.message });

  if (!bulletins?.length) {
    return res.json({ bulletin: null, message: `No bulletin available for ${church.name} today.` });
  }

  const bulletin = bulletins[0];

  // Check access for paid bulletins
  if (bulletin.is_paid) {
    const { data: access } = await supabase
      .from('bulletin_access')
      .select('id')
      .eq('bulletin_id', bulletin.id)
      .eq('user_id', req.user.id)
      .eq('status', 'success')
      .maybeSingle();
    bulletin.hasAccess = !!access;
  } else {
    bulletin.hasAccess = true;
  }

  res.json({ bulletin, churchName: church.name });
});

// Archive: past published bulletins
router.get('/:churchId/archive', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { churchId } = req.params;
  const page = parseInt(req.query.page ?? '1', 10);
  const perPage = 20;

  const { data, error, count } = await supabase
    .from('bulletins')
    .select('id, title, content_preview, frequency, publish_at, is_paid, price_ngn, is_published', { count: 'exact' })
    .eq('church_id', churchId)
    .eq('is_published', true)
    .order('publish_at', { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ bulletins: data ?? [], total: count ?? 0, page });
});

// Single bulletin with full content (access-checked for paid ones)
router.get('/:churchId/:bulletinId', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { churchId, bulletinId } = req.params;

  const { data: bulletin, error } = await supabase
    .from('bulletins')
    .select('id, title, content, frequency, publish_at, expires_at, is_paid, price_ngn, is_published, churches(name)')
    .eq('id', bulletinId)
    .eq('church_id', churchId)
    .eq('is_published', true)
    .maybeSingle();

  if (error || !bulletin) return res.status(404).json({ error: 'Bulletin not found' });

  if (bulletin.is_paid) {
    const { data: access } = await supabase
      .from('bulletin_access')
      .select('id')
      .eq('bulletin_id', bulletinId)
      .eq('user_id', req.user.id)
      .eq('status', 'success')
      .maybeSingle();

    if (!access) {
      // Return metadata only, no content — let the client show the paywall
      const { content: _, ...meta } = bulletin;
      return res.json({ bulletin: { ...meta, content: null, requiresPayment: true } });
    }
  }

  res.json({ bulletin });
});

// Initiate Flutterwave payment for a paid bulletin
router.post('/:bulletinId/pay', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { bulletinId } = req.params;

  const { data: bulletin } = await supabase
    .from('bulletins')
    .select('id, title, is_paid, price_ngn, church_id, churches(name)')
    .eq('id', bulletinId)
    .eq('is_published', true)
    .maybeSingle();

  if (!bulletin) return res.status(404).json({ error: 'Bulletin not found' });
  if (!bulletin.is_paid) return res.status(400).json({ error: 'This bulletin is free' });

  const txRef = `bulletin_${bulletinId}_${req.user.id}_${Date.now()}`;
  const email = req.user.email ?? 'user@livingolive.app';
  const amount = bulletin.price_ngn;
  const title = `${bulletin.churches?.name} — ${bulletin.title}`;

  let key;
  try { key = flutterwaveSecret(); } catch (e) {
    return res.status(503).json({ error: 'Payment system is not configured. Contact support.' });
  }

  // Create Flutterwave payment link
  const flwRes = await fetch('https://api.flutterwave.com/v3/payments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tx_ref: txRef,
      amount,
      currency: 'NGN',
      redirect_url: 'https://livingolive.adroomai.com/payment/success',
      customer: { email, phonenumber: req.user.phone ?? '00000000000', name: req.user.email?.split('@')[0] ?? 'User' },
      customizations: { title: 'Living Olive Bulletin', description: title, logo: 'https://livingolive.adroomai.com/icon.png' },
      meta: { bulletin_id: bulletinId, user_id: req.user.id, church_id: bulletin.church_id },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!flwRes.ok) {
    const err = await flwRes.json().catch(() => ({}));
    return res.status(502).json({ error: err.message ?? 'Payment initiation failed' });
  }

  const flwData = await flwRes.json();
  const paymentLink = flwData.data?.link;
  if (!paymentLink) return res.status(502).json({ error: 'No payment link returned' });

  // Record pending access entry
  await supabase.from('bulletin_access').upsert(
    { bulletin_id: bulletinId, user_id: req.user.id, church_id: bulletin.church_id, flw_tx_ref: txRef, status: 'pending', amount_ngn: amount },
    { onConflict: 'bulletin_id,user_id' }
  );

  log.info(`Payment initiated: ${txRef} amount=${amount} bulletin=${bulletinId}`);
  res.json({ ok: true, paymentLink, txRef });
});

// Verify Flutterwave payment for a bulletin
router.post('/:bulletinId/verify-payment', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { bulletinId } = req.params;
  const { txRef, txId } = req.body;

  if (!txRef && !txId) return res.status(400).json({ error: 'txRef or txId is required' });

  try {
    // Verify via transaction ID or look up by ref
    let verifyId = txId;
    if (!verifyId && txRef) {
      const searchRes = await fetch(
        `https://api.flutterwave.com/v3/transactions?tx_ref=${encodeURIComponent(txRef)}`,
        { headers: { Authorization: `Bearer ${flutterwaveSecret()}` }, signal: AbortSignal.timeout(10_000) }
      );
      const searchData = await searchRes.json();
      verifyId = searchData.data?.[0]?.id;
    }

    if (!verifyId) return res.status(404).json({ error: 'Transaction not found' });

    const result = await verifyFlwTransaction(verifyId);
    const tx = result.data;

    if (tx.status !== 'successful') {
      return res.json({ ok: false, paid: false, status: tx.status });
    }

    // Grant access
    await supabase.from('bulletin_access').upsert(
      {
        bulletin_id: bulletinId,
        user_id: req.user.id,
        church_id: tx.meta?.church_id,
        flw_tx_ref: tx.tx_ref,
        flw_tx_id: String(tx.id),
        status: 'success',
        amount_ngn: tx.amount,
        paid_at: new Date().toISOString(),
      },
      { onConflict: 'bulletin_id,user_id' }
    );

    log.info(`Payment verified: ${tx.tx_ref} granted access to bulletin ${bulletinId} for user ${req.user.id}`);
    res.json({ ok: true, paid: true });
  } catch (e) {
    log.error('Payment verification error:', e.message);
    res.status(500).json({ error: 'Verification failed. Try again.' });
  }
});

// ── Church extras: announcements, order of service, social links ──────────────
// Gracefully handles new columns / tables not yet in the schema.
router.get('/:churchId/extras', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { churchId } = req.params;
  const extras = { announcements: [], orderOfService: [], social: {} };

  // Social links + order of service live on the churches row
  try {
    const { data } = await supabase
      .from('churches')
      .select('website, facebook_url, instagram_url, twitter_url, youtube_url, order_of_service')
      .eq('id', churchId)
      .maybeSingle();
    if (data) {
      extras.social = {
        website:   data.website   ?? null,
        facebook:  data.facebook_url  ?? null,
        instagram: data.instagram_url ?? null,
        twitter:   data.twitter_url   ?? null,
        youtube:   data.youtube_url   ?? null,
      };
      if (Array.isArray(data.order_of_service)) extras.orderOfService = data.order_of_service;
    }
  } catch (e) {
    log.warn('extras: social/oos query failed (columns may not exist yet):', e.message);
  }

  // Announcements live in a separate table
  try {
    const { data } = await supabase
      .from('church_announcements')
      .select('id, text, type, created_at')
      .eq('church_id', churchId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(10);
    extras.announcements = data ?? [];
  } catch (e) {
    log.warn('extras: church_announcements query failed (table may not exist yet):', e.message);
  }

  res.json(extras);
});

export { router as bulletinsRouter };
