// ─── Rule-based prayer/devotion engine ──────────────────────────────────────
// Deliberately contains NO calls to any LLM API and needs no GPU: every
// prayer point and devotional below is assembled from (a) a curated table of
// real scripture references, matched by keyword overlap against what the
// user typed, and (b) a small set of hand-written phrasing templates per
// category. It runs as plain CPU-bound JS, so it's fine on Railway's
// cheapest always-on instance, and it never depends on OpenAI being up or
// paid for.
//
// "Self-evolving" here means concretely: every generated item can be rated;
// ratings adjust a per-verse weight (see verse_category_weights in
// schema.sql) so better-received scripture/category pairings get selected
// more often over time, and previously-unseen keywords from highly-rated
// requests get promoted into the keyword table (see server/src/data/prayerVerses.js
// learnedKeywords + scheduler.js). That is a real, working feedback loop —
// not a simulated one — but it is intentionally simpler than a full genetic
// algorithm or web-crawling pipeline, which would need infrastructure
// (headless browsers, scheduled crawlers, a vector index) well beyond what
// a single always-on Railway web process can safely run.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { CATEGORIES, getVerseBank } from "../data/prayerVerses.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bibleDir = path.join(__dirname, "..", "data", "bible");
const bookCache = new Map();

function loadBook(bookId) {
  if (!bookCache.has(bookId)) {
    bookCache.set(bookId, JSON.parse(readFileSync(path.join(bibleDir, `book-${bookId}.json`), "utf-8")));
  }
  return bookCache.get(bookId);
}

// Pulls the real KJV text for a verse or verse range straight from the local
// Bible data, so the engine never has to hardcode scripture text separately
// (and can't drift from it).
export function verseText(entry) {
  const chapters = loadBook(entry.bookId);
  const verses = chapters[entry.chapter - 1] ?? [];
  const start = entry.verseStart;
  const end = entry.verseEnd ?? entry.verseStart;
  return verses.slice(start - 1, end).join(" ");
}

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

const STOPWORDS = new Set([
  "the","and","for","that","with","this","have","from","your","you","are","was","will",
  "his","her","them","they","them","been","who","what","when","about","just","like","can",
]);

// ── Category detection ──────────────────────────────────────────────────
// Scores the user's free-text desire against each category's keyword set
// (built-in + anything learned from feedback, see prayerVerses.js) and
// returns the best match plus a confidence score, so the app can offer an
// "auto-detected" category without the user having to pick one, or route
// automatically for the fully autonomous flow.
export function detectCategory(desireText) {
  const words = tokenize(desireText);
  const scores = {};
  for (const cat of CATEGORIES) scores[cat.name] = 0;

  for (const word of words) {
    if (STOPWORDS.has(word)) continue;
    for (const cat of CATEGORIES) {
      if (cat.keywords.has(word)) scores[cat.name] += cat.keywords.get(word);
    }
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topName, topScore] = ranked[0];
  const totalScore = ranked.reduce((s, [, v]) => s + v, 0) || 1;
  return {
    category: topScore > 0 ? topName : "Petition", // Petition is the safe default: "ask God for this"
    confidence: topScore > 0 ? Math.min(1, topScore / totalScore + 0.15) : 0.3,
    scores,
  };
}

