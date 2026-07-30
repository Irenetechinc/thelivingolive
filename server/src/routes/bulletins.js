/**
 * bulletins.js — Mobile-facing bulletin & donation API
 * Mounted at /api/bulletins and /api/donate in index.js.
 * All endpoints that read bulletin content require requireUser (Supabase JWT).
 * The church list endpoint is public so the picker can load without auth.
 */

import { Router } from 'express';
import { logger } from '../lib/logger.js';
import { ensureUserInChurchGeneralRoom } from './community.js';

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

  if (error) { log.error('churches fetch error:', error.message); return res.status(500).json({ error: 'Something went wrong. Please try again.' }); }

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

  if (error) { log.error('my-church fetch error:', error.message); return res.status(500).json({ error: 'Something went wrong. Please try again.' }); }
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
  if (error) { log.error('set-church error:', error.message); return res.status(500).json({ error: 'Something went wrong. Please try again.' }); }
  log.info(`User ${req.user.id} joined church ${churchId}`);

  // Auto-add user to their new church's General group chat room.
  // Uses the internal helper — derives churchId from authoritative DB state, no
  // HTTP self-call, no client-supplied data trusted for authorization.
  ensureUserInChurchGeneralRoom(req.app.locals.supabaseAdmin, req.user.id)
    .catch(e => log.warn('ensureUserInChurchGeneralRoom failed:', e.message));

  res.json({ ok: true });
});

// Clear home church (user answered "No, not my church")
router.delete('/my-church', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { error } = await supabase.from('church_members').delete().eq('user_id', req.user.id);
  if (error) { log.error('clear-church error:', error.message); return res.status(500).json({ error: 'Something went wrong. Please try again.' }); }
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

  if (error) { log.error('today-bulletin fetch error:', error.message); return res.status(500).json({ error: 'Something went wrong. Please try again.' }); }

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

  if (error) { log.error('bulletin-archive fetch error:', error.message); return res.status(500).json({ error: 'Something went wrong. Please try again.' }); }
  res.json({ bulletins: data ?? [], total: count ?? 0, page });
});

// ── Church extras: announcements, order of service, social links ──────────────
// IMPORTANT: This route MUST stay before /:churchId/:bulletinId to prevent
// Express matching "extras" as a bulletinId wildcard.
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

// Active ads for a church's bulletin screen (excludes churches that opted out)
router.get('/:churchId/ads', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { churchId } = req.params;

  try {
    // Check if this church is excluded from ads
    const { data: church } = await supabase
      .from('churches')
      .select('ads_excluded')
      .eq('id', churchId)
      .maybeSingle();
    if (church?.ads_excluded) return res.json({ ads: [] });

    const { data } = await supabase
      .from('church_ads')
      .select('id, title, image_url, link_url, church_id, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(5);
    res.json({ ads: data ?? [] });
  } catch (e) {
    log.warn('ads: query failed (table may not exist yet):', e.message);
    res.json({ ads: [] });
  }
});

// ── Social: likes, comments ────────────────────────────────────────────────────

// GET social summary for a bulletin (like count, user's like, comment count)
router.get('/:bulletinId/social', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { bulletinId } = req.params;

  try {
    const [likesRes, commentRes, userLikeRes] = await Promise.allSettled([
      supabase.from('bulletin_likes').select('*', { count: 'exact', head: true }).eq('bulletin_id', bulletinId),
      supabase.from('bulletin_comments').select('*', { count: 'exact', head: true }).eq('bulletin_id', bulletinId).is('parent_id', null),
      supabase.from('bulletin_likes').select('bulletin_id').eq('bulletin_id', bulletinId).eq('user_id', req.user.id).maybeSingle(),
    ]);

    res.json({
      likes: likesRes.value?.count ?? 0,
      comments: commentRes.value?.count ?? 0,
      liked: !!(userLikeRes.value?.data),
    });
  } catch (e) {
    res.json({ likes: 0, comments: 0, liked: false });
  }
});

// POST toggle like on a bulletin
router.post('/:bulletinId/like', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { bulletinId } = req.params;

  // Verify bulletin exists and is published
  const { data: bulletin } = await supabase.from('bulletins').select('id').eq('id', bulletinId).eq('is_published', true).maybeSingle();
  if (!bulletin) return res.status(404).json({ error: 'Bulletin not found' });

  const { data: existing } = await supabase.from('bulletin_likes')
    .select('bulletin_id').eq('bulletin_id', bulletinId).eq('user_id', req.user.id).maybeSingle();

  if (existing) {
    await supabase.from('bulletin_likes').delete().eq('bulletin_id', bulletinId).eq('user_id', req.user.id);
  } else {
    await supabase.from('bulletin_likes').insert({ bulletin_id: bulletinId, user_id: req.user.id });
  }

  const { count } = await supabase.from('bulletin_likes').select('*', { count: 'exact', head: true }).eq('bulletin_id', bulletinId);
  res.json({ ok: true, liked: !existing, likes: count ?? 0 });
});

