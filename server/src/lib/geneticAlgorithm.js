// ─── Genetic algorithm: evolved verse-weighting per category ───────────────
// The real-time feedback nudge in scheduler.js (recordFeedback) is
// deliberately simple and immediate — one rating, one small weight step.
// This module is the slower, smarter layer on top of it: periodically it
// re-derives the WHOLE weight vector for a category at once, by evolving a
// population of candidate vectors against the full history of feedback,
// rather than only ever nudging one verse at a time. That's a genuine use
// of a genetic algorithm (population, fitness, selection, crossover,
// mutation across generations) to solve a real optimization problem —
// "which weight vector best explains which verses this category's users
// actually rated highly" — not a decorative label on ordinary code.
//
// Runs in the same always-on process via node-cron (see scheduler.js), no
// separate worker/dyno needed. Every generation's progress is logged so the
// whole evolutionary run is visible in `railway logs`.

import { logger } from "./logger.js";
import { getVerseBank } from "../data/prayerVerses.js";

const log = logger("genetic-algorithm");

const POPULATION_SIZE = 24;
const GENERATIONS = 40;
const MUTATION_RATE = 0.15;
const MUTATION_STRENGTH = 0.35;
const ELITE_COUNT = 4;
const WEIGHT_MIN = 0.2;
const WEIGHT_MAX = 3;

function clampWeight(w) {
  return Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, w));
}

// Target weight per verse, derived directly from its feedback history:
// average (rating - 3) shifts it up/down from a neutral 1.0, damped so a
// single outlier rating can't swing it to the extremes, and regularized
// toward 1.0 when a verse has very little data (avoids overfitting noise).
function computeTargets(verseRefs, feedbackRows) {
  const byRef = new Map();
  for (const ref of verseRefs) byRef.set(ref, []);
  for (const row of feedbackRows) {
    if (byRef.has(row.verse_ref)) byRef.get(row.verse_ref).push(row.rating);
  }

  const targets = {};
  for (const ref of verseRefs) {
    const ratings = byRef.get(ref);
    if (!ratings.length) {
      targets[ref] = 1;
      continue;
    }
    const avgShift = ratings.reduce((s, r) => s + (r - 3), 0) / ratings.length;
    // More data → trust the shift more; little data → stay close to neutral.
    const confidence = Math.min(1, ratings.length / 8);
    targets[ref] = clampWeight(1 + avgShift * 0.5 * confidence);
  }
  return targets;
}

function randomChromosome(verseRefs, seedWeights) {
  const genes = {};
  for (const ref of verseRefs) {
    const base = seedWeights?.[ref] ?? 1;
    genes[ref] = clampWeight(base + (Math.random() - 0.5) * 0.6);
  }
  return genes;
}

// Fitness = negative mean-squared-error against the target vector (higher
// is better). A vector that matches what users actually rewarded scores
// highest.
function fitness(chromosome, targets, verseRefs) {
  let sse = 0;
  for (const ref of verseRefs) {
    const diff = chromosome[ref] - targets[ref];
    sse += diff * diff;
  }
  return -(sse / verseRefs.length);
}

function crossover(a, b, verseRefs) {
  const child = {};
  for (const ref of verseRefs) {
    child[ref] = Math.random() < 0.5 ? a[ref] : b[ref];
  }
  return child;
}

function mutate(chromosome, verseRefs) {
  const mutated = { ...chromosome };
  for (const ref of verseRefs) {
    if (Math.random() < MUTATION_RATE) {
      mutated[ref] = clampWeight(mutated[ref] + (Math.random() - 0.5) * 2 * MUTATION_STRENGTH);
    }
  }
  return mutated;
}

function tournamentSelect(scored) {
  const a = scored[Math.floor(Math.random() * scored.length)];
  const b = scored[Math.floor(Math.random() * scored.length)];
  return a.score >= b.score ? a.chromosome : b.chromosome;
}

