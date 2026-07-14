// ─── Self-learning background jobs for the rule-based prayer engine ───────
// Runs inside the same always-on Express process (no separate worker
// process/dyno needed — this is what makes it deployable on a single
// Railway web service). Three real, working feedback loops:
//
//   1. Real-time: every POST /api/prayer-engine/feedback immediately nudges
//      that verse's weight in Supabase (see recordFeedback below).
//   2. Hourly: re-reads the last hour of feedback and republishes an
//      in-memory weights cache so new generations reflect it without a
//      full table scan per request.
//   3. Daily: scans the day's 4-5 star feedback for words that AREN'T yet
//      in any category's keyword table and, if a word shows up repeatedly
//      alongside one category, promotes it — a small but genuine example
//      of the system improving its own classification over time from real
//      usage, with no LLM involved.
//
// This is intentionally scoped below a full genetic-algorithm / web-crawler
// pipeline (SearXNG, Crawl4AI, etc.) — that would need dedicated
// infrastructure (headless browsers, a job queue, a vector index) that a
// single Railway web dyno can't safely run. If the user wants that tier
// later, it should be a separate worker service, not bolted onto the API
// process.

import cron from "node-cron";
import { CATEGORIES, learnKeyword, loadLearnedKeywords } from "../data/prayerVerses.js";

let weightsCache = {}; // { "Philippians 4:6-7": 1.3, ... }

export function getWeights() {
  return weightsCache;
}

async function refreshWeightsCache(supabase) {
  const { data, error } = await supabase.from("verse_category_weights").select("verse_ref, weight");
  if (error) {
    console.warn("prayer-engine: failed to refresh weights cache:", error.message);
    return;
  }
  const next = {};
  for (const row of data ?? []) next[row.verse_ref] = Number(row.weight);
  weightsCache = next;
}

async function loadLearnedKeywordsFromDb(supabase) {
  const { data, error } = await supabase.from("learned_keywords").select("category, keyword, weight");
  if (error) {
    console.warn("prayer-engine: failed to load learned keywords:", error.message);
    return;
  }
  loadLearnedKeywords(data ?? []);
}

// Called synchronously from the feedback endpoint — updates the weight for
// one verse+category pair using a simple bounded exponential update:
// good ratings (4-5) push weight up, poor ratings (1-2) push it down, a
// neutral 3 barely moves it. Bounded to [0.2, 3] so one burst of ratings
// can't make a verse permanently dominate or vanish.
export async function recordFeedback(supabase, { userId, entryType, category, verseRef, rating, sourceText }) {
  await supabase.from("generation_feedback").insert({
    user_id: userId ?? null,
    entry_type: entryType,
    category,
    verse_ref: verseRef ?? null,
    rating,
    source_text: sourceText ?? null,
  });

  if (!verseRef) return;

  const { data: existing } = await supabase
    .from("verse_category_weights")
    .select("weight, rating_count")
    .eq("verse_ref", verseRef)
    .eq("category", category)
    .maybeSingle();

  const currentWeight = existing?.weight ? Number(existing.weight) : 1;
  const delta = (rating - 3) * 0.08; // -0.16 .. +0.16 per rating
  const nextWeight = Math.min(3, Math.max(0.2, currentWeight + delta));

  await supabase.from("verse_category_weights").upsert(
    {
      verse_ref: verseRef,
      category,
      weight: nextWeight,
      rating_count: (existing?.rating_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "verse_ref,category" }
  );

  weightsCache[verseRef] = nextWeight;
}

const STOPWORDS = new Set([
  "the","and","for","that","with","this","have","from","your","you","are","was","will",
  "his","her","them","they","been","who","what","when","about","just","like","can","please",
]);

async function runDailyKeywordLearning(supabase) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("generation_feedback")
    .select("category, rating, source_text")
    .gte("created_at", since)
    .gte("rating", 4)
    .not("source_text", "is", null);

  if (error) {
    console.warn("prayer-engine: daily keyword learning query failed:", error.message);
    return;
  }

  const existingKeywords = new Set();
  for (const cat of CATEGORIES) for (const k of cat.keywords.keys()) existingKeywords.add(k);

  // Count (word, category) co-occurrence across today's well-rated requests.
  const counts = new Map(); // key: `${category}::${word}` -> count
  for (const row of data ?? []) {
    const words = (row.source_text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w) && !existingKeywords.has(w));
    for (const w of words) {
      const key = `${row.category}::${w}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  // Only promote a word if it showed up 3+ times tied to the same category
  // today — a single request shouldn't permanently bias classification.
  const promotions = [];
  for (const [key, count] of counts) {
    if (count >= 3) {
      const [category, keyword] = key.split("::");
      promotions.push({ category, keyword, weight: Math.min(2, 1 + count * 0.2) });
    }
  }

  for (const p of promotions) {
    learnKeyword(p.category, p.keyword, p.weight);
    await supabase
      .from("learned_keywords")
      .upsert({ ...p, updated_at: new Date().toISOString() }, { onConflict: "category,keyword" });
  }

  if (promotions.length) {
    console.log(`prayer-engine: promoted ${promotions.length} learned keyword(s):`, promotions.map((p) => `${p.keyword}→${p.category}`).join(", "));
  }
}

export async function startPrayerEngineScheduler(supabase) {
  await loadLearnedKeywordsFromDb(supabase);
  await refreshWeightsCache(supabase);

  // Hourly: keep the in-memory weights cache in sync with Supabase (in case
  // of multiple server instances writing feedback).
  cron.schedule("0 * * * *", () => {
    refreshWeightsCache(supabase).catch((e) => console.warn("prayer-engine hourly refresh failed:", e.message));
  });

  // Daily at 03:00 server time: the keyword-learning pass.
  cron.schedule("0 3 * * *", () => {
    runDailyKeywordLearning(supabase).catch((e) => console.warn("prayer-engine daily learning failed:", e.message));
  });

  console.log("prayer-engine: scheduler started (hourly weight sync, daily keyword learning)");
}
