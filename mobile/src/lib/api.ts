import { supabase } from "./supabase";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

function requireApiUrl() {
  if (!API_URL) {
    throw new Error(
      "EXPO_PUBLIC_API_URL is not set. Point it at the running backend server."
    );
  }
  return API_URL;
}

async function authedFetch(path: string, body: unknown) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You need to be signed in to use this feature.");
  const res = await fetch(`${requireApiUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Request failed (${res.status}): ${errText}`);
  }
  return res.json();
}

// ─── Bible ────────────────────────────────────────────────────────────────────

export type BibleBookMeta = { id: number; name: string; chapterCount: number };

export async function fetchBibleBooks(): Promise<BibleBookMeta[]> {
  const res = await fetch(`${requireApiUrl()}/api/bible/books`);
  if (!res.ok) throw new Error(`Failed to load Bible books (${res.status})`);
  return res.json();
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
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load chapter (${res.status})`);
  return res.json();
}

// ─── AI features ──────────────────────────────────────────────────────────────

export type VerseExplanation = {
  explanation: string;
  supportingScriptures: { reference: string; note: string }[];
};

export function explainVerse(input: { reference: string; text: string; version: string }) {
  return authedFetch("/api/ai/explain-verse", input) as Promise<VerseExplanation>;
}

export type DevotionResult = {
  title: string;
  scriptureReference: string;
  scriptureText: string;
  body: string;
  closingPrayer: string;
};

export function generateDevotion(input: { goal: string; duration: string; dayNumber?: number }) {
  return authedFetch("/api/ai/devotion", input) as Promise<DevotionResult>;
}

export type PrayerResult = {
  prayerPoints: { title: string; prayerText: string; scriptureReference: string }[];
};

export function generatePrayer(input: { desires: string; count: number; type: string }) {
  return authedFetch("/api/ai/prayer", input) as Promise<PrayerResult>;
}

// ─── Push notifications ────────────────────────────────────────────────────────

export async function registerPushToken(token: string, platform?: string): Promise<void> {
  if (!API_URL) return; // silently skip if API not configured
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
