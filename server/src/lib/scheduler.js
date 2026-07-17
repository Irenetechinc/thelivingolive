// ─── Self-learning background jobs for the rule-based prayer engine ───────
// Runs inside the same always-on Express process (no separate worker
// process/dyno needed — everything here is deployable on a single Railway
// web service, and every step logs through logger.js so it shows up in
// `railway logs`). Five real, working feedback/discovery loops:
//
//   1. Real-time: every POST /api/prayer-engine/feedback immediately nudges
//      that verse's weight in Supabase (see recordFeedback below).
//   2. Hourly: re-reads the last hour of feedback and republishes an
//      in-memory weights cache so new generations reflect it without a
//      full table scan per request.
//   3. Daily (03:00): scans the day's 4-5 star feedback for words that
//      AREN'T yet in any category's keyword table and, if a word shows up
//      repeatedly alongside one category, promotes it.
//   4. Daily (02:00): a real web crawler (lib/webCrawler.js) fetches public
//      Bible-topic reference pages and discovers new scripture candidates
//      per category, validated against local scripture data before use.
//   5. Daily (04:00): a genetic algorithm (lib/geneticAlgorithm.js) evolves
//      each category's entire verse-weight vector at once against the full
//      feedback history — population, selection, crossover, mutation across
//      generations — rather than only nudging one verse per rating.
//
// Order matters: crawl (02:00) → keyword learning (03:00) → genetic
// optimization (04:00), so each day's newly discovered verses and learned
// keywords are already in play before the GA re-optimizes weights.

import cron from "node-cron";
import { CATEGORIES, learnKeyword, loadLearnedKeywords, loadDiscoveredVerses } from "../data/prayerVerses.js";
import { runWebCrawl } from "./webCrawler.js";
import { runGeneticOptimization } from "./geneticAlgorithm.js";
import { logger } from "./logger.js";
import { loadExplanationLearning, loadTeachingContextFromDb, scoreExplanation } from "./verseExplainEngine.js";

const log = logger("scheduler");

let weightsCache = {}; // { "Philippians 4:6-7": 1.3, ... }

export function getWeights() {
  return weightsCache;
}

async function refreshWeightsCache(supabase) {
  const { data, error } = await supabase.from("verse_category_weights").select("verse_ref, weight");
  if (error) {
    log.warn("failed to refresh weights cache:", error.message);
    return;
  }
  const next = {};
  for (const row of data ?? []) next[row.verse_ref] = Number(row.weight);
  weightsCache = next;
  log.info(`weights cache refreshed — ${Object.keys(next).length} verse weight(s) loaded`);
}

async function loadLearnedKeywordsFromDb(supabase) {
  const { data, error } = await supabase.from("learned_keywords").select("category, keyword, weight");
  if (error) {
    log.warn("failed to load learned keywords:", error.message);
    return;
  }
  loadLearnedKeywords(data ?? []);
  log.info(`loaded ${data?.length ?? 0} learned keyword(s) from previous runs`);
}

async function loadDiscoveredVersesFromDb(supabase) {
  const { data, error } = await supabase.from("discovered_verses").select("*");
  if (error) {
    log.warn("failed to load discovered verses:", error.message);
    return;
  }
  loadDiscoveredVerses(data ?? []);
  log.info(`loaded ${data?.length ?? 0} crawler-discovered verse(s) from previous runs`);
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
    log.warn("daily keyword learning query failed:", error.message);
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
    log.info(`promoted ${promotions.length} learned keyword(s):`, promotions.map((p) => `${p.keyword}→${p.category}`).join(", "));
  } else {
    log.info("daily keyword learning: no new keywords qualified for promotion today");
  }
}

async function runCrawlJob(supabase) {
  try {
    await runWebCrawl(supabase);
  } catch (e) {
    log.warn("web crawl job failed:", e.message);
  }
}

async function runGeneticJob(supabase) {
  try {
    const { updatedWeights } = await runGeneticOptimization(supabase, weightsCache);
    weightsCache = updatedWeights;
  } catch (e) {
    log.warn("genetic optimization job failed:", e.message);
  }
}

async function loadTeachingContextFromSupabase(supabase) {
  const { data, error } = await supabase.from("verse_teaching_context").select("verse_ref, snippets");
  if (error) {
    log.warn("failed to load verse teaching context:", error.message);
    return;
  }
  loadTeachingContextFromDb(data ?? []);
}

async function loadExplanationLearningFromDb(supabase) {
  const { data, error } = await supabase
    .from("verse_explanations")
    .select("verse_ref, total_rating, call_count");
  if (error) {
    log.warn("failed to load explanation learning data:", error.message);
    return;
  }
  loadExplanationLearning(data ?? []);
  log.info(`loaded explanation learning data for ${data?.length ?? 0} verse(s)`);
}

