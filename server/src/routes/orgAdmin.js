/**
 * orgAdmin.js — Church (org) admin router for /org-admin
 * Access: livingolive.adroomai.com/org-admin
 * Church credentials are created by the Super Admin via /admin/api/churches.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../lib/logger.js';
import { adminBus } from '../lib/adminBus.js';

const log = logger('org-admin');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// ── Auth helpers ───────────────────────────────────────────────────────────────
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [salt, hash] = stored.split(':');
    const attempt = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(attempt, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.send(orgLoginPage('Too many login attempts. Wait 15 minutes.')),
});

function requireOrgAdmin(req, res, next) {
  if (req.session?.orgAdmin) return next();
  res.redirect('/org-admin/login');
}

// ── Routes ─────────────────────────────────────────────────────────────────────

router.get('/', (req, res) =>
  req.session?.orgAdmin ? res.redirect('/org-admin/dashboard') : res.redirect('/org-admin/login')
);

router.get('/login', (req, res) => {
  if (req.session?.orgAdmin) return res.redirect('/org-admin/dashboard');
  res.send(orgLoginPage());
});

router.post('/login', loginLimiter, async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  if (!supabase) return res.send(orgLoginPage('Database unavailable. Contact support.'));

  const { username, password } = req.body;
  if (!username || !password) return res.send(orgLoginPage('Username and password are required.'));

  const { data: church, error } = await supabase
    .from('churches')
    .select('id, name, slug, admin_username, password_hash, active')
    .eq('admin_username', username.trim())
    .maybeSingle();

  if (error || !church) {
    log.warn(`Failed login attempt for username: ${username}`);
    return res.send(orgLoginPage('Invalid credentials.'));
  }
  if (!church.active) {
    return res.send(orgLoginPage('This church account has been deactivated. Contact support.'));
  }
  if (!verifyPassword(password, church.password_hash)) {
    log.warn(`Bad password for church: ${church.name}`);
    return res.send(orgLoginPage('Invalid credentials.'));
  }

  req.session.orgAdmin = { churchId: church.id, churchName: church.name, slug: church.slug };
  log.info(`Church admin login: ${church.name} (${church.id})`);
  res.redirect('/org-admin/dashboard');
});

router.post('/logout', (req, res) => {
  const name = req.session?.orgAdmin?.churchName ?? 'unknown';
  req.session.destroy(() => {
    log.info(`Church admin logout: ${name}`);
    res.redirect('/org-admin/login');
  });
});

// ── Dashboard HTML ─────────────────────────────────────────────────────────────
router.get('/dashboard', requireOrgAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, '../admin/org-dashboard.html'));
});

// ── Session info ───────────────────────────────────────────────────────────────
router.get('/api/me', requireOrgAdmin, async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { churchId, churchName, slug } = req.session.orgAdmin;
  let church = { id: churchId, name: churchName, slug };

  if (supabase) {
    const { data } = await supabase
      .from('churches')
      .select('id, name, slug, email, phone, description, logo_url, bank_name, account_number, account_name')
      .eq('id', churchId)
      .maybeSingle();
    if (data) church = data;
  }
  res.json({ ok: true, church });
});

// ── Bulletin CRUD ──────────────────────────────────────────────────────────────
router.get('/api/bulletins', requireOrgAdmin, async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  if (!supabase) return res.json({ ok: true, bulletins: [] });

  const { churchId } = req.session.orgAdmin;
  const { data, error } = await supabase
    .from('bulletins')
    .select('id, title, frequency, publish_at, expires_at, is_paid, price_ngn, is_published, created_at, content_preview')
    .eq('church_id', churchId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, bulletins: data ?? [] });
});

router.get('/api/bulletins/:id', requireOrgAdmin, async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { churchId } = req.session.orgAdmin;
  const { data, error } = await supabase
    .from('bulletins')
    .select('*')
    .eq('id', req.params.id)
    .eq('church_id', churchId)
    .maybeSingle();

  if (error || !data) return res.status(404).json({ ok: false, error: 'Bulletin not found' });
  res.json({ ok: true, bulletin: data });
});

router.post('/api/bulletins', requireOrgAdmin, async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  if (!supabase) return res.status(503).json({ ok: false, error: 'Database unavailable' });

  const { churchId } = req.session.orgAdmin;
  const { title, content, frequency, publishAt, expiresAt, isPaid, priceNgn } = req.body;

  if (!title?.trim() || !content?.trim()) {
    return res.status(400).json({ ok: false, error: 'title and content are required' });
  }

  const preview = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  const { data, error } = await supabase.from('bulletins').insert({
    church_id: churchId,
    title: title.trim(),
    content,
    content_preview: preview,
    frequency: frequency ?? 'weekly',
    publish_at: publishAt ?? null,
    expires_at: expiresAt ?? null,
    is_paid: !!isPaid,
    price_ngn: isPaid ? (parseInt(priceNgn, 10) || 0) : 0,
    is_published: false,
  }).select('id').single();

  if (error) return res.status(500).json({ ok: false, error: error.message });
  log.info(`Bulletin created: "${title}" for church ${churchId}`);
  res.json({ ok: true, bulletinId: data.id });
});

router.put('/api/bulletins/:id', requireOrgAdmin, async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { churchId } = req.session.orgAdmin;
  const { title, content, frequency, publishAt, expiresAt, isPaid, priceNgn } = req.body;

  const preview = content ? content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) : undefined;
  const updates = {};
  if (title !== undefined) updates.title = title.trim();
  if (content !== undefined) { updates.content = content; updates.content_preview = preview; }
  if (frequency !== undefined) updates.frequency = frequency;
  if (publishAt !== undefined) updates.publish_at = publishAt;
  if (expiresAt !== undefined) updates.expires_at = expiresAt;
  if (isPaid !== undefined) { updates.is_paid = !!isPaid; updates.price_ngn = isPaid ? (parseInt(priceNgn, 10) || 0) : 0; }
  updates.updated_at = new Date().toISOString();

  const { error } = await supabase.from('bulletins').update(updates).eq('id', req.params.id).eq('church_id', churchId);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true });
});

router.delete('/api/bulletins/:id', requireOrgAdmin, async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { churchId } = req.session.orgAdmin;
  const { error } = await supabase.from('bulletins').delete().eq('id', req.params.id).eq('church_id', churchId);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  log.info(`Bulletin ${req.params.id} deleted by church ${churchId}`);
  res.json({ ok: true });
});

// Publish or unpublish immediately — sends push to all church members
router.post('/api/bulletins/:id/publish', requireOrgAdmin, async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { churchId, churchName } = req.session.orgAdmin;
  const { publish } = req.body; // true = publish, false = unpublish

  const { data: bulletin, error: fetchErr } = await supabase
    .from('bulletins')
    .select('id, title, is_published')
    .eq('id', req.params.id)
    .eq('church_id', churchId)
    .maybeSingle();

  if (fetchErr || !bulletin) return res.status(404).json({ ok: false, error: 'Bulletin not found' });

  const now = new Date().toISOString();
  const { error } = await supabase.from('bulletins').update({
    is_published: !!publish,
    publish_at: publish ? now : null,
    updated_at: now,
  }).eq('id', req.params.id).eq('church_id', churchId);

  if (error) return res.status(500).json({ ok: false, error: error.message });

  if (publish) {
    // Fire-and-forget: push notification to all church members
    notifyChurchMembers(supabase, churchId, {
      title: `📋 New Bulletin from ${churchName}`,
      body: bulletin.title,
      data: { type: 'bulletin', bulletinId: bulletin.id, churchId },
    }).catch((e) => log.warn('Push to church members failed:', e.message));
    log.info(`Bulletin "${bulletin.title}" published for church ${churchId}`);
  }

  res.json({ ok: true, published: !!publish });
});

// ── Members ────────────────────────────────────────────────────────────────────
router.get('/api/members', requireOrgAdmin, async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  if (!supabase) return res.json({ ok: true, members: [], total: 0 });

  const { churchId } = req.session.orgAdmin;
  const { data, error } = await supabase
    .from('church_members')
    .select('id, user_id, confirmed_at, created_at')
    .eq('church_id', churchId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, members: data ?? [], total: data?.length ?? 0 });
});

// ── Stats ──────────────────────────────────────────────────────────────────────
router.get('/api/stats', requireOrgAdmin, async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  if (!supabase) return res.json({ ok: true, stats: {} });

  const { churchId } = req.session.orgAdmin;
  const [members, bulletins, payments] = await Promise.allSettled([
    supabase.from('church_members').select('id', { count: 'exact', head: true }).eq('church_id', churchId),
    supabase.from('bulletins').select('id', { count: 'exact', head: true }).eq('church_id', churchId),
    supabase.from('bulletin_access').select('amount_ngn').eq('church_id', churchId).eq('status', 'success'),
  ]);

  const totalRevenue = (payments.value?.data ?? []).reduce((s, r) => s + (r.amount_ngn || 0), 0);
  res.json({
    ok: true,
    stats: {
      memberCount: members.value?.count ?? 0,
      bulletinCount: bulletins.value?.count ?? 0,
      totalRevenue,
    },
  });
});

// ── Church profile update ──────────────────────────────────────────────────────
router.put('/api/profile', requireOrgAdmin, async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { churchId } = req.session.orgAdmin;
  const { description, email, phone, logoUrl } = req.body;

  const updates = { updated_at: new Date().toISOString() };
  if (description !== undefined) updates.description = description;
  if (email !== undefined) updates.email = email;
  if (phone !== undefined) updates.phone = phone;
  if (logoUrl !== undefined) updates.logo_url = logoUrl;

  const { error } = await supabase.from('churches').update(updates).eq('id', churchId);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true });
});

// ── Announcements CRUD ────────────────────────────────────────────────────────
router.get('/api/announcements', requireOrgAdmin, async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { churchId } = req.session.orgAdmin;
  try {
    const { data, error } = await supabase
      .from('church_announcements')
      .select('id, text, type, is_active, created_at')
      .eq('church_id', churchId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ ok: true, announcements: data ?? [] });
  } catch (e) {
    // Table may not exist yet — return empty list, not an error
    res.json({ ok: true, announcements: [], warning: e.message });
  }
});

router.post('/api/announcements', requireOrgAdmin, async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { churchId } = req.session.orgAdmin;
  const { text, type } = req.body;
  if (!text?.trim()) return res.status(400).json({ ok: false, error: 'text is required' });
  try {
    const { data, error } = await supabase
      .from('church_announcements')
      .insert({ church_id: churchId, text: text.trim(), type: type ?? 'general', is_active: true })
      .select('id').single();
    if (error) throw error;
    log.info(`Announcement created for church ${churchId}`);
    res.json({ ok: true, id: data.id });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.put('/api/announcements/:id', requireOrgAdmin, async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { churchId } = req.session.orgAdmin;
  const { is_active } = req.body;
  try {
    const { error } = await supabase
      .from('church_announcements')
      .update({ is_active: !!is_active })
      .eq('id', req.params.id).eq('church_id', churchId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.delete('/api/announcements/:id', requireOrgAdmin, async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { churchId } = req.session.orgAdmin;
  try {
    const { error } = await supabase
      .from('church_announcements')
      .delete()
      .eq('id', req.params.id).eq('church_id', churchId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Extras: order of service + social links ────────────────────────────────────
router.get('/api/extras', requireOrgAdmin, async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { churchId } = req.session.orgAdmin;
  try {
    const { data } = await supabase
      .from('churches')
      .select('website, facebook_url, instagram_url, twitter_url, youtube_url, order_of_service')
      .eq('id', churchId)
      .maybeSingle();
    res.json({ ok: true, extras: data ?? {} });
  } catch (e) {
    res.json({ ok: true, extras: {}, warning: e.message });
  }
});

router.put('/api/extras', requireOrgAdmin, async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { churchId } = req.session.orgAdmin;
  const { orderOfService, website, facebook_url, instagram_url, twitter_url, youtube_url } = req.body;
  const updates = { updated_at: new Date().toISOString() };
  if (orderOfService !== undefined) updates.order_of_service = orderOfService;
  if (website !== undefined)      updates.website = website || null;
  if (facebook_url !== undefined) updates.facebook_url = facebook_url || null;
  if (instagram_url !== undefined) updates.instagram_url = instagram_url || null;
  if (twitter_url !== undefined)  updates.twitter_url = twitter_url || null;
  if (youtube_url !== undefined)  updates.youtube_url = youtube_url || null;
  try {
    const { error } = await supabase.from('churches').update(updates).eq('id', churchId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Helper: push to all church members ────────────────────────────────────────
async function notifyChurchMembers(supabase, churchId, { title, body, data }) {
  const { data: members } = await supabase
    .from('church_members')
    .select('user_id')
    .eq('church_id', churchId);
  if (!members?.length) return;

  const { Expo } = await import('expo-server-sdk');
  const expo = new Expo();

  for (const m of members) {
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', m.user_id);

    const messages = (tokens ?? [])
      .filter((r) => Expo.isExpoPushToken(r.token))
      .map((r) => ({ to: r.token, sound: 'default', title, body, data: data ?? {} }));

    if (!messages.length) continue;
    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      expo.sendPushNotificationsAsync(chunk).catch(() => {});
    }
  }
}

export { router as orgAdminRouter };

// ── Login page HTML ────────────────────────────────────────────────────────────
function orgLoginPage(errorMsg = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Church Admin — Living Olive</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#1C2712;color:#e8ead4;font-family:Georgia,serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background-image:radial-gradient(ellipse at 50% 0%,rgba(90,110,60,0.25) 0%,transparent 70%)}
  .card{background:rgba(30,40,18,0.95);border:1px solid rgba(138,154,107,0.2);border-radius:20px;padding:52px 44px;width:420px;box-shadow:0 24px 80px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.04)}
  .logo{text-align:center;margin-bottom:36px}
  .logo-icon{font-size:52px;display:block;margin-bottom:12px}
  .logo h1{font-size:22px;font-weight:400;color:#c9a227;letter-spacing:1px}
  .logo p{font-size:12px;color:rgba(200,205,160,0.5);margin-top:8px;letter-spacing:2px;text-transform:uppercase}
  .divider{height:1px;background:linear-gradient(90deg,transparent,rgba(201,162,39,0.2),transparent);margin-bottom:28px}
  label{display:block;font-size:11px;letter-spacing:2px;color:rgba(200,205,160,0.55);text-transform:uppercase;margin-bottom:8px;font-family:'Courier New',monospace}
  input{width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(138,154,107,0.2);border-radius:10px;padding:13px 16px;color:#e8ead4;font-family:Georgia,serif;font-size:15px;outline:none;transition:all .2s}
  input:focus{border-color:rgba(201,162,39,0.5);box-shadow:0 0 0 3px rgba(201,162,39,0.08)}
  .field{margin-bottom:20px}
  button{width:100%;background:linear-gradient(135deg,#3E4A2F,#5B6B45);border:1px solid rgba(138,154,107,0.4);border-radius:10px;padding:15px;color:#e2c060;font-family:Georgia,serif;font-size:14px;letter-spacing:2px;cursor:pointer;transition:all .2s;margin-top:8px}
  button:hover{background:linear-gradient(135deg,#4A5A36,#6B8055);box-shadow:0 0 30px rgba(201,162,39,0.12)}
  .error{background:rgba(179,69,44,0.1);border:1px solid rgba(179,69,44,0.3);border-radius:10px;padding:12px 16px;text-align:center;color:#e07060;font-size:13px;margin-bottom:20px}
  .back{text-align:center;margin-top:20px;font-size:12px;color:rgba(200,205,160,0.4)}
  .back a{color:rgba(201,162,39,0.6);text-decoration:none}
  .back a:hover{color:#c9a227}
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <span class="logo-icon">🫒</span>
    <h1>Church Admin Portal</h1>
    <p>Living Olive — Organisation Access</p>
  </div>
  <div class="divider"></div>
  ${errorMsg ? `<div class="error">${errorMsg}</div>` : ''}
  <form method="POST" action="/org-admin/login">
    <div class="field">
      <label>Church Username</label>
      <input type="text" name="username" autocomplete="username" required placeholder="Your assigned username">
    </div>
    <div class="field">
      <label>Password</label>
      <input type="password" name="password" autocomplete="current-password" required placeholder="••••••••••••••••">
    </div>
    <button type="submit">Sign In →</button>
  </form>
  <div class="back">
    Need access? <a href="mailto:admin@livingolive.app">Contact Living Olive support</a>
  </div>
</div>
</body>
</html>`;
}
