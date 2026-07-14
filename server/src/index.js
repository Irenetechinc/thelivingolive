import express from "express";
import cors from "cors";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { Expo } from "expo-server-sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

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

const requiredEnv = ["OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.warn(`Missing environment variable: ${key} — some features will be unavailable`);
  }
}

const app = express();
app.use(cors());
app.use(express.json());

// Lazy-initialize OpenAI so a missing key doesn't crash startup
let _openai = null;
function getOpenAI() {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL ?? "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "placeholder",
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });

// Verify the caller's Supabase access token and attach the user to the request.
async function requireUser(req, res, next) {
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

app.get("/api/bible/books", (_req, res) => {
  res.set("Cache-Control", "public, max-age=86400");
  res.json(bibleIndex);
});

app.get("/api/bible/:bookId/:chapter", async (req, res) => {
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
// AI verse explanation
// ──────────────────────────────────────────────
app.post("/api/ai/explain-verse", requireUser, async (req, res) => {
  try {
    const { reference, text, version } = req.body;
    if (!reference || !text) return res.status(400).json({ error: "reference and text are required" });

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a thoughtful, doctrinally careful Bible study assistant. Explain verses clearly, in plain language, and always ground your explanation in supporting scripture references. Avoid denominational bias where possible. Keep responses focused and well-organized.",
        },
        {
          role: "user",
          content: `Explain ${reference} (${version || "KJV"}): "${text}"\n\nProvide:\n1. A clear explanation of the meaning and context.\n2. 2-4 supporting scripture references (with brief context) that illuminate this verse.\n\nRespond in JSON with keys "explanation" (string) and "supportingScriptures" (array of {reference, note}).`,
        },
      ],
      response_format: { type: "json_object" },
    });

    res.json(JSON.parse(completion.choices[0].message.content));
  } catch (err) {
    console.error("explain-verse error:", err);
    res.status(500).json({ error: "Failed to generate explanation" });
  }
});

// ──────────────────────────────────────────────
// AI devotionals
// ──────────────────────────────────────────────
app.post("/api/ai/devotion", requireUser, async (req, res) => {
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
app.post("/api/ai/prayer", requireUser, async (req, res) => {
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
// Push notification token registration
// ──────────────────────────────────────────────
app.post("/api/push/register", requireUser, async (req, res) => {
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
  console.log(`The Living Olive API listening on port ${PORT}`);
});
