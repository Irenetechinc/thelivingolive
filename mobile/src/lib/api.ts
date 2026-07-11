import { supabase } from "./supabase";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

async function authedFetch(path: string, body: unknown) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("You need to be signed in to use this feature.");
  }
  if (!API_URL) {
    throw new Error(
      "EXPO_PUBLIC_API_URL is not set. Point it at the running backend server (see mobile/.env.example)."
    );
  }
  const res = await fetch(`${API_URL}${path}`, {
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