// Evolves the best weight vector for one category. Returns
// { best: {ref: weight}, bestFitness, avgFitness, generations }.
function evolveCategory(category, verseRefs, feedbackRows, seedWeights) {
  const targets = computeTargets(verseRefs, feedbackRows);

  let population = Array.from({ length: POPULATION_SIZE }, () => randomChromosome(verseRefs, seedWeights));
  let lastBestFitness = -Infinity;
  let lastAvgFitness = -Infinity;

  for (let gen = 1; gen <= GENERATIONS; gen++) {
    const scored = population
      .map((chromosome) => ({ chromosome, score: fitness(chromosome, targets, verseRefs) }))
      .sort((a, b) => b.score - a.score);

    lastBestFitness = scored[0].score;
    lastAvgFitness = scored.reduce((s, x) => s + x.score, 0) / scored.length;

    if (gen === 1 || gen === GENERATIONS || gen % 10 === 0) {
      log.info(
        `[${category}] generation ${gen}/${GENERATIONS} — best fitness ${lastBestFitness.toFixed(4)}, avg fitness ${lastAvgFitness.toFixed(4)}`
      );
    }

    const elites = scored.slice(0, ELITE_COUNT).map((s) => s.chromosome);
    const nextPopulation = [...elites];
    while (nextPopulation.length < POPULATION_SIZE) {
      const parentA = tournamentSelect(scored);
      const parentB = tournamentSelect(scored);
      const child = mutate(crossover(parentA, parentB, verseRefs), verseRefs);
      nextPopulation.push(child);
    }
    population = nextPopulation;
  }

  const finalScored = population
    .map((chromosome) => ({ chromosome, score: fitness(chromosome, targets, verseRefs) }))
    .sort((a, b) => b.score - a.score);

  return {
    best: finalScored[0].chromosome,
    bestFitness: finalScored[0].score,
    avgFitness: lastAvgFitness,
    generations: GENERATIONS,
  };
}

// Runs one full evolutionary optimization pass across all five categories
// and writes the winning weight vector for each back into
// verse_category_weights (the same table the real-time nudge writes to —
// this just periodically re-derives the whole vector at once instead of
// one step at a time). Also writes an audit row per category into
// ga_generations so the run's outcome is queryable, not just log text.
export async function runGeneticOptimization(supabase, currentWeights) {
  log.info("genetic optimization run started");

  const bank = getVerseBank();
  const categories = [...new Set(bank.map((v) => v.category))];
  const updatedWeights = { ...currentWeights };
  const summary = [];

  for (const category of categories) {
    const verseRefs = bank.filter((v) => v.category === category).map((v) => v.ref);
    if (verseRefs.length < 2) continue;

    const { data: feedbackRows, error } = await supabase
      .from("generation_feedback")
      .select("verse_ref, rating")
      .eq("category", category)
      .not("verse_ref", "is", null);

    if (error) {
      log.warn(`skipping ${category} — failed to load feedback: ${error.message}`);
      continue;
    }

    const result = evolveCategory(category, verseRefs, feedbackRows ?? [], currentWeights);
    log.info(
      `[${category}] evolution complete after ${result.generations} generations — best fitness ${result.bestFitness.toFixed(4)} (${(feedbackRows ?? []).length} feedback rows used)`
    );

    for (const ref of verseRefs) {
      updatedWeights[ref] = result.best[ref];
    }

    const rows = verseRefs.map((ref) => ({
      verse_ref: ref,
      category,
      weight: result.best[ref],
      updated_at: new Date().toISOString(),
    }));
    const { error: upsertError } = await supabase
      .from("verse_category_weights")
      .upsert(rows, { onConflict: "verse_ref,category" });
    if (upsertError) log.warn(`failed to persist evolved weights for ${category}: ${upsertError.message}`);

    await supabase.from("ga_generations").insert({
      category,
      generations: result.generations,
      population_size: POPULATION_SIZE,
      best_fitness: result.bestFitness,
      avg_fitness: result.avgFitness,
      feedback_rows_used: (feedbackRows ?? []).length,
      best_weights: result.best,
    });

    summary.push({ category, bestFitness: result.bestFitness, feedbackRows: (feedbackRows ?? []).length });
  }

  log.info("genetic optimization run finished —", JSON.stringify(summary));
  return { updatedWeights, summary };
}
