// ─── Algorithmic Bible Verse Explanation Engine ────────────────────────────
// No LLM, no GPU. Explains verses using:
//   1. Free Dictionary API (api.dictionaryapi.dev) — word-by-word definitions
//   2. Local KJV Bible data — surrounding context, cross-referenced verses
//   3. Markov-chain text assembly — natural-reading, varied explanations
//   4. Scraped teaching context from webCrawler — learned patterns per verse
//   5. Prayer-engine category detection — thematic connections
//   6. Supabase — cache and self-learning from user ratings
//
// Returns the same shape as the old OpenAI endpoint:
//   { explanation: string, supportingScriptures: [{reference, note}] }
//
// Every lookup, generation step, and cache hit/miss is logged so all
// activity is visible in `railway logs`.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { logger } from "./logger.js";
import { detectCategory, verseText } from "./prayerEngine.js";
import { getVerseBank } from "../data/prayerVerses.js";

const log = logger("verse-explain");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bibleDir = path.join(__dirname, "..", "data", "bible");
const bibleIndex = JSON.parse(readFileSync(path.join(bibleDir, "index.json"), "utf-8"));
const bookByName = new Map(bibleIndex.map((b) => [b.name.toLowerCase(), b]));
const bookById = new Map(bibleIndex.map((b) => [b.id, b]));
const bookCache = new Map();

function loadBook(bookId) {
  if (!bookCache.has(bookId)) {
    bookCache.set(bookId, JSON.parse(readFileSync(path.join(bibleDir, `book-${bookId}.json`), "utf-8")));
  }
  return bookCache.get(bookId);
}

