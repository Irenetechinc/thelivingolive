import express from "express";
import cors from "cors";
import session from "express-session";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { Expo } from "expo-server-sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import multer from "multer";
import { toFile } from "openai/uploads";
import { generatePrayerPoints, generateDevotional } from "./lib/prayerEngine.js";
import { startPrayerEngineScheduler, getWeights, recordFeedback } from "./lib/scheduler.js";
import { logger } from "./lib/logger.js";
import { explainVerse, recordExplanationFeedback } from "./lib/verseExplainEngine.js";
import { fetchTeachingContextForVerse } from "./lib/webCrawler.js";
import { adminRouter } from "./routes/admin.js";
import { adminBus } from "./lib/adminBus.js";

const log = logger("api");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bibleDir = path.join(__dirname, "data", "bible");
const bibleIndex = JSON.parse(readFileSync(path.join(bibleDir, "index.json"), "utf-8"));
const bibleBookCache = new Map();

function loadBibleBook(bookId) {
  if (!bibleBookCache.has(bookId)) {
    const filePath = path.join(bibleDir, `book-${bookId}.json`);
    bibleBookCache.set(bookId, JSON.parse(readFileSync(filePath, "utf-8")));
  }
  return bibleBookCache.get(bookId);
}

// Supabase keys are required for auth and all database-backed features.
// OPENAI_API_KEY is optional — only needed for sermon transcription, prayer,
// and devotion generation. All Bible reading, verse explanation, and
// rule-based prayer/devotion features run without it.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const isProd = process.env.NODE_ENV === "production";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "[FATAL] Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY environment variables. " +
    "Auth verification will be unavailable. Set these in your Railway environment variables."
  );
}
if (!process.env.OPENAI_API_KEY) {
  console.warn("[WARN] OPENAI_API_KEY not set — sermon transcription, AI prayer, and AI devotion features will be unavailable. All other features run without it.");
}
if (isProd && !process.env.SESSION_SECRET) {
  console.error(
    "[FATAL] SESSION_SECRET is not set in production. Admin sessions use a weak hardcoded " +
    "fallback that could be guessed. Set SESSION_SECRET to a long random string in Railway → Variables."
  );
}

const app = express();

// Trust Railway's reverse proxy so express-session secure cookies work over HTTPS
app.set("trust proxy", 1);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // needed for admin login form

// Session — used only by the admin dashboard (cookie-based, never shared with mobile app)
// sameSite:"lax" is intentional — it blocks CSRF by refusing cross-site POSTs while still
// allowing the same-origin admin tab to function. "none" is NOT used because it would expose
// all admin write endpoints to cross-site request forgery. secure:true in production ensures
// the cookie is never sent over plain HTTP behind Railway's HTTPS proxy.
app.use(session({
  secret: process.env.SESSION_SECRET || "living-olive-admin-fallback-secret-2024",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",   // CSRF-resistant: blocks cross-site POSTs in all environments
    secure: isProd,    // HTTPS-only in production (works because trust proxy is set above)
    maxAge: 8 * 60 * 60 * 1000, // 8h
  },
}));