// ── Shared helper: resolve display names for a set of user IDs ────────────────
// Uses the service-role admin API so it works server-side without a profiles table.
// Falls back to a short anonymous handle if the user cannot be resolved.
async function resolveUserNames(supabase, userIds) {
  const map = {};
  await Promise.all([...new Set(userIds)].map(async (uid) => {
    try {
      const { data: { user }, error } = await supabase.auth.admin.getUserById(uid);
      if (error || !user) throw error ?? new Error('not found');
      // Prefer: full_name metadata → display_name metadata → email prefix
      const meta = user.user_metadata ?? {};
      const name =
        meta.full_name?.trim() ||
        meta.name?.trim() ||
        meta.display_name?.trim() ||
        user.email?.split('@')[0] ||
        `@user_${uid.slice(0, 6)}`;
      map[uid] = name;
    } catch {
      map[uid] = `@user_${uid.slice(0, 6)}`;
    }
  }));
  return map;
}

// GET comments for a bulletin (top-level + replies nested)
router.get('/:bulletinId/comments', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { bulletinId } = req.params;

  try {
    // Top-level comments
    const { data: topComments, error } = await supabase
      .from('bulletin_comments')
      .select('id, user_id, body, like_count, created_at')
      .eq('bulletin_id', bulletinId)
      .is('parent_id', null)
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) return res.json({ comments: [] });

    const commentIds = (topComments ?? []).map(c => c.id);

    // Replies and comment likes for current user (in parallel)
    const [repliesRes, userLikesRes] = await Promise.allSettled([
      commentIds.length
        ? supabase.from('bulletin_comments').select('id, parent_id, user_id, body, like_count, created_at')
            .eq('bulletin_id', bulletinId).in('parent_id', commentIds).order('created_at', { ascending: true })
        : Promise.resolve({ data: [] }),
      supabase.from('bulletin_comment_likes').select('comment_id').eq('user_id', req.user.id),
    ]);

    const replies = repliesRes.value?.data ?? [];
    const userLikedCommentIds = new Set((userLikesRes.value?.data ?? []).map(r => r.comment_id));

    // Resolve real display names for every unique commenter
    const allRows = [...(topComments ?? []), ...replies];
    const nameMap = await resolveUserNames(supabase, allRows.map(c => c.user_id));

    function formatComment(c) {
      return {
        id: c.id,
        userId: c.user_id,
        handle: nameMap[c.user_id] ?? `@user_${c.user_id.slice(0, 6)}`,
        body: c.body,
        likeCount: c.like_count ?? 0,
        liked: userLikedCommentIds.has(c.id),
        createdAt: c.created_at,
        replies: [],
      };
    }

    const commentMap = {};
    const result = [];
    for (const c of (topComments ?? [])) {
      const formatted = formatComment(c);
      commentMap[c.id] = formatted;
      result.push(formatted);
    }
    for (const r of replies) {
      const parent = commentMap[r.parent_id];
      if (parent) parent.replies.push(formatComment(r));
    }

    res.json({ comments: result });
  } catch (e) {
    log.warn('comments fetch error:', e.message);
    res.json({ comments: [] });
  }
});