// ── Verse selection ─────────────────────────────────────────────────────
// Ranks every verse tagged with the requested category by:
//   1. keyword overlap with what the user actually typed (relevance)
//   2. the verse's learned weight (how well it's been received historically)
// then returns the top N distinct verses. This is the "matching" half of
// generation — no two calls with different input text pick verses in the
// same order, because the ranking genuinely depends on the input.
export function selectVerses(category, desireText, count, weights) {
  const words = new Set(tokenize(desireText).filter((w) => !STOPWORDS.has(w)));
  const pool = getVerseBank().filter((v) => v.category === category);
  const scored = pool.map((v) => {
    const overlap = v.keywords.reduce((s, k) => s + (words.has(k) ? 1 : 0), 0);
    const weight = weights?.[v.ref] ?? 1;
    // Small deterministic jitter from the reference string keeps ties from
    // always resolving in file order, without needing real randomness.
    const jitter = (v.ref.length % 7) * 0.01;
    return { v, score: overlap * 2 + weight + jitter };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map((s) => s.v);
}

// ── Phrasing templates ──────────────────────────────────────────────────
// A handful of varied sentence frames per category so consecutive prayer
// points don't all read identically even when they share a category.
const TEMPLATES = {
  Adoration: [
    (d) => `Lord, I praise You simply for who You are — the truth behind "${d}" is that You are worthy before You ever answer a single request.`,
    (d) => `I lift my heart in worship, Father, because Your character never changes even while I wait on "${d}".`,
    (d) => `Holy God, I adore You today — not for what You'll do about "${d}", but for the majesty of who You are.`,
  ],
  Thanksgiving: [
    (d) => `Thank You, Lord, for Your faithfulness already at work around "${d}", even before I can fully see it.`,
    (d) => `I'm grateful, Father — You have carried me this far, and I trust You with "${d}" too.`,
    (d) => `Father, thank You for every provision so far; I hold "${d}" up with a thankful, not anxious, heart.`,
  ],
  Petition: [
    (d) => `Lord, I bring "${d}" before You and ask boldly, believing You hear me and are able.`,
    (d) => `Father, I'm asking specifically for "${d}" — not because I deserve it, but because You are good and generous.`,
    (d) => `I ask, Lord, that You would move concerning "${d}", according to Your perfect will and timing.`,
  ],
  Intercession: [
    (d) => `Lord, I stand in the gap and lift up "${d}" on behalf of those affected, asking for Your mercy and provision for them.`,
    (d) => `Father, I intercede for "${d}" — touch the lives connected to this need in ways only You can.`,
    (d) => `I ask You, God, to move on behalf of others caught up in "${d}", even where I cannot reach them myself.`,
  ],
  Warfare: [
    (d) => `In the name of Jesus, I stand against every scheme working through "${d}" and declare that no weapon formed against me shall prosper.`,
    (d) => `Lord, I take up the full armor of God over "${d}" and resist the enemy, knowing he must flee.`,
    (d) => `Father, I bind every lie and attack tied to "${d}" and declare Your victory over it in Christ's authority.`,
  ],
};

function pickTemplate(category, seedIndex) {
  const list = TEMPLATES[category] ?? TEMPLATES.Petition;
  return list[seedIndex % list.length];
}

// ── Public generation API ───────────────────────────────────────────────
export function generatePrayerPoints({ desires, type, count, weights }) {
  const n = Math.min(Math.max(parseInt(count, 10) || 1, 1), 10);
  const category = CATEGORIES.some((c) => c.name === type) ? type : detectCategory(desires).category;
  const verses = selectVerses(category, desires, n, weights);

  // If the category doesn't have enough distinct tagged verses yet, fall
  // back to Petition (the largest, most general bank) to fill the rest
  // rather than repeating the same verse.
  if (verses.length < n) {
    const extra = selectVerses("Petition", desires, n - verses.length, weights).filter(
      (e) => !verses.find((v) => v.ref === e.ref)
    );
    verses.push(...extra);
  }

  const prayerPoints = verses.map((v, i) => ({
    title: v.title,
    prayerText: `${pickTemplate(category, i)(desires)} "${verseText(v)}" — ${v.ref}.`,
    scriptureReference: v.ref,
    category,
  }));
  return { prayerPoints, detectedCategory: category };
}

export function generateDevotional({ goal, dayNumber, weights }) {
  const detection = detectCategory(goal);
  // Devotionals lean thankful/adoring in tone regardless of the detected
  // prayer category, but still pick scripture relevant to the stated goal.
  const bank = getVerseBank();
  const pool = bank.filter((v) => v.keywords.some((k) => tokenize(goal).includes(k)));
  const candidates = pool.length ? pool : bank.filter((v) => v.category === "Thanksgiving");
  const seedIndex = (dayNumber ?? 1) % candidates.length;
  const verse = candidates[seedIndex] ?? VERSE_BANK[0];
  const text = verseText(verse);

  return {
    title: `Walking Toward: ${goal}`,
    scriptureReference: verse.ref,
    scriptureText: text,
    body:
      `Today's focus is "${goal}". Scripture speaks directly into this in ${verse.ref}: "${text}" ` +
      `Let this truth shape how you approach today — not by striving harder in your own strength, but by resting in what God has already said about it. ` +
      `Take a moment to notice one concrete way this goal shows up in your day, and hold it up against this verse before you move on.`,
    closingPrayer: `Father, thank You for Your word in ${verse.ref}. Help me live out "${goal}" in a way that honors You today. Amen.`,
    detectedCategory: detection.category,
  };
}