// ──────────────────────────────────────────────
// Request logging — every API call, printed to stdout so it shows up in
// `railway logs` (Railway has no separate logging API; it just captures
// whatever the process writes to stdout/stderr). Logs method, path, status,
// duration, and the authenticated user id when available.
// ──────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const who = req.user?.id ? ` user=${req.user.id}` : "";
    log.info(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)${who}`);
  });
  next();
});

// Lazy-initialize OpenAI so a missing key doesn't crash startup
let _openai = null;
function getOpenAI() {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

// Build the admin Supabase client only when credentials are present.
// If missing, every route that calls requireUser() will return a clear
// 503 instead of making a network call to a non-existent host.
const supabaseAdmin = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;
const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });

// Expose supabaseAdmin to admin routes via app.locals
app.locals.supabaseAdmin = supabaseAdmin;

// ── Admin dashboard (no CORS, session-protected) ──────────────────────────────
// Must be mounted BEFORE the global requireUser middleware so admin pages
// can use their own cookie-based session instead of a Bearer token.
app.use("/admin", adminRouter);

// In-memory upload handling for sermon audio — files are transcribed and
// discarded immediately, never written to disk. Cap keeps a single request
// from exhausting server memory on a long recording.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } });

// ── Feature flag guard — returns 503 when a feature is disabled by admin ──────
function requireFlag(flag) {
  return (req, res, next) => {
    if (!adminBus.isEnabled(flag)) {
      return res.status(503).json({
        error: `This feature is currently disabled by the system administrator.`,
        feature: flag,
        disabled: true,
      });
    }
    next();
  };
}

// Verify the caller's Supabase access token and attach the user to the request.
async function requireUser(req, res, next) {
  if (!supabaseAdmin) {
    return res.status(503).json({
      error: "Authentication unavailable: server is missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY environment variables. Contact the administrator.",
    });
  }
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: "Invalid or expired session" });
  req.user = data.user;
  next();
}

// ──────────────────────────────────────────────
// Health & landing
// ──────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "the-living-olive-api" });
});

app.get("/", (_req, res) => {
  res.type("html").send(`
    <html>
      <head><title>The Living Olive API</title></head>
      <body style="font-family: system-ui; padding: 2rem; max-width: 640px; margin: auto;">
        <h1>🫒 The Living Olive — backend API</h1>
        <p>This is the backend service. The mobile app is <strong>The Living Olive</strong>,
        running in the <strong>"Mobile (Expo)"</strong> workflow.</p>
        <p>Health: <a href="/health">/health</a></p>
      </body>
    </html>
  `);
});

// ──────────────────────────────────────────────
// Bible text (KJV local + other versions via bible-api.com)
// Supported free versions: kjv, web (World English Bible), asv (Am. Standard)
// ──────────────────────────────────────────────

// Map bible-api.com verse format to our string-array format
async function fetchBibleApiChapter(bookName, chapter, translation) {
  // Build a sanitized book name for the URL (e.g. "1 Samuel" → "1+samuel")
  const encodedBook = encodeURIComponent(bookName.toLowerCase().replace(/ /g, "+"));
  const url = `https://bible-api.com/${encodedBook}+${chapter}?translation=${translation}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`bible-api.com returned ${res.status} for ${bookName} ${chapter}`);
  const json = await res.json();
  if (!json.verses?.length) throw new Error("No verse data returned");
  // Return an array of verse texts indexed by verse number (1-based, index 0 = verse 1)
  const maxVerse = Math.max(...json.verses.map((v) => v.verse));
  const verses = Array(maxVerse).fill("");
  for (const v of json.verses) {
    verses[v.verse - 1] = v.text.trim();
  }
  return verses;
}

app.get("/api/bible/books", (req, res) => {
  if (!adminBus.isEnabled("bible_reader")) {
    return res.status(503).json({ error: "Bible reader is currently disabled by the system administrator.", disabled: true });
  }
  res.set("Cache-Control", "public, max-age=86400");
  res.json(bibleIndex);
});

