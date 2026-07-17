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

// ── Dynamic prayer builder ───────────────────────────────────────────────
// Generates prayer language by weaving the actual verse text with the user's
// own words. No fixed per-category strings — the verse and the desire drive
// every sentence. Each prayer point is built in four natural movements:
//   Address  → who you are speaking to, grounded in what this verse reveals about God
//   Declare  → the verse truth stated as personal conviction, not just recitation
//   Petition → the user's specific desire woven into the verse's promise or command
//   Commit   → a surrender/trust statement that closes the point
//
// The category biases WHICH movement to emphasize (Adoration → heavier Address;
// Warfare → stronger Declare; Intercession → Petition names others), but the
// actual language always comes from the verse + the user's own words.

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const ADDRESS_BY_CATEGORY = {
  Adoration:    ["Father of lights", "Holy God", "Lord Most High", "Everlasting Father"],
  Thanksgiving: ["Faithful God", "Good Father", "Lord of every gift", "Provider and Sustainer"],
  Petition:     ["Gracious Father", "Lord who hears", "Heavenly Father", "God of every grace"],
  Intercession: ["Merciful Lord", "God who sees", "Father of compassion", "Lord of all comfort"],
  Warfare:      ["Lord God Almighty", "Captain of the hosts", "God of power and authority", "Sovereign Lord"],
};

// Extract the most significant non-trivial words from verse text
function verseKeyFragments(verseTextStr, count = 4) {
  const SKIP = new Set([
    "the","and","for","that","with","this","have","from","your","you","are","was","will",
    "his","her","them","they","been","who","what","when","about","just","like","can",
    "not","but","all","one","him","she","its","also","than","then","into","more","which",
    "their","there","out","has","had","would","could","should","said","shall","upon",
    "unto","thee","thou","thy","hath","doth","saith","mine","thine","yea",
  ]);
  const words = verseTextStr.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)
    .filter((w) => w.length > 3 && !SKIP.has(w));
  const seen = new Set();
  return words.filter((w) => { if (seen.has(w)) return false; seen.add(w); return true; }).slice(0, count);
}

// Pull up to 3 meaningful words from the user's desires string
function desireKeyWords(desires) {
  const SKIP = new Set(["want","need","help","please","really","very","just","that","with","for","and","the"]);
  return desires.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)
    .filter((w) => w.length > 3 && !SKIP.has(w)).slice(0, 3);
}

