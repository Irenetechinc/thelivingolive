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
import { CATEGORIES, learnKeyword, loadLearnedKeywords, loadDiscoveredVerses, addDiscoveredVerse, VERSE_BANK } from "../data/prayerVerses.js";
import { runWebCrawl } from "./webCrawler.js";
import { runGeneticOptimization } from "./geneticAlgorithm.js";
import { logger } from "./logger.js";
import { loadExplanationLearning, loadTeachingContextFromDb, scoreExplanation } from "./verseExplainEngine.js";
import { getBibleIndex, warmBibleIndex } from "./bibleIndex.js";
import { getMarkov, warmMarkov } from "./markovBible.js";
import { adminBus } from "./adminBus.js";

const log = logger("scheduler");

let weightsCache = {}; // { "Philippians 4:6-7": 1.3, ... }

export function getWeights() {
  return weightsCache;
}

async function refreshWeightsCache(supabase) {
  adminBus.agentStart("weightSync", "Refreshing verse weights from Supabase…");
  const { data, error } = await supabase.from("verse_category_weights").select("verse_ref, weight");
  if (error) {
    log.warn("failed to refresh weights cache:", error.message);
    adminBus.agentError("weightSync", `Weight refresh failed: ${error.message}`);
    return;
  }
  const next = {};
  for (const row of data ?? []) next[row.verse_ref] = Number(row.weight);
  weightsCache = next;
  log.info(`weights cache refreshed — ${Object.keys(next).length} verse weight(s) loaded`);
  adminBus.agentDone("weightSync", `${Object.keys(next).length} verse weights loaded`);
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
  adminBus.agentStart("keywordLearner", "Scanning 24h feedback for new keyword patterns…");
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("generation_feedback")
    .select("category, rating, source_text")
    .gte("created_at", since)
    .gte("rating", 4)
    .not("source_text", "is", null);

  if (error) {
    log.warn("daily keyword learning query failed:", error.message);
    adminBus.agentError("keywordLearner", `Query failed: ${error.message}`);
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
    adminBus.agentDone("keywordLearner", `Promoted ${promotions.length} keyword(s): ${promotions.slice(0,3).map(p=>`${p.keyword}→${p.category}`).join(", ")}${promotions.length>3?'…':''}`);
  } else {
    log.info("daily keyword learning: no new keywords qualified for promotion today");
    adminBus.agentDone("keywordLearner", "No new keywords qualified for promotion today");
  }
}

async function runCrawlJob(supabase) {
  adminBus.agentStart("webCrawler", "Starting web crawl across 37 scripture topic pages…");
  try {
    await runWebCrawl(supabase);
    adminBus.agentDone("webCrawler", "Web crawl complete — verse candidates updated");
  } catch (e) {
    log.warn("web crawl job failed:", e.message);
    adminBus.agentError("webCrawler", `Crawl failed: ${e.message}`);
  }
}