app.get("/api/bible/:bookId/:chapter", async (req, res) => {
  if (!adminBus.isEnabled("bible_reader")) {
    return res.status(503).json({ error: "Bible reader is currently disabled by the system administrator.", disabled: true });
  }
  const bookId = parseInt(req.params.bookId, 10);
  const chapter = parseInt(req.params.chapter, 10);
  const version = (req.query.version || "KJV").toString().toUpperCase();
  const meta = bibleIndex.find((b) => b.id === bookId);
  if (!meta) return res.status(404).json({ error: "Unknown book" });

  // KJV is served from local data
  if (version === "KJV") {
    try {
      const chapters = loadBibleBook(bookId);
      const verses = chapters[chapter - 1];
      if (!verses) return res.status(404).json({ error: "Unknown chapter" });
      res.set("Cache-Control", "public, max-age=86400");
      return res.json({ bookId, bookName: meta.name, chapter, version: "KJV", verses });
    } catch (err) {
      console.error("bible chapter error:", err);
      return res.status(500).json({ error: "Failed to load chapter" });
    }
  }

  // Other versions: proxy to bible-api.com (free, public-domain versions)
  // Supported: WEB (World English Bible), ASV (American Standard Version)
  if (!adminBus.isEnabled("translation_switcher")) {
    // Fall back to KJV when translation switcher is disabled by admin
    try {
      const chapters = loadBibleBook(bookId);
      const verses = chapters[chapter - 1];
      if (!verses) return res.status(404).json({ error: "Unknown chapter" });
      res.set("Cache-Control", "public, max-age=86400");
      return res.json({ bookId, bookName: meta.name, chapter, version: "KJV", verses, fallback: true, fallbackReason: "Translation switcher is currently disabled" });
    } catch { return res.status(500).json({ error: "Failed to load chapter" }); }
  }
  const translationMap = { WEB: "web", ASV: "asv" };
  const translation = translationMap[version];
  if (!translation) {
    return res.status(400).json({
      error: `Version "${version}" is not available. Supported: KJV, WEB, ASV`,
    });
  }

  try {
    const verses = await fetchBibleApiChapter(meta.name, chapter, translation);
    res.set("Cache-Control", "public, max-age=86400");
    res.json({ bookId, bookName: meta.name, chapter, version, verses });
  } catch (err) {
    console.error("bible-api.com error:", err);
    // Fall back to KJV if the external API fails
    try {
      const chapters = loadBibleBook(bookId);
      const verses = chapters[chapter - 1];
      if (!verses) return res.status(404).json({ error: "Unknown chapter" });
      res.set("Cache-Control", "public, max-age=3600");
      return res.json({
        bookId,
        bookName: meta.name,
        chapter,
        version: "KJV",
        verses,
        fallback: true,
        fallbackReason: "External version API unavailable; showing KJV",
      });
    } catch {
      return res.status(500).json({ error: "Failed to load chapter" });
    }
  }
});

// ──────────────────────────────────────────────
// Algorithmic verse explanation — no LLM, no GPU
// Uses the verseExplainEngine (Free Dictionary API + Markov chains +
// scraped teaching context + cross-references). Same response shape as
// before so the mobile app needs no changes.
// ──────────────────────────────────────────────
app.post("/api/ai/explain-verse", requireUser, requireFlag("verse_explain"), async (req, res) => {
  try {
    const { reference, text, version } = req.body;
    if (!reference || !text) return res.status(400).json({ error: "reference and text are required" });

    const result = await explainVerse({ reference, text, version }, supabaseAdmin);

    // Kick off a background teaching-context fetch for this verse if not
    // already cached — enriches the next explanation without delaying this one
    fetchTeachingContextForVerse(reference, supabaseAdmin).catch(() => {});

    res.json(result);
  } catch (err) {
    log.error("explain-verse error:", err.message);
    res.status(500).json({ error: "Failed to generate explanation" });
  }
});

// User can rate an explanation (1-5 stars) — drives the explanation engine's
// self-learning loop via verseExplainEngine.recordExplanationFeedback.
app.post("/api/ai/explain-verse/feedback", requireUser, requireFlag("verse_explain"), async (req, res) => {
  try {
    const { verseRef, rating } = req.body;
    if (!verseRef || !rating) return res.status(400).json({ error: "verseRef and rating are required" });
    const r = parseInt(rating, 10);
    if (!Number.isInteger(r) || r < 1 || r > 5) return res.status(400).json({ error: "rating must be 1-5" });

    recordExplanationFeedback(verseRef, r);

    // 1. Persist to generation_feedback for the unified audit trail.
    const { error: feedbackError } = await supabaseAdmin.from("generation_feedback").insert({
      user_id: req.user.id,
      entry_type: "explanation",
      category: "explanation",
      verse_ref: verseRef,
      rating: r,
      source_text: null,
    });
    if (feedbackError) {
      log.warn(`explain-verse feedback insert failed for ${verseRef}:`, feedbackError.message);
      return res.status(500).json({ error: "Failed to record feedback" });
    }

    // 2. Increment learning counters in verse_explanations directly via the
    // service-role client (bypasses RLS — no RPC or SECURITY DEFINER needed).
    // Read-then-write: Supabase JS v2 doesn't support column expressions in
    // .update(), so we read the current values first and compute the new ones.
    // Only updates existing rows; never inserts a placeholder with empty text.
    const { data: existing } = await supabaseAdmin
      .from("verse_explanations")
      .select("total_rating, call_count")
      .eq("verse_ref", verseRef)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin.from("verse_explanations").update({
        total_rating: (Number(existing.total_rating) || 0) + r,
        call_count: (Number(existing.call_count) || 0) + 1,
      }).eq("verse_ref", verseRef);
    }

    log.info(`explanation feedback recorded — ref=${verseRef} rating=${r}`);
    res.json({ ok: true });
  } catch (err) {
    log.error("explain-verse/feedback error:", err.message);
    res.status(500).json({ error: "Failed to record feedback" });
  }
});