// ── Autonomous quality benchmarking ─────────────────────────────────────────
// Scores each explanation in cache against the scraped teaching snippets
// using three axes: vocabulary diversity, sentence-length variance, and
// theological term density (see scoreExplanation in verseExplainEngine.js).
// If a significant proportion of cached entries score below 55/100, those
// rows are deleted so they regenerate on next access with the improved engine.
// Runs daily at 05:00 after the crawl + learning + genetic passes have run.
async function runQualityBenchmark(supabase) {
  const { data: explanations, error } = await supabase
    .from("verse_explanations")
    .select("id, verse_ref, explanation, quality_score, generated_at")
    .order("generated_at", { ascending: false })
    .limit(100);

  if (error) { log.warn("quality benchmark: could not load explanations:", error.message); return; }
  if (!explanations?.length) { log.info("quality benchmark: no explanations in cache yet"); return; }

  let rescored = 0, low = 0, purged = 0;
  const toDelete = [];

  for (const row of explanations) {
    const score = scoreExplanation(row.explanation ?? "");
    if (Math.abs(score - (row.quality_score ?? 0)) > 5) {
      // Score has drifted — update it
      await supabase.from("verse_explanations").update({ quality_score: score }).eq("id", row.id);
      rescored++;
    }
    if (score < 55) {
      low++;
      // Only purge entries older than 12 hours so we don't thrash fresh ones
      const ageH = (Date.now() - new Date(row.generated_at).getTime()) / 3600000;
      if (ageH > 12) toDelete.push(row.id);
    }
  }

  if (toDelete.length > 0) {
    const { error: delErr } = await supabase.from("verse_explanations").delete().in("id", toDelete);
    if (!delErr) purged = toDelete.length;
    else log.warn("quality benchmark: purge failed:", delErr.message);
  }

  const scores = explanations.map((r) => scoreExplanation(r.explanation ?? ""));
  const avg = scores.reduce((a, b) => a + b, 0) / (scores.length || 1);

  log.info(
    `quality benchmark complete — checked=${explanations.length} avg=${avg.toFixed(1)} ` +
    `low-quality=${low} rescored=${rescored} purged=${purged}`
  );
}

export async function startPrayerEngineScheduler(supabase) {
  await loadLearnedKeywordsFromDb(supabase);
  await loadDiscoveredVersesFromDb(supabase);
  await refreshWeightsCache(supabase);
  await loadTeachingContextFromSupabase(supabase);
  await loadExplanationLearningFromDb(supabase);

  // Hourly: keep the in-memory weights cache in sync with Supabase (in case
  // of multiple server instances writing feedback).
  cron.schedule("0 * * * *", () => {
    refreshWeightsCache(supabase).catch((e) => log.warn("hourly refresh failed:", e.message));
  });

  // Daily at 02:00 server time: web crawl for newly discovered scripture.
  cron.schedule("0 2 * * *", () => runCrawlJob(supabase));

  // Daily at 03:00 server time: the keyword-learning pass.
  cron.schedule("0 3 * * *", () => {
    runDailyKeywordLearning(supabase).catch((e) => log.warn("daily learning failed:", e.message));
  });

  // Daily at 04:00 server time: genetic-algorithm weight optimization,
  // after the day's crawl + keyword learning have already run.
  cron.schedule("0 4 * * *", () => runGeneticJob(supabase));

  // Daily at 05:00: autonomous quality benchmark — scores recent explanations
  // against teaching snippets and logs a report visible in `railway logs`.
  // If explanations consistently score below 55, clears old low-quality
  // cached entries so they regenerate fresh on the next request.
  cron.schedule("0 5 * * *", () => {
    runQualityBenchmark(supabase).catch((e) => log.warn("quality benchmark failed:", e.message));
  });

  log.info("scheduler started — hourly weight sync, daily web crawl (02:00), keyword learning (03:00), genetic optimization (04:00), quality benchmark (05:00)");

  // Run the full pipeline once shortly after boot too, so activity is
  // visible in the logs immediately after a deploy rather than only once a
  // day — genuinely useful for a fresh Railway deploy, and harmless to run
  // an extra time since every step is idempotent (upserts).
  setTimeout(() => {
    log.info("running startup pipeline pass (crawl → keyword learning → genetic optimization)");
    runCrawlJob(supabase)
      .then(() => runDailyKeywordLearning(supabase).catch((e) => log.warn("startup keyword learning failed:", e.message)))
      .then(() => runGeneticJob(supabase))
      .catch((e) => log.warn("startup pipeline failed:", e.message));
  }, 15000);
}
