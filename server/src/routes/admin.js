/**
 * admin.js — Super admin router for /admin
 * Access: livingolive.adroomai.com/admin
 * Credentials: livingoliveadmin / Meger2200@dav1960?
 */

import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { adminBus } from '../lib/adminBus.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

const ADMIN_USER = 'livingoliveadmin';
const ADMIN_PASS = 'Meger2200@dav1960?';

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

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.isAdmin = true;
    return res.redirect('/admin/dashboard');
  }
  res.send(loginPage('Invalid credentials. Access denied.'));
});

router.post('/logout', (req, res) => {
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

// ── Users API ─────────────────────────────────────────────────────────────────
router.get('/api/users', requireAdmin, async (req, res) => {
  try {
    const supabase = req.app.locals.supabaseAdmin;
    if (!supabase) return res.json({ ok: true, users: [] });
    const page = parseInt(req.query.page ?? '1', 10);
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 50 });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, users: data.users ?? [], total: data.total ?? 0 });
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
  res.json({ ok: true, key, enabled });
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
  .card{position:relative;z-index:1;background:rgba(10,10,30,0.85);border:1px solid rgba(0,200,255,0.25);border-radius:16px;padding:48px 40px;width:380px;backdrop-filter:blur(20px);box-shadow:0 0 60px rgba(0,200,255,0.08),inset 0 1px 0 rgba(255,255,255,0.05)}
  .logo{text-align:center;margin-bottom:32px}
  .logo-icon{font-size:40px;margin-bottom:8px}
  .logo h1{font-size:18px;letter-spacing:4px;color:#00c8ff;text-transform:uppercase;font-weight:400}
  .logo p{font-size:10px;letter-spacing:2px;color:rgba(0,200,255,0.4);margin-top:4px;text-transform:uppercase}
  label{display:block;font-size:10px;letter-spacing:2px;color:rgba(0,200,255,0.6);text-transform:uppercase;margin-bottom:6px}
  input{width:100%;background:rgba(0,200,255,0.04);border:1px solid rgba(0,200,255,0.18);border-radius:8px;padding:12px 16px;color:#e0e0ff;font-family:inherit;font-size:14px;outline:none;transition:border-color 0.2s}
  input:focus{border-color:rgba(0,200,255,0.5);box-shadow:0 0 20px rgba(0,200,255,0.1)}
  .field{margin-bottom:20px}
  button{width:100%;background:linear-gradient(135deg,rgba(0,200,255,0.15),rgba(120,0,255,0.15));border:1px solid rgba(0,200,255,0.35);border-radius:8px;padding:14px;color:#00c8ff;font-family:inherit;font-size:12px;letter-spacing:3px;text-transform:uppercase;cursor:pointer;transition:all 0.2s;margin-top:8px}
  button:hover{background:linear-gradient(135deg,rgba(0,200,255,0.25),rgba(120,0,255,0.25));box-shadow:0 0 30px rgba(0,200,255,0.2);transform:translateY(-1px)}
  .error{background:rgba(255,60,60,0.1);border:1px solid rgba(255,60,60,0.3);border-radius:8px;padding:12px;text-align:center;color:#ff6060;font-size:12px;letter-spacing:1px;margin-bottom:20px}
  .scan-line{position:fixed;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#00c8ff,transparent);animation:scan 4s linear infinite;opacity:0.3;z-index:2}
  @keyframes scan{0%{top:0}100%{top:100vh}}
</style>
</head>
<body>
<canvas id="c"></canvas>
<div class="scan-line"></div>
<div class="card">
  <div class="logo">
    <div class="logo-icon">🫒</div>
    <h1>Living Olive</h1>
    <p>System Administration</p>
  </div>
  ${errorMsg ? `<div class="error">${errorMsg}</div>` : ''}
  <form method="POST" action="/admin/login">
    <div class="field">
      <label>Access ID</label>
      <input type="text" name="username" autocomplete="username" required placeholder="Enter access ID">
    </div>
    <div class="field">
      <label>Security Key</label>
      <input type="password" name="password" autocomplete="current-password" required placeholder="••••••••••••">
    </div>
    <button type="submit">AUTHENTICATE →</button>
  </form>
</div>
<script>
const c=document.getElementById('c'),ctx=c.getContext('2d');
let W,H,particles=[];
function resize(){W=c.width=innerWidth;H=c.height=innerHeight;init()}
function init(){particles=[];for(let i=0;i<80;i++)particles.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-0.5)*0.3,vy:(Math.random()-0.5)*0.3,r:Math.random()*1.5+0.5,a:Math.random()})}
function draw(){ctx.clearRect(0,0,W,H);particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;if(p.x<0||p.x>W)p.vx*=-1;if(p.y<0||p.y>H)p.vy*=-1;p.a=Math.sin(Date.now()/2000+p.x)*0.5+0.5;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=\`rgba(0,200,255,\${p.a*0.4})\`;ctx.fill()});
particles.forEach((a,i)=>particles.slice(i+1).forEach(b=>{const d=Math.hypot(a.x-b.x,a.y-b.y);if(d<120){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=\`rgba(0,200,255,\${(1-d/120)*0.08})\`;ctx.stroke()}}));
requestAnimationFrame(draw)}
window.addEventListener('resize',resize);resize();draw();
</script>
</body>
</html>`;
}

export { router as adminRouter };