// ──────────────────────────────────────────────
// AI devotionals
// ──────────────────────────────────────────────
app.post("/api/ai/devotion", requireUser, requireFlag("ai_devotion"), async (req, res) => {
  try {
    const { goal, duration, dayNumber } = req.body;
    if (!goal || !duration) return res.status(400).json({ error: "goal and duration are required" });

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You write warm, Bible-rooted daily devotionals. Every devotional must reference specific scripture (book, chapter, verse) and end with a short reflective prayer. Keep it concise: suitable for a 3-5 minute read.",
        },
        {
          role: "user",
          content: `Write a devotional for someone pursuing this spiritual goal: "${goal}", as part of a ${duration} devotion plan${dayNumber ? ` (day ${dayNumber})` : ""}. Respond in JSON with keys "title", "scriptureReference", "scriptureText", "body", and "closingPrayer".`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = JSON.parse(completion.choices[0].message.content);

    // Send a push notification to the user (non-blocking)
    sendPushToUser(req.user.id, {
      title: "New Devotion Ready 🌿",
      body: content.title ?? "Your devotional is ready",
    }).catch((e) => console.warn("push send failed:", e.message));

    res.json(content);
  } catch (err) {
    console.error("devotion error:", err);
    res.status(500).json({ error: "Failed to generate devotion" });
  }
});

// ──────────────────────────────────────────────
// AI prayer
// ──────────────────────────────────────────────
app.post("/api/ai/prayer", requireUser, requireFlag("ai_prayer"), async (req, res) => {
  try {
    const { desires, count, type } = req.body;
    if (!desires || !type) return res.status(400).json({ error: "desires and type are required" });
    const n = Math.min(Math.max(parseInt(count, 10) || 1, 1), 10);

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You write powerful, Bible-rooted prayers appropriate to the requested prayer type (e.g. Warfare, Adoration, Intercession, Thanksgiving, Petition). Each prayer point should reference or allude to relevant scripture.",
        },
        {
          role: "user",
          content: `Generate ${n} ${type} prayer point(s) for someone whose heart's desire is: "${desires}". Respond in JSON with key "prayerPoints" as an array of {title, prayerText, scriptureReference}.`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = JSON.parse(completion.choices[0].message.content);

    // Send a push notification to the user (non-blocking)
    sendPushToUser(req.user.id, {
      title: "Prayer Points Ready 🙏",
      body: `Your ${type} prayer points have been generated`,
    }).catch((e) => console.warn("push send failed:", e.message));

    res.json(content);
  } catch (err) {
    console.error("prayer error:", err);
    res.status(500).json({ error: "Failed to generate prayer" });
  }
});

// ──────────────────────────────────────────────
// Rule-based prayer/devotion engine — fully autonomous, no LLM/GPU.
// Runs entirely on curated scripture + keyword matching (see lib/prayerEngine.js);
// self-improves from feedback via lib/scheduler.js. Separate from the
// OpenAI-based /api/ai/prayer and /api/ai/devotion routes above, which stay
// as-is since they're already used elsewhere in the app.
// ──────────────────────────────────────────────
app.post("/api/prayer-engine/prayer", requireUser, requireFlag("rule_prayer"), async (req, res) => {
  try {
    const { desires, count, type } = req.body;
    if (!desires) return res.status(400).json({ error: "desires is required" });

    const { prayerPoints, detectedCategory, uncuratedVerses } = generatePrayerPoints({
      desires,
      type,
      count,
      weights: getWeights(),
    });

    sendPushToUser(req.user.id, {
      title: "Prayer Points Ready 🙏",
      body: `Your ${detectedCategory} prayer points have been generated`,
    }).catch((e) => console.warn("push send failed:", e.message));

    // Log uncurated verses used — auto-discovery loop picks them up daily
    if (uncuratedVerses?.length) {
      console.info(`[prayer-engine] ${uncuratedVerses.length} uncurated verse(s) used (candidates for auto-discovery):`, uncuratedVerses.map(v => v.ref).join(", "));
    }

    res.json({ prayerPoints, detectedCategory, engine: "rule-based" });
  } catch (err) {
    console.error("prayer-engine/prayer error:", err);
    res.status(500).json({ error: "Failed to generate prayer" });
  }
});

