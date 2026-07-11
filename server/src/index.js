import express from "express";
import cors from "cors";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const requiredEnv = ["OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
  }
}

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Verify the caller's Supabase access token and attach the user to the request.
async function requireUser(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
  req.user = data.user;
  next();
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "the-living-olive-api" });
});

app.get("/", (_req, res) => {
  res.type("html").send(`
    <html>
      <head><title>The Living Olive API</title></head>
      <body style="font-family: system-ui; padding: 2rem; max-width: 640px; margin: auto;">
        <h1>🫒 The Living Olive — backend API</h1>
        <p>This is the backend service (OpenAI proxy). There's no web UI here —
        the actual app is <strong>The Living Olive</strong> mobile app, running
        in the <strong>"Mobile (Expo)"</strong> workflow.</p>
        <p>Open that workflow's console, scan the QR code with the
        <strong>Expo Go</strong> app on your phone, and the app will load there.</p>
        <p>Health check: <a href="/health">/health</a></p>
      </body>
    </html>
  `);
});

// AI verse explanation with supporting scriptures
app.post("/api/ai/explain-verse", requireUser, async (req, res) => {
  try {
    const { reference, text, version } = req.body;
    if (!reference || !text) {
      return res.status(400).json({ error: "reference and text are required" });
    }

    const completion = await openai.chat.completions.create({
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

    const content = JSON.parse(completion.choices[0].message.content);
    res.json(content);
  } catch (err) {
    console.error("explain-verse error:", err);
    res.status(500).json({ error: "Failed to generate explanation" });
  }
});

// AI-generated devotional based on user goals
app.post("/api/ai/devotion", requireUser, async (req, res) => {
  try {
    const { goal, duration, dayNumber } = req.body;
    if (!goal || !duration) {
      return res.status(400).json({ error: "goal and duration are required" });
    }

    const completion = await openai.chat.completions.create({
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
    res.json(content);
  } catch (err) {
    console.error("devotion error:", err);
    res.status(500).json({ error: "Failed to generate devotion" });
  }
});

// AI-generated prayer based on heart desires and prayer type
app.post("/api/ai/prayer", requireUser, async (req, res) => {
  try {
    const { desires, count, type } = req.body;
    if (!desires || !type) {
      return res.status(400).json({ error: "desires and type are required" });
    }
    const n = Math.min(Math.max(parseInt(count, 10) || 1, 1), 10);

    const completion = await openai.chat.completions.create({
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
    res.json(content);
  } catch (err) {
    console.error("prayer error:", err);
    res.status(500).json({ error: "Failed to generate prayer" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`The Living Olive API listening on port ${PORT}`);
});
