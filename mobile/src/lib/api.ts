import { supabase } from "./supabase";

// The Living Olive backend, deployed independently of Replit (Railway,
// behind this custom domain). This is the single source of truth for every
// build — dev, EAS preview/production — so the app never depends on a
// Replit-hosted URL. Override with EXPO_PUBLIC_API_URL only for local
// backend development against this same repl.
const PRODUCTION_API_URL = "https://livingolive.adroomai.com";
const API_URL = process.env.EXPO_PUBLIC_API_URL || PRODUCTION_API_URL;

function requireApiUrl() {
  return API_URL;
}

// The server always replies with JSON (including on errors — see the
// global JSON error handler in server/src/index.js). If we ever get
// something else back (an HTML error page from a proxy/CDN in front of the
// backend, a captive portal, etc.) surface a clean message instead of
// dumping markup into the UI.
async function parseJsonResponse(res: Response) {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    if (!res.ok) {
      throw new Error(
        res.status === 404
          ? "The server couldn't be reached. Check your connection and try again."
          : `The server returned an unexpected response (${res.status}). Try again.`
      );
    }
    throw new Error("The server returned an unexpected response. Try again.");
  }
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error || `Request failed (${res.status}).`);
  }
  return json;
}

async function authedFetch(path: string, body: unknown) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You need to be signed in to use this feature.");
  let res: Response;
  try {
    res = await fetch(`${requireApiUrl()}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Couldn't reach the server. Check your internet connection and try again.");
  }
  return parseJsonResponse(res);
}

// ─── Bible ────────────────────────────────────────────────────────────────────

export type BibleBookMeta = { id: number; name: string; chapterCount: number };

export async function fetchBibleBooks(): Promise<BibleBookMeta[]> {
  const res = await fetch(`${requireApiUrl()}/api/bible/books`);
  return parseJsonResponse(res);
}

export async function fetchBibleChapter(
  bookId: number,
  chapter: number,
  version = "KJV"
): Promise<{
  bookId: number;
  bookName: string;
  chapter: number;
  version: string;
  verses: string[];
  fallback?: boolean;
  fallbackReason?: string;
}> {
  const url = `${requireApiUrl()}/api/bible/${bookId}/${chapter}?version=${encodeURIComponent(version)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  return parseJsonResponse(res);
}

// ─── AI features ──────────────────────────────────────────────────────────────

export type VerseExplanation = {
  explanation: string;
  supportingScriptures: { reference: string; note: string }[];
};

export function explainVerse(input: { reference: string; text: string; version: string }) {
  return authedFetch("/api/ai/explain-verse", input) as Promise<VerseExplanation>;
}

export function rateVerseExplanation(input: { verseRef: string; rating: number }) {
  return authedFetch("/api/ai/explain-verse/feedback", input) as Promise<{ ok: boolean }>;
}

export type DevotionResult = {
  title: string;
  scriptureReference: string;
  scriptureText: string;
  body: string;
  closingPrayer: string;
  detectedCategory?: string;
};

// Uses the fully autonomous, rule-based engine (no OpenAI/LLM call, runs
// entirely on curated scripture + keyword matching — see
// server/src/lib/prayerEngine.js) rather than /api/ai/devotion.
export function generateDevotion(input: { goal: string; duration: string; dayNumber?: number }) {
  return authedFetch("/api/prayer-engine/devotion", input) as Promise<DevotionResult>;
}

export type PrayerResult = {
  prayerPoints: { title: string; prayerText: string; scriptureReference: string; category?: string }[];
  detectedCategory?: string;
};

// Uses the fully autonomous, rule-based engine (no OpenAI/LLM call) rather
// than /api/ai/prayer.
export function generatePrayer(input: { desires: string; count: number; type: string }) {
  return authedFetch("/api/prayer-engine/prayer", input) as Promise<PrayerResult>;
}

// Records a 1-5 star rating on a generated prayer point or devotional. This
// is what feeds the engine's self-learning loop (see server/src/lib/scheduler.js):
// ratings nudge that scripture's weight for future selection, and highly
// rated free-text requests feed the daily keyword-learning pass.
export function submitGenerationFeedback(input: {
  entryType: "prayer" | "devotion";
  category: string;
  verseRef?: string;
  rating: number;
  sourceText?: string;
}) {
  return authedFetch("/api/prayer-engine/feedback", input) as Promise<{ ok: boolean }>;
}

// ─── Sermon recording transcription ────────────────────────────────────────────

export type TranscribeResult = { title: string; formattedText: string; rawText: string };

// Uploads a locally-recorded sermon clip and gets back cleaned-up, paragraphed
// notes. Requires connectivity (Whisper runs server-side) — callers are
// expected to queue this and retry when back online (see sermonRecorder.ts).
export async function transcribeSermon(fileUri: string, fileName: string): Promise<TranscribeResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You need to be signed in to use this feature.");

  const form = new FormData();
  form.append("audio", {
    uri: fileUri,
    name: fileName,
    type: "audio/m4a",
  } as any);

  let res: Response;
  try {
    res = await fetch(`${requireApiUrl()}/api/ai/transcribe`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch {
    throw new Error("Couldn't reach the server. Check your internet connection and try again.");
  }
  return parseJsonResponse(res);
}

// ─── Push notifications ────────────────────────────────────────────────────────

export async function registerPushToken(token: string, platform?: string): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) return;
    await fetch(`${API_URL}/api/push/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ token, platform }),
    });
  } catch {
    // Non-fatal — local notifications are still active
  }
}