app.post("/api/prayer-engine/devotion", requireUser, requireFlag("rule_devotion"), async (req, res) => {
  try {
    const { goal, dayNumber } = req.body;
    if (!goal) return res.status(400).json({ error: "goal is required" });

    const content = generateDevotional({ goal, dayNumber, weights: getWeights() });

    sendPushToUser(req.user.id, {
      title: "New Devotion Ready 🌿",
      body: content.title,
    }).catch((e) => console.warn("push send failed:", e.message));

    res.json({ ...content, engine: "rule-based" });
  } catch (err) {
    console.error("prayer-engine/devotion error:", err);
    res.status(500).json({ error: "Failed to generate devotion" });
  }
});

// Lets the app collect a 1-5 star rating on a generated prayer point or
// devotional; this is what actually drives the "self-evolving" behavior —
// see lib/scheduler.js for how it's applied.
app.post("/api/prayer-engine/feedback", requireUser, requireFlag("rule_prayer"), async (req, res) => {
  try {
    const { entryType, category, verseRef, rating, sourceText } = req.body;
    if (!entryType || !category || !rating) {
      return res.status(400).json({ error: "entryType, category, and rating are required" });
    }
    if (!["prayer", "devotion"].includes(entryType)) {
      return res.status(400).json({ error: "entryType must be 'prayer' or 'devotion'" });
    }
    const r = parseInt(rating, 10);
    if (!Number.isInteger(r) || r < 1 || r > 5) {
      return res.status(400).json({ error: "rating must be an integer 1-5" });
    }

    await recordFeedback(supabaseAdmin, {
      userId: req.user.id,
      entryType,
      category,
      verseRef,
      rating: r,
      sourceText,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("prayer-engine/feedback error:", err);
    res.status(500).json({ error: "Failed to record feedback" });
  }
});

// ──────────────────────────────────────────────
// Sermon recording transcription
// ──────────────────────────────────────────────
app.post("/api/ai/transcribe", requireUser, requireFlag("sermon_transcription"), upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "audio file is required" });

    const audioFile = await toFile(req.file.buffer, req.file.originalname || "sermon.m4a");
    const transcription = await getOpenAI().audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
    });

    const rawText = transcription.text?.trim();
    if (!rawText) return res.status(422).json({ error: "Couldn't hear any speech in that recording" });

    // Clean up into readable, paragraphed sermon notes rather than a raw
    // wall of transcript text.
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You format raw sermon transcripts into clean, readable notes: fix obvious transcription errors, break into logical paragraphs, and add a short title. Do not add content that wasn't said. Respond in JSON with keys \"title\" (short, string) and \"formattedText\" (string, paragraphs separated by blank lines).",
        },
        { role: "user", content: rawText },
      ],
      response_format: { type: "json_object" },
    });

    const { title, formattedText } = JSON.parse(completion.choices[0].message.content);
    res.json({ title: title || "Sermon Recording", formattedText: formattedText || rawText, rawText });
  } catch (err) {
    console.error("transcribe error:", err);
    res.status(500).json({ error: "Failed to transcribe recording" });
  }
});

// ──────────────────────────────────────────────
// Push notification token registration
// ──────────────────────────────────────────────
app.post("/api/push/register", requireUser, requireFlag("push_notifications"), async (req, res) => {
  try {
    const { token, platform } = req.body;
    if (!token) return res.status(400).json({ error: "token is required" });

    // Validate it looks like an Expo push token or a native FCM/APNs token
    if (!Expo.isExpoPushToken(token) && !token.startsWith("ExponentPushToken")) {
      // Still store it — could be a native token for a standalone build
    }

    const { error } = await supabaseAdmin
      .from("push_tokens")
      .upsert(
        { user_id: req.user.id, token, platform: platform ?? null, updated_at: new Date().toISOString() },
        { onConflict: "user_id,token" }
      );

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error("push/register error:", err);
    res.status(500).json({ error: "Failed to register push token" });
  }
});