// POST add a comment (or reply)
router.post('/:bulletinId/comments', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { bulletinId } = req.params;
  const { body, parentId } = req.body;

  if (!body?.trim()) return res.status(400).json({ error: 'Comment body is required' });
  if (body.trim().length > 1000) return res.status(400).json({ error: 'Comment is too long (max 1000 chars)' });

  const { data: bulletin } = await supabase.from('bulletins').select('id').eq('id', bulletinId).eq('is_published', true).maybeSingle();
  if (!bulletin) return res.status(404).json({ error: 'Bulletin not found' });

  // Validate parent comment belongs to this bulletin
  if (parentId) {
    const { data: parent } = await supabase.from('bulletin_comments').select('id').eq('id', parentId).eq('bulletin_id', bulletinId).maybeSingle();
    if (!parent) return res.status(400).json({ error: 'Parent comment not found' });
  }

  const { data, error } = await supabase.from('bulletin_comments').insert({
    bulletin_id: bulletinId,
    user_id: req.user.id,
    parent_id: parentId ?? null,
    body: body.trim(),
  }).select('id, user_id, body, like_count, created_at').single();

  if (error) { log.error('post-comment insert error:', error.message); return res.status(500).json({ error: 'Something went wrong. Please try again.' }); }

  // Resolve the poster's display name for the immediate response
  const nameMap = await resolveUserNames(supabase, [data.user_id]);

  res.json({
    ok: true,
    comment: {
      id: data.id,
      userId: data.user_id,
      handle: nameMap[data.user_id] ?? `@user_${data.user_id.slice(0, 6)}`,
      body: data.body,
      likeCount: 0,
      liked: false,
      createdAt: data.created_at,
      replies: [],
    },
  });
});

// POST toggle like on a comment
router.post('/:bulletinId/comments/:commentId/like', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { commentId } = req.params;

  const { data: existing } = await supabase.from('bulletin_comment_likes')
    .select('comment_id').eq('comment_id', commentId).eq('user_id', req.user.id).maybeSingle();

  if (existing) {
    await supabase.from('bulletin_comment_likes').delete().eq('comment_id', commentId).eq('user_id', req.user.id);
    const { count } = await supabase.from('bulletin_comment_likes').select('*', { count: 'exact', head: true }).eq('comment_id', commentId);
    await supabase.from('bulletin_comments').update({ like_count: count ?? 0 }).eq('id', commentId);
    return res.json({ ok: true, liked: false, likeCount: count ?? 0 });
  } else {
    await supabase.from('bulletin_comment_likes').insert({ comment_id: commentId, user_id: req.user.id });
    const { count } = await supabase.from('bulletin_comment_likes').select('*', { count: 'exact', head: true }).eq('comment_id', commentId);
    await supabase.from('bulletin_comments').update({ like_count: count ?? 0 }).eq('id', commentId);
    return res.json({ ok: true, liked: true, likeCount: count ?? 0 });
  }
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
    log.error('flutterwave payment initiation error:', err.message);
    return res.status(502).json({ error: 'Payment initiation failed. Please try again.' });
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
  const { txId } = req.body;

  if (!txId) return res.status(400).json({ error: 'txId is required' });

  try {
    // Step 1 — Load the pending access record that was created when the user
    // initiated payment. This record binds the expected tx_ref, amount, and
    // bulletin to the authenticated user. Any verification attempt that does
    // not match this record is rejected before we even call Flutterwave.
    const { data: pending, error: pendingErr } = await supabase
      .from('bulletin_access')
      .select('flw_tx_ref, amount_ngn, church_id')
      .eq('bulletin_id', bulletinId)
      .eq('user_id', req.user.id)
      .eq('status', 'pending')
      .maybeSingle();

    if (pendingErr || !pending) {
      return res.status(403).json({ error: 'No pending payment found for this bulletin. Please initiate payment first.' });
    }

    // Step 2 — Verify the transaction with Flutterwave
    const result = await verifyFlwTransaction(txId);
    const tx = result.data;

    if (tx.status !== 'successful') {
      return res.json({ ok: false, paid: false, status: tx.status });
    }

    // Step 3 — Validate that this transaction belongs to this user's pending record:
    //   • tx_ref must match exactly (prevents replaying another user's successful tx)
    //   • currency must be NGN
    //   • amount paid must be >= the expected bulletin price
    if (tx.tx_ref !== pending.flw_tx_ref) {
      log.warn(`tx_ref mismatch for bulletin ${bulletinId} user ${req.user.id}: expected ${pending.flw_tx_ref}, got ${tx.tx_ref}`);
      return res.status(403).json({ error: 'Transaction reference mismatch. Payment not accepted.' });
    }
    if ((tx.currency ?? '').toUpperCase() !== 'NGN') {
      return res.status(400).json({ error: 'Payment must be in NGN.' });
    }
    if (tx.amount < pending.amount_ngn) {
      log.warn(`Underpayment for bulletin ${bulletinId}: expected ₦${pending.amount_ngn}, received ₦${tx.amount}`);
      return res.status(400).json({ error: 'Payment amount is less than the bulletin price.' });
    }

    // Step 4 — Grant access
    await supabase.from('bulletin_access').upsert(
      {
        bulletin_id: bulletinId,
        user_id: req.user.id,
        church_id: pending.church_id,
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

export { router as bulletinsRouter };
