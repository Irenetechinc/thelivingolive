/**
 * admin.js — Super admin router for /admin
 * Access: livingolive.adroomai.com/admin
 * Credentials: livingoliveadmin / Meger2200@dav1960?
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { adminBus } from '../lib/adminBus.js';
import { hashPassword } from './orgAdmin.js';
import {
  runCrawlJob,
  runGeneticJob,
  runDailyKeywordLearning,
  runAutoDiscovery,
  runQualityBenchmark,
  runPrayerQualitySync,
} from '../lib/scheduler.js';

// Rate-limit admin login: max 10 attempts per 15 minutes per IP.
// This prevents brute-force credential attacks without blocking legitimate admins.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).send(loginPage(
      'Too many login attempts. Please wait 15 minutes before trying again.'
    ));
  },
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();
const SERVER_START = Date.now();

// ── Admin credentials — read from env vars, with dev-only fallback ─────────
// In production (NODE_ENV=production on Railway) these MUST be set as env vars.
// If unset in production, login is refused so the panel is never accessible with
// unknown/leaked credentials. In development the known defaults are used so the
// app works out of the box without extra setup.
const _isProd = process.env.NODE_ENV === 'production';
let ADMIN_USER = process.env.ADMIN_USERNAME;
let ADMIN_PASS = process.env.ADMIN_PASSWORD;

if (!ADMIN_USER || !ADMIN_PASS) {
  if (!_isProd) {
    // Development defaults — safe because Railway/prod env vars are separate
    ADMIN_USER = ADMIN_USER || 'livingoliveadmin';
    ADMIN_PASS = ADMIN_PASS || 'Meger2200@dav1960?';
    console.warn('[WARN] ADMIN_USERNAME/ADMIN_PASSWORD not set — using development defaults. ' +
      'Set these as Railway env vars before deploying to production.');
  } else {
    console.error('[FATAL] ADMIN_USERNAME and ADMIN_PASSWORD env vars are required in ' +
      'production but are not set. Admin login is disabled until they are configured ' +
      'in Railway → Variables.');
  }
}

// ── Auth guard ────────────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.session?.isAdmin) return next();
  return res.redirect('/admin/login');
}

// ── Login page ────────────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  if (req.session?.isAdmin) return res.redirect('/admin/dashboard');
  res.send(loginPage());
});

router.post('/login', loginLimiter, (req, res) => {
  // Refuse login entirely when production credentials are not configured
  if (!ADMIN_USER || !ADMIN_PASS) {
    return res.send(loginPage(
      'Admin access is not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD ' +
      'environment variables in Railway → Variables, then redeploy.'
    ));
  }
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.isAdmin = true;
    req.session.loginTime = Date.now();
    adminBus.agentLog('admin', `Admin login from ${req.ip}`);
    return res.redirect('/admin/dashboard');
  }
  res.send(loginPage('Invalid credentials. Access denied.'));
});

router.post('/logout', (req, res) => {
  adminBus.agentLog('admin', 'Admin session ended');
  req.session.destroy(() => res.redirect('/admin/login'));
});

// ── Dashboard ─────────────────────────────────────────────────────────────────
router.get('/dashboard', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, '../admin/dashboard.html'));
});

router.get('/', (req, res) => {
  if (req.session?.isAdmin) return res.redirect('/admin/dashboard');
  res.redirect('/admin/login');
});

// ── SSE — realtime agent event stream ─────────────────────────────────────────
router.get('/api/events', requireAdmin, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering on Railway
  res.flushHeaders();

  // Heartbeat every 20s to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (_) { clearInterval(heartbeat); }
  }, 20000);

  adminBus.addClient(res);

  req.on('close', () => {
    clearInterval(heartbeat);
    adminBus.removeClient(res);
  });
});

// ── Stats API ─────────────────────────────────────────────────────────────────
router.get('/api/stats', requireAdmin, async (req, res) => {
  try {
    const supabase = req.app.locals.supabaseAdmin;
    const stats = { users: 0, prayerPlans: 0, devotionPlans: 0, feedbackCount: 0, learnedKeywords: 0 };

    if (supabase) {
      const [users, pPlans, dPlans, feedback, keywords] = await Promise.allSettled([
        supabase.auth.admin.listUsers({ page: 1, perPage: 1 }),
        supabase.from('prayer_plans').select('id', { count: 'exact', head: true }),
        supabase.from('devotion_plans').select('id', { count: 'exact', head: true }),
        supabase.from('generation_feedback').select('id', { count: 'exact', head: true }),
        supabase.from('learned_keywords').select('id', { count: 'exact', head: true }),
      ]);
      stats.users        = users.value?.data?.total ?? 0;
      stats.prayerPlans  = pPlans.value?.count ?? 0;
      stats.devotionPlans = dPlans.value?.count ?? 0;
      stats.feedbackCount = feedback.value?.count ?? 0;
      stats.learnedKeywords = keywords.value?.count ?? 0;
    }

    res.json({ ok: true, stats, agents: adminBus.getAgentState() });
  } catch (err) {
    res.json({ ok: false, error: err.message, stats: {}, agents: {} });
  }
});

// ── System info API ───────────────────────────────────────────────────────────
router.get('/api/system', requireAdmin, (req, res) => {
  const uptimeSec = Math.round((Date.now() - SERVER_START) / 1000);
  const mem = process.memoryUsage();
  res.json({
    ok: true,
    uptime: uptimeSec,
    node: process.version,
    platform: process.platform,
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    },
    cpus: os.cpus().length,
    loadAvg: os.loadavg(),
    freeRam: Math.round(os.freemem() / 1024 / 1024),
    totalRam: Math.round(os.totalmem() / 1024 / 1024),
    hostname: os.hostname(),
    sseClients: adminBus._sseClients.size,
    supabase: !!req.app.locals.supabaseAdmin,
  });
});

// ── Users API ─────────────────────────────────────────────────────────────────
router.get('/api/users', requireAdmin, async (req, res) => {
  try {
    const supabase = req.app.locals.supabaseAdmin;
    if (!supabase) return res.json({ ok: true, users: [], total: 0 });
    const page = parseInt(req.query.page ?? '1', 10);
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 50 });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, users: data.users ?? [], total: data.total ?? 0 });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete / ban a user
router.delete('/api/users/:id', requireAdmin, async (req, res) => {
  try {
    const supabase = req.app.locals.supabaseAdmin;
    if (!supabase) return res.status(503).json({ ok: false, error: 'Database unavailable' });
    const { id } = req.params;
    const { error } = await supabase.auth.admin.deleteUser(id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    adminBus.agentLog('admin', `User ${id} deleted by admin`);
    res.json({ ok: true, deleted: id });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Feature flags API ─────────────────────────────────────────────────────────
router.get('/api/flags', requireAdmin, (req, res) => {
  res.json({ ok: true, flags: adminBus.getFlags() });
});

router.post('/api/flags/:key', requireAdmin, (req, res) => {
  const { key } = req.params;
  const { enabled } = req.body;
  const updated = adminBus.setFlag(key, enabled);
  if (!updated) return res.status(404).json({ ok: false, error: 'Unknown flag' });
  adminBus.agentLog('admin', `Feature "${key}" ${enabled ? 'ENABLED' : 'DISABLED'} by admin`);

  // Persist the change to Supabase so it survives Railway restarts.
  // Fire-and-forget — the in-memory change is immediate; DB write is best-effort.
  const supabase = req.app.locals.supabaseAdmin;
  if (supabase) {
    supabase.from('feature_flags').upsert(
      { key, enabled: !!enabled, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    ).then(({ error }) => {
      if (error) console.warn(`[admin] Failed to persist flag "${key}":`, error.message);
    });
  }

  res.json({ ok: true, key, enabled });
});

// ── Push notification stats API ───────────────────────────────────────────────
router.get('/api/push-stats', requireAdmin, async (req, res) => {
  try {
    const supabase = req.app.locals.supabaseAdmin;
    const ps = req.app.locals.pushStats ?? { sent: 0, failed: 0, recentPushes: [] };

    // Count registered device tokens from Supabase
    let tokenCount = 0;
    let uniqueUsers = 0;
    if (supabase) {
      const [tokensRes, usersRes] = await Promise.allSettled([
        supabase.from('push_tokens').select('id', { count: 'exact', head: true }),
        supabase.from('push_tokens').select('user_id', { count: 'exact', head: true }),
      ]);
      tokenCount  = tokensRes.value?.count  ?? 0;
      uniqueUsers = usersRes.value?.count   ?? 0;
    }

    res.json({
      ok: true,
      tokens: tokenCount,
      uniqueUsers,
      sent: ps.sent,
      failed: ps.failed,
      recentPushes: ps.recentPushes.slice(0, 20),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Agent manual trigger API ──────────────────────────────────────────────────
const TRIGGERABLE_AGENTS = {
  webCrawler:       (supabase) => runCrawlJob(supabase),
  geneticAlgorithm: (supabase) => runGeneticJob(supabase),
  keywordLearner:   (supabase) => runDailyKeywordLearning(supabase),
  autoDiscovery:    (supabase) => runAutoDiscovery(supabase),
  qualityBenchmark: (supabase) => runQualityBenchmark(supabase),
  qualitySync:      (supabase) => runPrayerQualitySync(supabase),
};

router.post('/api/agents/:name/run', requireAdmin, (req, res) => {
  const { name } = req.params;
  const fn = TRIGGERABLE_AGENTS[name];
  if (!fn) return res.status(404).json({ ok: false, error: `No triggerable agent: ${name}` });

  const supabase = req.app.locals.supabaseAdmin;
  if (!supabase) return res.status(503).json({ ok: false, error: 'Database unavailable — set SUPABASE credentials' });

  // Fire and forget — result is broadcast via SSE
  fn(supabase).catch((e) => {
    adminBus.agentError(name, `Manual run failed: ${e.message}`);
  });

  adminBus.agentLog('admin', `${name} manually triggered by admin`);
  res.json({ ok: true, agent: name, triggered: true });
});

// ── Church management (Super Admin only) ──────────────────────────────────────

router.get('/api/churches', requireAdmin, async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  if (!supabase) return res.json({ ok: true, churches: [], total: 0 });
  const { data, error } = await supabase
    .from('churches')
    .select('id, name, slug, admin_username, email, phone, active, created_at')
    .order('name');
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, churches: data ?? [], total: data?.length ?? 0 });
});

router.post('/api/churches', requireAdmin, async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  if (!supabase) return res.status(503).json({ ok: false, error: 'Database unavailable' });

  const { name, adminUsername, password, email, phone, description, bankName, accountNumber, accountName } = req.body;
  if (!name?.trim() || !adminUsername?.trim() || !password?.trim()) {
    return res.status(400).json({ ok: false, error: 'name, adminUsername and password are required' });
  }

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const passwordHash = hashPassword(password);

  const { data, error } = await supabase.from('churches').insert({
    name: name.trim(),
    slug,
    admin_username: adminUsername.trim(),
    password_hash: passwordHash,
    email: email?.trim() ?? null,
    phone: phone?.trim() ?? null,
    description: description?.trim() ?? null,
    bank_name: bankName?.trim() ?? null,
    account_number: accountNumber?.trim() ?? null,
    account_name: accountName?.trim() ?? null,
    active: true,
  }).select('id, name, slug, admin_username').single();

  if (error) return res.status(400).json({ ok: false, error: error.message });
  adminBus.agentLog('admin', `Church onboarded: "${name}" (username: ${adminUsername})`);
  res.json({ ok: true, church: data });
});

router.patch('/api/churches/:id', requireAdmin, async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { name, email, phone, active, password } = req.body;
  const updates = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name.trim();
  if (email !== undefined) updates.email = email.trim();
  if (phone !== undefined) updates.phone = phone.trim();
  if (active !== undefined) updates.active = !!active;
  if (password?.trim()) updates.password_hash = hashPassword(password.trim());

  const { error } = await supabase.from('churches').update(updates).eq('id', req.params.id);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  adminBus.agentLog('admin', `Church ${req.params.id} updated by admin`);
  res.json({ ok: true });
});

router.delete('/api/churches/:id', requireAdmin, async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { error } = await supabase.from('churches').update({ active: false }).eq('id', req.params.id);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  adminBus.agentLog('admin', `Church ${req.params.id} deactivated by admin`);
  res.json({ ok: true });
});

// ── Login page HTML ───────────────────────────────────────────────────────────
function loginPage(errorMsg = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Living Olive — Admin</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#030308;color:#e0e0ff;font-family:'Courier New',monospace;min-height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
  canvas{position:fixed;inset:0;z-index:0;pointer-events:none}
  .card{position:relative;z-index:1;background:rgba(10,10,30,0.88);border:1px solid rgba(0,200,255,0.25);border-radius:16px;padding:48px 40px;width:400px;backdrop-filter:blur(24px);box-shadow:0 0 80px rgba(0,200,255,0.08),0 0 200px rgba(120,0,255,0.04),inset 0 1px 0 rgba(255,255,255,0.05)}
  .logo{text-align:center;margin-bottom:36px}
  .logo-icon{font-size:48px;margin-bottom:12px;display:block;filter:drop-shadow(0 0 20px rgba(0,200,255,0.4))}
  .logo h1{font-size:15px;letter-spacing:6px;color:#00c8ff;text-transform:uppercase;font-weight:400}
  .logo p{font-size:9px;letter-spacing:3px;color:rgba(0,200,255,0.35);margin-top:6px;text-transform:uppercase}
  .divider{height:1px;background:linear-gradient(90deg,transparent,rgba(0,200,255,0.2),transparent);margin:0 0 28px}
  label{display:block;font-size:9px;letter-spacing:3px;color:rgba(0,200,255,0.5);text-transform:uppercase;margin-bottom:8px}
  input{width:100%;background:rgba(0,200,255,0.03);border:1px solid rgba(0,200,255,0.15);border-radius:8px;padding:13px 16px;color:#e0e0ff;font-family:inherit;font-size:13px;outline:none;transition:all 0.25s}
  input:focus{border-color:rgba(0,200,255,0.45);box-shadow:0 0 0 3px rgba(0,200,255,0.06),0 0 24px rgba(0,200,255,0.08)}
  .field{margin-bottom:20px}
  button{width:100%;background:linear-gradient(135deg,rgba(0,200,255,0.12),rgba(120,0,255,0.12));border:1px solid rgba(0,200,255,0.3);border-radius:8px;padding:14px;color:#00c8ff;font-family:inherit;font-size:11px;letter-spacing:4px;text-transform:uppercase;cursor:pointer;transition:all 0.25s;margin-top:8px;position:relative;overflow:hidden}
  button::after{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(0,200,255,0.06),transparent);opacity:0;transition:opacity .2s}
  button:hover{box-shadow:0 0 40px rgba(0,200,255,0.15);transform:translateY(-1px);border-color:rgba(0,200,255,0.5)}
  button:hover::after{opacity:1}
  .error{background:rgba(255,60,60,0.08);border:1px solid rgba(255,60,60,0.25);border-radius:8px;padding:12px 16px;text-align:center;color:#ff7070;font-size:11px;letter-spacing:1px;margin-bottom:20px}
  .scan-line{position:fixed;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(0,200,255,0.4),transparent);animation:scan 5s linear infinite;z-index:2;pointer-events:none}
  @keyframes scan{0%{top:0}100%{top:100vh}}
  .corner{position:absolute;width:12px;height:12px;border-color:rgba(0,200,255,0.3);border-style:solid}
  .tl{top:-1px;left:-1px;border-width:2px 0 0 2px;border-radius:4px 0 0 0}
  .tr{top:-1px;right:-1px;border-width:2px 2px 0 0;border-radius:0 4px 0 0}
  .bl{bottom:-1px;left:-1px;border-width:0 0 2px 2px;border-radius:0 0 0 4px}
  .br{bottom:-1px;right:-1px;border-width:0 2px 2px 0;border-radius:0 0 4px 0}
</style>
</head>
<body>
<canvas id="c"></canvas>
<div class="scan-line"></div>
<div class="card">
  <div class="corner tl"></div><div class="corner tr"></div>
  <div class="corner bl"></div><div class="corner br"></div>
  <div class="logo">
    <span class="logo-icon">🫒</span>
    <h1>Living Olive</h1>
    <p>System Administration Console</p>
  </div>
  <div class="divider"></div>
  ${errorMsg ? `<div class="error">⚠ ${errorMsg}</div>` : ''}
  <form method="POST" action="/admin/login">
    <div class="field">
      <label>Access ID</label>
      <input type="text" name="username" autocomplete="username" required placeholder="Enter access ID">
    </div>
    <div class="field">
      <label>Security Key</label>
      <input type="password" name="password" autocomplete="current-password" required placeholder="••••••••••••••••">
    </div>
    <button type="submit">AUTHENTICATE →</button>
  </form>
</div>
<script>
const c=document.getElementById('c'),ctx=c.getContext('2d');
let W,H,particles=[];
function resize(){W=c.width=innerWidth;H=c.height=innerHeight;init()}
function init(){particles=[];for(let i=0;i<100;i++)particles.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-0.5)*0.35,vy:(Math.random()-0.5)*0.35,r:Math.random()*1.5+0.3,phase:Math.random()*Math.PI*2})}
let t=0;
function draw(){ctx.clearRect(0,0,W,H);t+=0.004;
// grid
ctx.strokeStyle='rgba(0,200,255,0.015)';ctx.lineWidth=1;
for(let x=0;x<W;x+=80){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
for(let y=0;y<H;y+=80){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;if(p.x<0||p.x>W)p.vx*=-1;if(p.y<0||p.y>H)p.vy*=-1;const a=(Math.sin(t+p.phase)*0.5+0.5)*0.4+0.05;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=\`rgba(0,200,255,\${a})\`;ctx.fill();});
particles.forEach((a,i)=>particles.slice(i+1).forEach(b=>{const d=Math.hypot(a.x-b.x,a.y-b.y);if(d<140){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=\`rgba(0,200,255,\${(1-d/140)*0.06})\`;ctx.lineWidth=.5;ctx.stroke()}}));
requestAnimationFrame(draw)}
window.addEventListener('resize',resize);resize();draw();
</script>
</body>
</html>`;
}

export { router as adminRouter };