// ──────────────────────────────────────────────
// Helper: send push to a single user (all their devices)
// ──────────────────────────────────────────────
async function sendPushToUser(userId, { title, body, data }) {
  if (!supabaseAdmin) return; // no-op when Supabase is unconfigured
  const { data: rows, error } = await supabaseAdmin
    .from("push_tokens")
    .select("token")
    .eq("user_id", userId);
  if (error || !rows?.length) return;

  const messages = rows
    .filter((r) => Expo.isExpoPushToken(r.token))
    .map((r) => ({ to: r.token, sound: "default", title, body, data: data ?? {} }));

  if (!messages.length) return;

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (err) {
      console.warn("expo push chunk failed:", err.message);
    }
  }
}

// ──────────────────────────────────────────────
// Scheduled notification dispatch
// Called by an external cron service (e.g. cron-job.org, UptimeRobot) every minute.
// Requires X-Cron-Secret header = CRON_SECRET env var.
// ──────────────────────────────────────────────
app.post("/api/push/notify-scheduled", async (req, res) => {
  if (!adminBus.isEnabled("push_notifications")) {
    return res.status(503).json({ error: "Push notifications are currently disabled by the system administrator.", disabled: true });
  }
  if (!supabaseAdmin) {
    return res.status(503).json({ error: "Database unavailable: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured." });
  }
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers["x-cron-secret"] !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Get current UTC time HH:MM
    const now = new Date();
    const hh = String(now.getUTCHours()).padStart(2, "0");
    const mm = String(now.getUTCMinutes()).padStart(2, "0");
    const timeWindow = `${hh}:${mm}`;

    // Find active devotion plans whose preferred_time matches this minute
    const { data: devotionPlans } = await supabaseAdmin
      .from("devotion_plans")
      .select("user_id, goal, duration")
      .eq("active", true)
      .gte("preferred_time", `${timeWindow}:00`)
      .lt("preferred_time", `${timeWindow}:59`);

    // Find active prayer plans whose preferred_time matches this minute
    const { data: prayerPlans } = await supabaseAdmin
      .from("prayer_plans")
      .select("user_id, desires, prayer_type")
      .eq("active", true)
      .gte("preferred_time", `${timeWindow}:00`)
      .lt("preferred_time", `${timeWindow}:59`);

    const sent = [];

    for (const plan of devotionPlans ?? []) {
      await sendPushToUser(plan.user_id, {
        title: "Time for your devotion 🌿",
        body: `Continue your "${plan.goal}" devotion plan`,
        data: { screen: "Devotions" },
      });
      sent.push({ type: "devotion", userId: plan.user_id });
    }

    for (const plan of prayerPlans ?? []) {
      await sendPushToUser(plan.user_id, {
        title: "Time to pray 🙏",
        body: `Your ${plan.prayer_type} prayer time`,
        data: { screen: "Prayer" },
      });
      sent.push({ type: "prayer", userId: plan.user_id });
    }

    res.json({ ok: true, sent: sent.length, time: timeWindow });
  } catch (err) {
    console.error("notify-scheduled error:", err);
    res.status(500).json({ error: "Scheduler error" });
  }
});

// ──────────────────────────────────────────────
// JSON-only 404 + error handling for every /api/* route.
// Without this, an unmatched route or an uncaught exception falls through
// to Express's default HTML error page, which the mobile app would render
// as raw markup instead of a clean error message.
// ──────────────────────────────────────────────
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
});

// ──────────────────────────────────────────────
// Server start
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  log.info(`The Living Olive API listening on port ${PORT}`);
});

// Starts the rule-based prayer engine's self-learning cron jobs inside this
// same process — see lib/scheduler.js. Runs regardless of OpenAI key
// presence since it needs none. All of its activity (web crawl runs,
// genetic-algorithm generations, keyword learning) logs to stdout the same
// way, so it's visible in `railway logs` right alongside API traffic.
startPrayerEngineScheduler(supabaseAdmin).catch((e) =>
  log.warn("prayer-engine scheduler failed to start:", e.message)
);