// ── Book metadata for context layer ─────────────────────────────────────────
const BOOK_CONTEXT = {
  // OT
  1:  { author: "Moses", audience: "Israel",              theme: "Creation, covenant, and the beginning of God's relationship with humanity" },
  2:  { author: "Moses", audience: "Israel",              theme: "Redemption from slavery and the covenant at Sinai" },
  3:  { author: "Moses", audience: "Israel",              theme: "Holiness, worship, and the priestly system" },
  4:  { author: "Moses", audience: "Israel",              theme: "Israel's journey and faithfulness in the wilderness" },
  5:  { author: "Moses", audience: "Israel",              theme: "The law renewed and God's covenant faithfulness" },
  6:  { author: "Joshua", audience: "Israel",             theme: "God's faithfulness in bringing Israel into the promised land" },
  7:  { author: "Samuel / Anonymous", audience: "Israel", theme: "The cycle of sin, judgment, and deliverance under the judges" },
  8:  { author: "Anonymous", audience: "Israel",          theme: "Loyalty, faithfulness, and God's providence" },
  9:  { author: "Anonymous", audience: "Israel",          theme: "Samuel, Saul, and the beginning of the kingdom" },
  10: { author: "Anonymous", audience: "Israel",          theme: "David's reign, God's covenant with David" },
  11: { author: "Anonymous", audience: "Israel",          theme: "Solomon's wisdom and the division of the kingdom" },
  12: { author: "Anonymous", audience: "Israel",          theme: "The northern kingdom's decline to exile" },
  13: { author: "Anonymous", audience: "Israel",          theme: "Parallel history — God's sovereignty over nations" },
  14: { author: "Anonymous", audience: "Israel",          theme: "Solomon's wisdom and the temple" },
  15: { author: "Ezra", audience: "Returning exiles",     theme: "Restoration and return from Babylon" },
  16: { author: "Nehemiah", audience: "Returning exiles", theme: "Rebuilding Jerusalem's walls and community" },
  17: { author: "Mordecai / Esther", audience: "Jews in Persia", theme: "God's hidden providence protecting His people" },
  18: { author: "Unknown", audience: "Suffering people",  theme: "Suffering, faith, and the sovereignty of God" },
  19: { author: "David and others", audience: "Israel",   theme: "Worship, lament, praise, and trust in God" },
  20: { author: "Solomon", audience: "Israel",            theme: "Fear of God as the foundation of wisdom" },
  21: { author: "Solomon", audience: "Israel",            theme: "The vanity of life apart from God" },
  22: { author: "Solomon", audience: "Israel",            theme: "Love and beauty as gifts from God" },
  23: { author: "Isaiah", audience: "Israel",             theme: "Judgment, comfort, and the coming Messiah" },
  24: { author: "Jeremiah", audience: "Israel",           theme: "God's faithfulness in judgment and the new covenant" },
  25: { author: "Jeremiah", audience: "Israel",           theme: "Grief over Jerusalem's fall and hope in God's mercy" },
  26: { author: "Ezekiel", audience: "Israel in exile",   theme: "God's glory, Israel's restoration, and the new temple" },
  27: { author: "Daniel", audience: "Israel in exile",    theme: "God's sovereignty over human kingdoms and end times" },
  28: { author: "Hosea", audience: "Israel",              theme: "God's faithful love despite Israel's unfaithfulness" },
  29: { author: "Joel", audience: "Israel",               theme: "Repentance, the Day of the LORD, and the Spirit's outpouring" },
  30: { author: "Amos", audience: "Israel",               theme: "Social justice and accountability before a holy God" },
  31: { author: "Obadiah", audience: "Edom and Israel",   theme: "God's judgment on pride and his deliverance of Zion" },
  32: { author: "Jonah", audience: "Israel",              theme: "God's compassion extending beyond Israel" },
  33: { author: "Micah", audience: "Israel",              theme: "Justice, mercy, humility, and hope of restoration" },
  34: { author: "Nahum", audience: "Nineveh and Israel",  theme: "God's judgment on Assyria and comfort for Israel" },
  35: { author: "Habakkuk", audience: "Israel",           theme: "Faith and God's justice in times of confusion" },
  36: { author: "Zephaniah", audience: "Israel",          theme: "Judgment and the remnant's joyful restoration" },
  37: { author: "Haggai", audience: "Returning exiles",   theme: "Rebuilding the temple and prioritising God" },
  38: { author: "Zechariah", audience: "Returning exiles",theme: "Messianic hope and God's plans for Jerusalem" },
  39: { author: "Malachi", audience: "Israel",            theme: "Covenant faithfulness and preparation for the Messiah" },
  // NT
  40: { author: "Matthew", audience: "Jewish Christians", theme: "Jesus as the fulfillment of the Old Testament — the King of Israel" },
  41: { author: "Mark", audience: "Roman audience",       theme: "Jesus as the suffering servant — action and power" },
  42: { author: "Luke", audience: "Gentile Christians",   theme: "Jesus as the Son of Man, the saviour of all" },
  43: { author: "John", audience: "All believers",        theme: "Jesus as the Word and Son of God — eternal life through faith" },
  44: { author: "Luke", audience: "Theophilus and believers", theme: "The spread of the gospel from Jerusalem to the world" },
  45: { author: "Paul", audience: "Rome",                 theme: "Salvation by faith, the righteousness of God" },
  46: { author: "Paul", audience: "Corinth",              theme: "Unity, spiritual gifts, and Christian conduct" },
  47: { author: "Paul", audience: "Corinth",              theme: "Paul's apostleship and the ministry of reconciliation" },
  48: { author: "Paul", audience: "Galatia",              theme: "Freedom from law; justification by faith alone" },
  49: { author: "Paul", audience: "Ephesus",              theme: "The church as the body of Christ, spiritual warfare" },
  50: { author: "Paul", audience: "Philippi",             theme: "Joy and contentment in Christ whatever the circumstances" },
  51: { author: "Paul", audience: "Colossae",             theme: "The supremacy of Christ over all creation" },
  52: { author: "Paul", audience: "Thessalonica",         theme: "Holiness and hope in Christ's return" },
  53: { author: "Paul", audience: "Thessalonica",         theme: "Clarity on the end times and perseverance" },
  54: { author: "Paul", audience: "Timothy",              theme: "Leadership, sound doctrine, and pastoral care" },
  55: { author: "Paul", audience: "Timothy",              theme: "Endurance and faithfulness to the gospel" },
  56: { author: "Paul", audience: "Titus",                theme: "Church order and the grace that trains godliness" },
  57: { author: "Paul", audience: "Philemon",             theme: "Reconciliation and Christian brotherhood" },
  58: { author: "Unknown", audience: "Hebrew Christians", theme: "Jesus as the great High Priest — superior to the old covenant" },
  59: { author: "James", audience: "Jewish Christians",   theme: "Living faith produces action — wisdom and practical godliness" },
  60: { author: "Peter", audience: "Scattered believers", theme: "Hope and holiness in suffering and exile" },
  61: { author: "Peter", audience: "Scattered believers", theme: "Growing in grace and guarding against false teaching" },
  62: { author: "John", audience: "The church",           theme: "Walking in love, light, and truth as God's children" },
  63: { author: "John", audience: "Gaius and the church", theme: "Hospitality, truth, and Christian integrity" },
  64: { author: "Jude", audience: "All believers",        theme: "Contending for the faith against apostasy" },
  65: { author: "John", audience: "Seven churches of Asia", theme: "Christ's authority over history and the ultimate victory of God" },
  66: { author: "John", audience: "Seven churches of Asia", theme: "Continued — the Lamb's triumph and the new creation" },
};