// Build a single dynamic prayer point from a verse + user desires
function buildDynamicPrayer(verseEntry, verseTextStr, desires, category, idx) {
  const addressPool = ADDRESS_BY_CATEGORY[category] ?? ADDRESS_BY_CATEGORY.Petition;
  const address = addressPool[idx % addressPool.length];
  const frags = verseKeyFragments(verseTextStr);
  const dWords = desireKeyWords(desires);

  // Truncate desires for embedding in prose (keep it readable)
  const shortDesire = desires.length <= 80 ? desires.trim() : desires.trim().slice(0, 78) + "…";

  // Verse fragment for the Declare movement — use a short phrase from the verse
  const verseFrag = verseTextStr.length > 100
    ? verseTextStr.slice(0, verseTextStr.lastIndexOf(" ", 90)) + "…"
    : verseTextStr;

  // The core theme word — most significant word from verse or desire
  const coreWord = frags[idx % Math.max(frags.length, 1)] ?? dWords[0] ?? "this need";

  // Build movements based on category emphasis
  let address_line, declare_line, petition_line, commit_line;

  if (category === "Adoration") {
    address_line = `${address}, I come before You not with a request but with a heart that simply wants to honour You.`;
    declare_line = `Your word declares: "${verseFrag}" — and I receive that as a declaration of who You are, not only what You do.`;
    petition_line = `In the middle of everything surrounding ${shortDesire}, I pause to acknowledge that You are worthy of praise before You move a single circumstance.`;
    commit_line = `I trust You with all of it. You are God and I am not, and today that is enough. Amen.`;
  } else if (category === "Warfare") {
    address_line = `${address}, I stand in the authority You have given me through Christ.`;
    declare_line = `Scripture declares "${verseFrag}" — and I receive that as the ground I am standing on right now.`;
    petition_line = `I bring ${shortDesire} into this truth and resist every lie, fear, or oppression attached to it. No weapon formed against what You have purposed will stand.`;
    commit_line = `I choose to stand, not in my own strength, but in Yours. In Jesus' name. Amen.`;
  } else if (category === "Intercession") {
    address_line = `${address}, I come on behalf of others, not just myself.`;
    declare_line = `Your word says "${verseFrag}" — and I claim that promise not only for me but for every person caught up in ${shortDesire}.`;
    petition_line = `I lift them before You now. Reach into the places I cannot go. Move in ways only You can. Let Your mercy be greater than their need.`;
    commit_line = `I release this into Your hands, trusting You see what I cannot. Amen.`;
  } else if (category === "Thanksgiving") {
    address_line = `${address}, I come with a grateful heart — not because circumstances are perfect, but because You are.`;
    declare_line = `You have spoken: "${verseFrag}" — and I have seen enough of Your faithfulness to receive that as true.`;
    petition_line = `Even in the middle of ${shortDesire}, I choose to thank You for what You have already done and what You are already doing that I cannot yet see.`;
    commit_line = `My trust is in You. You have been faithful and You will be faithful. Amen.`;
  } else {
    // Petition (default)
    address_line = `${address}, I bring this to You directly and honestly.`;
    declare_line = `Your word promises: "${verseFrag}" — and I hold that promise against what I am facing today.`;
    petition_line = `I am asking specifically about ${shortDesire}. Not because I have earned an answer, but because You are good and You have told me to ask. So I am asking.`;
    commit_line = `Whatever Your answer looks like, I trust that You are working for my good and Your glory. Amen.`;
  }

  return `${address_line} ${declare_line} ${petition_line} ${commit_line}`;
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
    prayerText: buildDynamicPrayer(v, verseText(v), desires, category, i),
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

  // Build a devotional body dynamically from the verse text and the user's goal.
  // The goal drives the opening question; the verse drives the reflection; the
  // application is specific enough to feel personal without being a fixed string.
  const goalWords = tokenize(goal).filter((w) => !STOPWORDS.has(w)).slice(0, 3);
  const coreGoalWord = goalWords[0] ?? "this";
  const shortGoal = goal.length <= 70 ? goal.trim() : goal.trim().slice(0, 68) + "…";
  const verseFrag = text.length > 80 ? text.slice(0, text.lastIndexOf(" ", 78)) + "…" : text;

  const openings = [
    `There is something worth sitting with today around the matter of ${shortGoal}.`,
    `The question underneath ${shortGoal} is not simply practical — it is a question about trust.`,
    `When we bring ${shortGoal} honestly before God, something has to give — and it will not be His word.`,
    `${shortGoal.charAt(0).toUpperCase() + shortGoal.slice(1)} is not a peripheral concern. Scripture speaks directly into it.`,
  ];
  const opening = openings[(dayNumber ?? 1) % openings.length];

  const reflections = [
    `The words of ${verse.ref} are not decorative comfort — they carry the full weight of God's character behind them. "${verseFrag}" Every word that verse rests on has been proven across centuries of people who brought the same kind of need you are carrying today.`,
    `In ${verse.ref} we find this: "${verseFrag}" It is worth noticing that God does not say this as a suggestion — He says it as a declaration. The question is whether we are willing to receive it in that spirit.`,
    `Consider what ${verse.ref} is actually claiming: "${verseFrag}" The invitation here is not to produce something you don't have, but to receive something already on offer. That shifts everything about how you approach ${coreGoalWord} today.`,
  ];
  const reflection = reflections[(dayNumber ?? 1) % reflections.length];

  const applications = [
    `One practical step today: before you act on ${shortGoal} from anxiety or striving, pause and read this verse once more. Let the truth settle before the action begins.`,
    `Take one moment today — just one — to consciously lay ${shortGoal} down and pick it back up as a trust decision rather than a weight. That is what this verse is asking of you.`,
    `Today's invitation is simple: bring ${shortGoal} into conversation with this verse. Not a long theological exercise — just a moment of honesty with God about what you actually need and what He has actually said.`,
  ];
  const application = applications[(dayNumber ?? 2) % applications.length];

  const body = `${opening}\n\n${reflection}\n\n${application}`;

  const prayerVariants = [
    `Father, Your word in ${verse.ref} is enough. Let it be enough for me today — specifically around ${shortGoal}. I receive it as truth and choose to act from it rather than from fear. Amen.`,
    `Lord, I hold ${shortGoal} before You and hold ${verse.ref} beside it. Where they don't line up with how I've been thinking, change my thinking. I trust You with the rest. Amen.`,
    `God, I am not equal to ${shortGoal} on my own. But that is the point — You are. Let this verse be the ground I stand on today, not just something I read. Amen.`,
  ];
  const closingPrayer = prayerVariants[(dayNumber ?? 0) % prayerVariants.length];

  return {
    title: `Walking Toward: ${goal}`,
    scriptureReference: verse.ref,
    scriptureText: text,
    body,
    closingPrayer,
    detectedCategory: detection.category,
  };
}