async function runGeneticJob(supabase) {
  adminBus.agentStart("geneticAlgorithm", "Running 40-generation genetic optimization on verse weights…");
  try {
    adminBus.agentProgress("geneticAlgorithm", "Building population from feedback history…");
    const { updatedWeights } = await runGeneticOptimization(supabase, weightsCache);
    weightsCache = updatedWeights;
    adminBus.agentDone("geneticAlgorithm", `Optimized ${Object.keys(updatedWeights).length} verse weights via genetic algorithm`);
  } catch (e) {
    log.warn("genetic optimization job failed:", e.message);
    adminBus.agentError("geneticAlgorithm", `Genetic optimization failed: ${e.message}`);
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

// ── Auto-discovery: promote highly-rated uncurated verses into verse bank ────
// Runs daily at 06:00, after crawl+learning+genetics have all run.
// For every prayer_entries row with a high rating whose verse_ref is NOT in
// the hand-curated bank, we check whether the full-Bible index can validate it
// (i.e. the verse actually exists in the local KJV data) and then upsert it
// into discovered_verses so it becomes available to future prayer generation.
// This means the system grows its verse bank automatically from the prayers
// users actually liked — not just from what the web crawler happened to find.
const CURATED_REFS_SET = new Set(VERSE_BANK.map(v => v.ref));

async function runAutoDiscovery(supabase) {
  adminBus.agentStart("autoDiscovery", "Scanning 7-day feedback for highly-rated uncurated verses…");
  log.info("auto-discovery: scanning for highly-rated uncurated verses...");
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // last 7 days
  const { data: feedback, error } = await supabase
    .from("generation_feedback")
    .select("verse_ref, category, rating")
    .gte("created_at", since)
    .gte("rating", 4)
    .not("verse_ref", "is", null);

  if (error) { log.warn("auto-discovery: feedback query failed:", error.message); adminBus.agentError("autoDiscovery", `Query failed: ${error.message}`); return; }

  // Count high-rated appearances per (verse_ref, category)
  const counts = new Map(); // `${ref}::${cat}` → count
  for (const row of feedback ?? []) {
    if (!row.verse_ref || CURATED_REFS_SET.has(row.verse_ref)) continue;
    const key = `${row.verse_ref}::${row.category}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const idx = getBibleIndex();
  if (!idx.isBuilt) { log.info("auto-discovery: index not ready, skipping"); adminBus.agentDone("autoDiscovery", "Bible index not ready — skipped"); return; }

  let added = 0;
  for (const [key, count] of counts) {
    if (count < 2) continue; // need at least 2 independent high ratings
    const [ref, category] = key.split("::");
    const entry = idx.byRef(ref);
    if (!entry) continue; // can't validate — skip

    // Add to in-memory pool
    const didAdd = addDiscoveredVerse({
      ref, bookId: entry.bookId, chapter: entry.ch,
      verseStart: entry.v, category,
      keywords: [], source: "auto-discovery",
    });
    if (!didAdd) continue; // already known

    // Persist to Supabase
    await supabase.from("discovered_verses").upsert(
      {
        ref, category, book_id: entry.bookId,
        chapter: entry.ch, verse_start: entry.v,
        keywords: [], source: "auto-discovery",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "ref,category" }
    ).then(({ error: e }) => { if (e) log.warn(`auto-discovery: upsert failed for ${ref}:`, e.message); });
    added++;
    log.info(`auto-discovery: promoted ${ref} → ${category} (${count} high ratings)`);
  }

  log.info(`auto-discovery complete — ${added} new verse(s) added to bank`);
  adminBus.agentDone("autoDiscovery", `${added} uncurated verse(s) promoted to permanent bank`);
}

// ── Pool-level feedback learner ──────────────────────────────────────────────
// Tracks which prayer quality scores correlate with which verses across
// the feedback table. Verses that consistently appear in high-quality prayers
// (high quality_score in prayer_entries) get an additional weight nudge on
// top of the genetic algorithm, reinforcing agreement between the two loops.
async function runPrayerQualitySync(supabase) {
  adminBus.agentStart("qualitySync", "Syncing prayer quality scores → verse weight nudges…");
  const { data, error } = await supabase
    .from("prayer_entries")
    .select("scripture_reference, quality_score")
    .not("quality_score", "is", null)
    .gte("quality_score", 70)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) { log.warn("prayer quality sync failed:", error.message); adminBus.agentError("qualitySync", `Query failed: ${error.message}`); return; }

  const verseQuality = new Map(); // ref → {sum, count}
  for (const row of data ?? []) {
    const r = row.scripture_reference;
    if (!r) continue;
    const prev = verseQuality.get(r) ?? { sum: 0, count: 0 };
    verseQuality.set(r, { sum: prev.sum + (row.quality_score / 100), count: prev.count + 1 });
  }

  let nudged = 0;
  for (const [ref, { sum, count }] of verseQuality) {
    if (count < 3) continue; // need sample size
    const avgScore = sum / count; // 0.7 – 1.0 range
    const delta = (avgScore - 0.8) * 0.1; // small nudge, won't dominate GA
    const current = weightsCache[ref] ?? 1;
    const next = Math.min(3, Math.max(0.2, current + delta));
    if (Math.abs(next - current) > 0.01) {
      weightsCache[ref] = next;
      nudged++;
    }
  }
  log.info(`prayer quality sync: nudged weights for ${nudged} verse(s) based on quality scores`);
  adminBus.agentDone("qualitySync", `Weight nudges applied to ${nudged} verse(s) from quality scores`);
}

// ── Autonomous quality benchmarking ─────────────────────────────────────────
// Scores each explanation in cache against the scraped teaching snippets
// using three axes: vocabulary diversity, sentence-length variance, and
// theological term density (see scoreExplanation in verseExplainEngine.js).
// If a significant proportion of cached entries score below 55/100, those
// rows are deleted so they regenerate on next access with the improved engine.
// Runs daily at 05:00 after the crawl + learning + genetic passes have run.
async function runQualityBenchmark(supabase) {
  adminBus.agentStart("qualityBenchmark", "Scoring cached explanations against teaching snippets…");
  const { data: explanations, error } = await supabase
    .from("verse_explanations")
    .select("id, verse_ref, explanation, quality_score, generated_at")
    .order("generated_at", { ascending: false })
    .limit(100);

  if (error) { log.warn("quality benchmark: could not load explanations:", error.message); adminBus.agentError("qualityBenchmark", `Load failed: ${error.message}`); return; }
  if (!explanations?.length) { log.info("quality benchmark: no explanations in cache yet"); adminBus.agentDone("qualityBenchmark", "No cached explanations yet"); return; }

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
  adminBus.agentDone("qualityBenchmark", `Checked ${explanations.length} entries, avg score ${avg.toFixed(0)}/100, purged ${purged} low-quality`);
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

  // Daily at 05:00: autonomous quality benchmark.
  cron.schedule("0 5 * * *", () => {
    runQualityBenchmark(supabase).catch((e) => log.warn("quality benchmark failed:", e.message));
  });

  // Daily at 06:00: auto-discovery — promotes highly-rated uncurated verses
  // (surfaced by the full-Bible TF-IDF index) into the persistent verse bank.
  cron.schedule("0 6 * * *", () => {
    runAutoDiscovery(supabase).catch((e) => log.warn("auto-discovery failed:", e.message));
  });

  // Daily at 06:30: prayer quality score sync — nudges verse weights upward
  // for verses that consistently appear in high-quality generated prayers.
  cron.schedule("30 6 * * *", () => {
    runPrayerQualitySync(supabase).catch((e) => log.warn("prayer quality sync failed:", e.message));
  });

  log.info(
    "scheduler started — " +
    "hourly weight sync, " +
    "web crawl (02:00), keyword learning (03:00), genetic optimization (04:00), " +
    "quality benchmark (05:00), auto-discovery (06:00), quality sync (06:30)"
  );

  // Warm the full-Bible index and Markov model in background at startup.
  // They build once and stay in memory. The index takes ~1-2s, the Markov
  // model ~3-4s — both are ready well before the first user request.
  warmBibleIndex();
  warmMarkov();

  // Run the full pipeline once shortly after boot.
  setTimeout(() => {
    log.info("running startup pipeline pass (crawl → keyword learning → genetic optimization → auto-discovery)");
    runCrawlJob(supabase)
      .then(() => runDailyKeywordLearning(supabase).catch((e) => log.warn("startup keyword learning failed:", e.message)))
      .then(() => runGeneticJob(supabase))
      .then(() => runAutoDiscovery(supabase).catch((e) => log.warn("startup auto-discovery failed:", e.message)))
      .catch((e) => log.warn("startup pipeline failed:", e.message));
  }, 15000);
}