// ── Stopwords for key-word extraction ───────────────────────────────────────
const STOPWORDS = new Set([
  "the","and","for","that","with","this","have","from","your","you","are","was","will",
  "his","her","them","they","been","who","what","when","about","just","like","can",
  "not","but","all","one","him","she","its","also","than","then","into","more","which",
  "their","there","out","has","had","would","could","should","said","shall","upon",
  "unto","thee","thou","thy","hath","doth","saith",
]);

// ── Markov-chain builder for explanation text ───────────────────────────────
// Trained on explanation templates and assembled verse text so generated
// prose reads naturally without hardcoded, repetitive output.
const EXPLANATION_STARTERS = [
  "In this verse",
  "Here",
  "The scripture declares",
  "This passage reveals",
  "The Word of God speaks here",
  "In these words",
  "The Lord communicates",
  "Scripture here teaches us",
];

const TRANSITION_PHRASES = [
  "This connects deeply to",
  "Taken together with",
  "This truth is reinforced in",
  "The same theme appears in",
  "Related scripture illuminates this further —",
  "Another voice in scripture echoes this —",
];

const APPLICATION_OPENERS = [
  "For the believer today, this means",
  "Practically speaking, this invites you to",
  "In daily life, this truth calls you to",
  "As you apply this scripture, consider",
  "Living out this verse means",
];

const CLOSING_PRAYERS_VERSE = [
  "Father, let the truth of {ref} take root deep in my heart. Amen.",
  "Lord, make real in me what You have declared in {ref}. Amen.",
  "God, I receive the promise and instruction of {ref} today. Amen.",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Simple Markov-chain text from a corpus of words (assembled at explain time
// from dictionary definitions and Bible context). Produces short (1–2 sentence)
// bridges that vary on every call.
function buildMarkovText(corpus, seedWord, targetLen = 18) {
  if (!corpus || corpus.length < 6) return "";
  // Build bigram map
  const bigrams = new Map();
  for (let i = 0; i < corpus.length - 1; i++) {
    const w = corpus[i];
    if (!bigrams.has(w)) bigrams.set(w, []);
    bigrams.get(w).push(corpus[i + 1]);
  }
  // Walk from seed (or random start) up to targetLen
  let current = seedWord && bigrams.has(seedWord) ? seedWord : corpus[Math.floor(Math.random() * (corpus.length / 2))];
  const words = [current];
  for (let i = 0; i < targetLen; i++) {
    const nexts = bigrams.get(current);
    if (!nexts || !nexts.length) break;
    current = nexts[Math.floor(Math.random() * nexts.length)];
    words.push(current);
    if (current.endsWith(".")) break;
  }
  const sentence = words.join(" ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

// ── Free Dictionary API ──────────────────────────────────────────────────────
const DICT_CACHE = new Map(); // in-memory; survives for the process lifetime

async function lookupWord(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w || w.length < 3) return null;
  if (DICT_CACHE.has(w)) return DICT_CACHE.get(w);

  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`, {
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": "TheLivingOliveApp/1.0 (dictionary-powered verse engine)" },
    });
    if (!res.ok) { DICT_CACHE.set(w, null); return null; }
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) { DICT_CACHE.set(w, null); return null; }

    const entry = data[0];
    const meanings = entry.meanings ?? [];
    const defs = meanings.flatMap((m) =>
      (m.definitions ?? []).slice(0, 2).map((d) => ({
        partOfSpeech: m.partOfSpeech,
        definition: d.definition,
        example: d.example ?? null,
        synonyms: [...new Set([...(d.synonyms ?? []), ...(m.synonyms ?? [])].slice(0, 4))],
      }))
    ).slice(0, 3);

    const result = {
      word: entry.word ?? w,
      phonetic: entry.phonetic ?? null,
      definitions: defs,
    };
    DICT_CACHE.set(w, result);
    return result;
  } catch {
    DICT_CACHE.set(w, null);
    return null;
  }
}

// ── Key-word extraction ──────────────────────────────────────────────────────
function extractKeyWords(text) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
  // Deduplicate, weight by position (earlier = more important)
  const seen = new Set();
  return words.filter((w) => { if (seen.has(w)) return false; seen.add(w); return true; }).slice(0, 8);
}

// ── Bible cross-references via prayer-engine verse bank ─────────────────────
function findSupportingVerses(category, verseRef, keyWords) {
  const bank = getVerseBank();

  // Find verses that share keywords with this verse, excluding the verse itself
  const scored = bank
    .filter((v) => v.ref !== verseRef)
    .map((v) => {
      const vWords = new Set(v.keywords ?? []);
      const overlap = keyWords.filter((w) => vWords.has(w) || v.ref.toLowerCase().includes(w)).length;
      // Prefer same category
      const catBonus = v.category === category ? 2 : 0;
      return { v, score: overlap + catBonus };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  if (scored.length < 2) {
    // Fallback: top verses for this category
    return bank.filter((v) => v.category === category && v.ref !== verseRef).slice(0, 4);
  }
  return scored.map((x) => x.v);
}

// ── Parse a reference string into {bookId, chapter, verseStart} ─────────────
function parseRef(reference) {
  const m = reference.trim().match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  const [, bookNameRaw, chapterStr, verseStartStr] = m;
  const book = bookByName.get(bookNameRaw.trim().toLowerCase());
  if (!book) return null;
  return {
    bookId: book.id,
    chapter: parseInt(chapterStr, 10),
    verseStart: parseInt(verseStartStr, 10),
    verseEnd: m[4] ? parseInt(m[4], 10) : undefined,
  };
}

// ── Surrounding-chapter context ──────────────────────────────────────────────
function getSurroundingContext(bookId, chapter, verseStart, contextSize = 3) {
  try {
    const chapters = loadBook(bookId);
    const verses = chapters[chapter - 1] ?? [];
    const before = verses.slice(Math.max(0, verseStart - 1 - contextSize), verseStart - 1).join(" ");
    const after = verses.slice(verseStart, verseStart + contextSize).join(" ");
    return { before: before.trim(), after: after.trim() };
  } catch { return { before: "", after: "" }; }
}

// ── Explanation cache + learning ─────────────────────────────────────────────
let explanationLearningCache = {}; // { "John 3:16": { explanationScore, callCount, templates } }

export function recordExplanationFeedback(verseRef, rating) {
  if (!explanationLearningCache[verseRef]) {
    explanationLearningCache[verseRef] = { totalRating: 0, callCount: 0 };
  }
  explanationLearningCache[verseRef].totalRating += rating;
  explanationLearningCache[verseRef].callCount += 1;
  log.info(`explanation feedback recorded — ref=${verseRef} rating=${rating}`);
}

export function loadExplanationLearning(rows) {
  for (const row of rows ?? []) {
    explanationLearningCache[row.verse_ref] = {
      totalRating: row.total_rating ?? 0,
      callCount: row.call_count ?? 0,
    };
  }
  log.info(`loaded ${rows?.length ?? 0} explanation learning record(s)`);
}

// ── Scraped teaching context (populated by webCrawler) ───────────────────────
let teachingContextStore = new Map(); // ref → [snippet, ...]

export function addTeachingContext(verseRef, snippets) {
  if (!teachingContextStore.has(verseRef)) teachingContextStore.set(verseRef, []);
  const existing = teachingContextStore.get(verseRef);
  for (const s of snippets) {
    if (!existing.includes(s)) existing.push(s);
  }
}

export function getTeachingContext(verseRef) {
  return teachingContextStore.get(verseRef) ?? [];
}

export function loadTeachingContextFromDb(rows) {
  for (const row of rows ?? []) {
    if (!teachingContextStore.has(row.verse_ref)) teachingContextStore.set(row.verse_ref, []);
    const arr = teachingContextStore.get(row.verse_ref);
    for (const s of row.snippets ?? []) {
      if (!arr.includes(s)) arr.push(s);
    }
  }
  log.info(`loaded teaching context for ${teachingContextStore.size} verse(s) from previous crawls`);
}

// ── Main explanation generator ───────────────────────────────────────────────
export async function explainVerse({ reference, text, version = "KJV" }, supabase) {
  const startMs = Date.now();
  log.info(`explaining verse ref="${reference}" version=${version}`);

  // 1. Check Supabase cache (avoid redundant work for popular verses)
  if (supabase) {
    const { data: cached } = await supabase
      .from("verse_explanations")
      .select("explanation, supporting_scriptures, generated_at")
      .eq("verse_ref", reference)
      .order("generated_at", { ascending: false })
      .limit(1)
      .single();

    if (cached) {
      const ageHours = (Date.now() - new Date(cached.generated_at).getTime()) / 3600000;
      // Re-generate after 48 h to benefit from newly learned data, but serve cache in the meantime
      if (ageHours < 48) {
        log.info(`cache hit for ${reference} (age ${ageHours.toFixed(1)}h) — serving cached explanation`);
        return {
          explanation: cached.explanation,
          supportingScriptures: cached.supporting_scriptures ?? [],
          engine: "algorithmic-cached",
        };
      }
      log.info(`cache expired for ${reference} (age ${ageHours.toFixed(1)}h) — regenerating`);
    }
  }

  // 2. Parse reference and load book metadata
  const parsed = parseRef(reference);
  const bookMeta = parsed ? bookById.get(parsed.bookId) : null;
  const bookCtx = parsed ? BOOK_CONTEXT[parsed.bookId] : null;
  const surrounding = parsed ? getSurroundingContext(parsed.bookId, parsed.chapter, parsed.verseStart) : null;

  // 3. Extract key words from the verse text
  const keyWords = extractKeyWords(text);
  log.info(`key words extracted: [${keyWords.join(", ")}]`);

  // 4. Dictionary lookups for all key words (parallel)
  log.info(`looking up ${keyWords.length} word(s) in Free Dictionary API`);
  const dictResults = await Promise.all(keyWords.map(lookupWord));
  const dictMap = new Map(keyWords.map((w, i) => [w, dictResults[i]]).filter(([, d]) => d));
  log.info(`dictionary: ${dictMap.size}/${keyWords.length} word(s) resolved`);

  // 5. Detect prayer category for thematic connections
  const { category } = detectCategory(text + " " + keyWords.join(" "));
  log.info(`detected category: ${category}`);

  // 6. Find supporting verses from verse bank
  const supportVerse = findSupportingVerses(category, reference, keyWords);

  // 7. Collect scraped teaching context
  const teachings = getTeachingContext(reference);
  if (teachings.length) log.info(`using ${teachings.length} scraped teaching snippet(s) for ${reference}`);

  // 8. Build a word corpus for Markov chain from: definitions + surrounding text + teachings
  const wordCorpus = [
    ...text.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/),
    ...(surrounding?.before || "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/),
    ...(surrounding?.after || "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/),
    ...[...dictMap.values()].flatMap((d) =>
      d.definitions.flatMap((def) => def.definition.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/))
    ),
    ...teachings.flatMap((t) => t.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)),
  ].filter((w) => w.length > 2);

  // 9. Build the multi-layer explanation ─────────────────────────────────────

  const parts = [];

  // Layer 1 — Opening and verse text
  const starter = pick(EXPLANATION_STARTERS);
  const bookStr = bookMeta ? ` in the book of ${bookMeta.name}` : "";
  const authorStr = bookCtx?.author ? ` (written by ${bookCtx.author})` : "";
  parts.push(`${starter}${bookStr}${authorStr}: "${text}"`);

  // Layer 2 — Book/chapter context
  if (bookCtx) {
    parts.push(`\n\n📖 Context: The book of ${bookMeta?.name ?? "this book"} focuses on ${bookCtx.theme}. It was addressed to ${bookCtx.audience}.`);
  }

  // Layer 3 — Word-by-word breakdown from dictionary
  if (dictMap.size > 0) {
    parts.push("\n\n📚 Key Word Study:");
    for (const [word, entry] of dictMap) {
      if (!entry?.definitions?.length) continue;
      const def = entry.definitions[0];
      let wordLine = `• "${entry.word}" (${def.partOfSpeech}) — ${def.definition}`;
      if (def.synonyms?.length) wordLine += `. Related words: ${def.synonyms.slice(0, 3).join(", ")}`;
      parts.push(`\n${wordLine}`);
    }
  }

  // Layer 4 — Markov chain sentence (learned from corpus)
  const markovSeed = keyWords[0] ?? null;
  const markovBridge = buildMarkovText(wordCorpus, markovSeed, 22);
  if (markovBridge && markovBridge.split(" ").length > 5) {
    parts.push(`\n\n${markovBridge}`);
  }

  // Layer 5 — Scraped teaching context
  if (teachings.length) {
    const snippet = teachings[Math.floor(Math.random() * teachings.length)];
    if (snippet && snippet.length > 40) {
      parts.push(`\n\nFrom biblical teaching: "${snippet.slice(0, 280)}${snippet.length > 280 ? "…" : ""}"`);
    }
  }

  // Layer 6 — Application
  const appOpener = pick(APPLICATION_OPENERS);
  const appWord = keyWords[0] ?? "this truth";
  parts.push(`\n\n✨ Application: ${appOpener}: embrace the reality that God's word on "${appWord}" is not only for the ancient reader but for you today. ${pick(CLOSING_PRAYERS_VERSE).replace("{ref}", reference)}`);

  // Layer 7 — Surrounding scripture context
  if (surrounding?.before || surrounding?.after) {
    parts.push(`\n\n🔍 Chapter context: This verse sits within a larger narrative — "${surrounding.before || surrounding.after}"`);
  }

  const explanation = parts.join("").trim();

  // 10. Build supportingScriptures array ────────────────────────────────────
  const supportingScriptures = supportVerse.slice(0, 4).map((v) => {
    let noteStr = "";
    try {
      const vt = verseText(v);
      noteStr = `"${vt.slice(0, 120)}${vt.length > 120 ? "…" : ""}"`;
    } catch { noteStr = `Relates to the same theme of ${category.toLowerCase()}`; }
    return {
      reference: v.ref,
      note: noteStr || `Connected to this verse through the theme of ${category.toLowerCase()}`,
    };
  });

  log.info(`explanation generated in ${Date.now() - startMs}ms — ${explanation.length} chars, ${supportingScriptures.length} supporting verse(s)`);

  // 11. Persist to Supabase cache ────────────────────────────────────────────
  if (supabase) {
    supabase.from("verse_explanations").upsert(
      { verse_ref: reference, explanation, supporting_scriptures: supportingScriptures, generated_at: new Date().toISOString() },
      { onConflict: "verse_ref" }
    ).then(({ error }) => {
      if (error) log.warn(`failed to cache explanation for ${reference}: ${error.message}`);
      else log.info(`cached explanation for ${reference}`);
    });
  }

  return { explanation, supportingScriptures, engine: "algorithmic" };
}
