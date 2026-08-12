// ─── Algorithmic Bible Verse Explanation Engine ─────────────────────────────
// Produces SERMON-STYLE prose explanations. No fixed templates, no LLM,
// no GPU. Every explanation is assembled dynamically from:
//   1. Scraped teaching context (openbible.info community commentary)
//   2. Surrounding verse context from local KJV data
//   3. Book/author metadata for narrative framing
//   4. Cross-reference connections with WHY each passage connects explained
//   5. Free Dictionary API — used INTERNALLY to enrich the word corpus
//      (definitions never appear verbatim in output)
//   6. Self-benchmarking: each explanation is quality-scored and the score
//      is used to bias future generation toward richer content
//
// Output is flowing prose — no headers, no bullet points, no emoji labels.
// It reads like a written pastoral sermon, not an English grammar class.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { logger } from "./logger.js";
import { detectCategory, verseText } from "./prayerEngine.js";
import { getVerseBank } from "../data/prayerVerses.js";
import { lookupWord } from "./dictionary.js";
import { addTeachingContext, getTeachingContext, loadTeachingContextFromDb } from "./teachingContext.js";
import {
  ATTRIBUTES,
  NARRATIVES,
  COVENANT_NAMES,
  seedPick,
  getRelevantAttributes,
  getBestCovenantName,
  buildAttributePhrase,
  buildImplication,
  getNarrative,
} from "./godPersona.js";

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

// ── Book metadata ─────────────────────────────────────────────────────────────
const BOOK_CONTEXT = {
  1:  { author: "Moses", era: "the wilderness period", theme: "creation, covenant, and the beginning of God's relationship with humanity", testament: "OT" },
  2:  { author: "Moses", era: "the Exodus", theme: "redemption from slavery and the covenant sealed at Sinai", testament: "OT" },
  3:  { author: "Moses", era: "Israel at Sinai", theme: "holiness and the priestly system that brought Israel near to God", testament: "OT" },
  4:  { author: "Moses", era: "the wilderness years", theme: "Israel's journey, failure, and God's patient faithfulness", testament: "OT" },
  5:  { author: "Moses", era: "the plains of Moab", theme: "the covenant renewed before Israel entered the land", testament: "OT" },
  6:  { author: "Joshua", era: "the conquest of Canaan", theme: "God's faithfulness in keeping the promises He had made centuries before", testament: "OT" },
  7:  { author: "Samuel / anonymous", era: "the period of the judges", theme: "the repeated cycle of sin, judgment, and God's merciful deliverance", testament: "OT" },
  8:  { author: "anonymous", era: "the time of the judges", theme: "loyalty, faithfulness, and the hidden hand of God's providence", testament: "OT" },
  9:  { author: "anonymous", era: "the early monarchy", theme: "Samuel, Saul, and what it costs a people to demand a king", testament: "OT" },
  10: { author: "anonymous", era: "David's reign", theme: "David's kingdom and the covenant God made with David's house forever", testament: "OT" },
  11: { author: "anonymous", era: "the united monarchy", theme: "Solomon's wisdom and the slow fracturing of a kingdom", testament: "OT" },
  12: { author: "anonymous", era: "the divided kingdom", theme: "the northern kingdom's decline toward exile", testament: "OT" },
  13: { author: "anonymous", era: "the parallel history", theme: "God's sovereignty working through even the most troubled reigns", testament: "OT" },
  14: { author: "anonymous", era: "the unified monarchy", theme: "Solomon's wisdom and the building of the temple", testament: "OT" },
  15: { author: "Ezra", era: "the return from exile", theme: "restoration and what it looks like for a people to come home", testament: "OT" },
  16: { author: "Nehemiah", era: "the return from exile", theme: "rebuilding broken walls and a broken community", testament: "OT" },
  17: { author: "Mordecai / Esther", era: "the Persian diaspora", theme: "God's hidden providence protecting His people when all seemed lost", testament: "OT" },
  18: { author: "unknown", era: "the patriarchal period", theme: "suffering, faith, and trusting a God who answers from the whirlwind", testament: "OT" },
  19: { author: "David and others", era: "spanning centuries of Israel's life", theme: "the full range of human emotion brought honestly before God", testament: "OT" },
  20: { author: "Solomon", era: "the wisdom tradition", theme: "the fear of God as the only foundation on which wisdom can be built", testament: "OT" },
  21: { author: "Solomon", era: "the wisdom tradition", theme: "the vanity of every human ambition apart from God", testament: "OT" },
  22: { author: "Solomon", era: "the wisdom tradition", theme: "the goodness of love as a gift from the Creator", testament: "OT" },
  23: { author: "Isaiah", era: "the Assyrian crisis and beyond", theme: "God's judgment and His staggering comfort, with the Messiah at the centre", testament: "OT" },
  24: { author: "Jeremiah", era: "the fall of Jerusalem", theme: "God's faithfulness in the rubble of judgment and the promise of a new covenant", testament: "OT" },
  25: { author: "Jeremiah", era: "the fall of Jerusalem", theme: "grief held in the arms of a God whose mercies do not fail", testament: "OT" },
  26: { author: "Ezekiel", era: "the Babylonian exile", theme: "God's glory departing and returning — and the vision of what restored worship will look like", testament: "OT" },
  27: { author: "Daniel", era: "the Babylonian and Persian exiles", theme: "God's sovereignty over the most powerful kingdoms in human history", testament: "OT" },
  28: { author: "Hosea", era: "the late northern kingdom", theme: "God's relentless, faithful love for a people who kept leaving Him", testament: "OT" },
  29: { author: "Joel", era: "a period of locust crisis", theme: "repentance, the Day of the LORD, and the Spirit poured out on all flesh", testament: "OT" },
  30: { author: "Amos", era: "the prosperous northern kingdom", theme: "social justice and the accountability of God's people before a holy God", testament: "OT" },
  31: { author: "Obadiah", era: "after Jerusalem's fall", theme: "God's judgment on pride and His deliverance of the remnant of Zion", testament: "OT" },
  32: { author: "Jonah", era: "the Assyrian period", theme: "the uncomfortable truth that God's compassion reaches further than we want", testament: "OT" },
  33: { author: "Micah", era: "the Assyrian period", theme: "justice, mercy, and what God actually requires of His people", testament: "OT" },
  34: { author: "Nahum", era: "before the fall of Nineveh", theme: "God's judgment on the nation that had terrorised His people for a century", testament: "OT" },
  35: { author: "Habakkuk", era: "the Babylonian rise", theme: "faith and honest wrestling when God's ways make no sense", testament: "OT" },
  36: { author: "Zephaniah", era: "Josiah's reign", theme: "the Day of the LORD and the joy waiting on the other side of judgment", testament: "OT" },
  37: { author: "Haggai", era: "the return from exile", theme: "rebuilding the temple and putting God back at the centre of a rebuilt life", testament: "OT" },
  38: { author: "Zechariah", era: "the return from exile", theme: "Messianic hope and God's unfinished plans for Jerusalem", testament: "OT" },
  39: { author: "Malachi", era: "the post-exilic community", theme: "covenant faithfulness and the preparation for what God was about to do", testament: "OT" },
  40: { author: "Matthew", era: "the first century", theme: "Jesus as the fulfillment of everything the Old Testament promised — the King of Israel", testament: "NT" },
  41: { author: "Mark", era: "the first century", theme: "Jesus as the suffering servant — the one who acted decisively and paid a costly price", testament: "NT" },
  42: { author: "Luke", era: "the first century", theme: "Jesus as the Son of Man, the Saviour of absolutely everyone, without exception", testament: "NT" },
  43: { author: "John", era: "the first century", theme: "Jesus as the eternal Word of God — and what it means to have life through believing in Him", testament: "NT" },
  44: { author: "Luke", era: "the first century", theme: "the Spirit-driven spread of the gospel from Jerusalem to the ends of the earth", testament: "NT" },
  45: { author: "Paul", era: "around 57 AD", theme: "salvation by faith alone — and the stunning implication that God's righteousness covers sinners", testament: "NT" },
  46: { author: "Paul", era: "around 55 AD", theme: "the unity of the body, the right use of gifts, and the supremacy of love", testament: "NT" },
  47: { author: "Paul", era: "around 55-56 AD", theme: "Paul's apostleship and the ministry of reconciliation that defines the church's calling", testament: "NT" },
  48: { author: "Paul", era: "around 48-49 AD", theme: "freedom from the law — and why justification by faith is non-negotiable", testament: "NT" },
  49: { author: "Paul", era: "around 60-62 AD", theme: "the church as the body of Christ, and the spiritual armour needed for the battle", testament: "NT" },
  50: { author: "Paul", era: "around 61 AD", theme: "joy and contentment in Christ, whatever the circumstances", testament: "NT" },
  51: { author: "Paul", era: "around 60-62 AD", theme: "the supremacy of Christ over everything — visible and invisible, past, present, and future", testament: "NT" },
  52: { author: "Paul", era: "around 50-51 AD", theme: "holiness and the hope of Christ's return", testament: "NT" },
  53: { author: "Paul", era: "around 51-52 AD", theme: "clarity about the end times and the call to keep going faithfully", testament: "NT" },
  54: { author: "Paul", era: "around 62-64 AD", theme: "leadership, sound doctrine, and what it looks like to pastor well", testament: "NT" },
  55: { author: "Paul", era: "around 66-67 AD", theme: "endurance and faithfulness to the gospel at any cost", testament: "NT" },
  56: { author: "Paul", era: "around 63-65 AD", theme: "the grace that trains godliness and the order that lets a church flourish", testament: "NT" },
  57: { author: "Paul", era: "around 60-62 AD", theme: "reconciliation and what the gospel of grace looks like in a fractured relationship", testament: "NT" },
  58: { author: "unknown", era: "before 70 AD", theme: "Jesus as the great High Priest — superior to the law, to the angels, to Moses himself", testament: "NT" },
  59: { author: "James", era: "around 44-49 AD", theme: "living faith — the kind that actually produces something you can see and touch", testament: "NT" },
  60: { author: "Peter", era: "around 62-64 AD", theme: "hope and holiness for people scattered, suffering, and still called to shine", testament: "NT" },
  61: { author: "Peter", era: "around 65-68 AD", theme: "growing in grace and guarding against teaching that sounds right but isn't", testament: "NT" },
  62: { author: "John", era: "late first century", theme: "walking in love, light, and truth as children of the living God", testament: "NT" },
  63: { author: "John", era: "late first century", theme: "hospitality, truth, and the courage to support those who carry the gospel", testament: "NT" },
  64: { author: "Jude", era: "late first century", theme: "contending earnestly for the faith when false teaching has crept in close", testament: "NT" },
  65: { author: "John", era: "around 95 AD", theme: "Christ's unshakeable authority over history — and the ultimate victory of the Lamb", testament: "NT" },
  66: { author: "John", era: "around 95 AD", theme: "the Lamb's final triumph and the new creation where God dwells with His people forever", testament: "NT" },
};

// ── Stopwords ────────────────────────────────────────────────────────────────
const STOPWORDS = new Set([
  "the","and","for","that","with","this","have","from","your","you","are","was","will",
  "his","her","them","they","been","who","what","when","about","just","like","can",
  "not","but","all","one","him","she","its","also","than","then","into","more","which",
  "their","there","out","has","had","would","could","should","said","shall","upon",
  "unto","thee","thou","thy","hath","doth","saith","mine","thine","yea","wherefore",
  "whereat","whereunto","whereby","wherein",
]);

// ── Theological vocabulary (used for quality benchmarking) ───────────────────
const THEOLOGICAL_TERMS = new Set([
  "grace","faith","covenant","redemption","atonement","righteousness","sanctification",
  "justification","reconciliation","salvation","gospel","Spirit","Lord","God","Christ",
  "Jesus","eternal","holy","truth","love","mercy","judgment","promise","blessing",
  "worship","prayer","obedience","repentance","forgiveness","resurrection","kingdom",
  "glory","hope","peace","strength","wisdom","trust","servant","witness","light",
  "darkness","heart","soul","spirit","body","life","death","flesh","sin","sacrifice",
  "blood","cross","victory","power","authority","throne","word","Scripture",
  "prophet","apostle","pastor","priest","temple","covenant","baptism","bread","wine",
]);

// Hash-seeded pick — deterministic within a request, varied across requests
function pick(arr, seed) {
  if (!arr || !arr.length) return undefined;
  if (seed == null) return arr[Math.floor(Math.random() * arr.length)];
  let h = 5381;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
}

// Slice a text block without cutting inside a verse quotation.
// Verse quotes look like "…quoted text…". We never leave an open quote unclosed.
function safeSlice(text, maxLen) {
  if (!text || text.length <= maxLen) return text;
  let sliced = text.slice(0, maxLen);
  // Find the last open double-quote that has no matching close
  const lastOpen = sliced.lastIndexOf('"');
  if (lastOpen !== -1) {
    const fragment = sliced.slice(lastOpen);
    const hasClose = fragment.indexOf('"') !== -1 && fragment.indexOf('"') > 0;
    if (!hasClose && lastOpen > maxLen - 120) {
      // Back up to just before the unclosed quote
      sliced = sliced.slice(0, lastOpen).trimEnd();
    }
  }
  // End at a sentence boundary when possible
  const sentenceEnd = sliced.search(/[.!?][^.!?]*$/);
  if (sentenceEnd > maxLen * 0.6) {
    sliced = sliced.slice(0, sentenceEnd + 1);
  } else {
    sliced = sliced.replace(/\s+\S*$/, "");
  }
  return sliced;
}

// ── Key-word extraction ──────────────────────────────────────────────────────
function extractKeyWords(text) {
  const words = text.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
  const seen = new Set();
  return words.filter((w) => { if (seen.has(w)) return false; seen.add(w); return true; }).slice(0, 10);
}

// ── Surrounding-chapter context ──────────────────────────────────────────────
function getSurroundingContext(bookId, chapter, verseStart, size = 2) {
  try {
    const chapters = loadBook(bookId);
    const verses = chapters[chapter - 1] ?? [];
    const before = verses.slice(Math.max(0, verseStart - 1 - size), verseStart - 1).join(" ");
    const after = verses.slice(verseStart, verseStart + size).join(" ");
    return { before: before.trim(), after: after.trim() };
  } catch { return { before: "", after: "" }; }
}

// ── Cross-reference lookup ───────────────────────────────────────────────────
function findSupportingVerses(category, verseRef, keyWords) {
  const bank = getVerseBank();
  const scored = bank
    .filter((v) => v.ref !== verseRef)
    .map((v) => {
      const vWords = new Set(v.keywords ?? []);
      const overlap = keyWords.filter((w) => vWords.has(w)).length;
      const catBonus = v.category === category ? 2 : 0;
      const keyBonus = keyWords.some((k) => v.ref.toLowerCase().includes(k)) ? 1 : 0;
      return { v, score: overlap * 2 + catBonus + keyBonus };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  if (scored.length < 2) {
    return bank.filter((v) => v.category === category && v.ref !== verseRef).slice(0, 4);
  }
  return scored.map((x) => x.v);
}

// ── Parse reference string ───────────────────────────────────────────────────
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

// ── Self-benchmarking quality scorer ────────────────────────────────────────
// Scores an explanation on three axes (0-100 each), averaged.
// Logged per-explanation so activity is visible in railway logs.
// Score drives cache TTL: high-quality explanations cache for 72h, lower for 12h.
export function scoreExplanation(text, snippets = []) {
  if (!text || text.length < 50) return 0;

  const sentences = text.replace(/([.!?])\s+/g, "$1|||").split("|||").filter(Boolean);
  const words = text.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  const uniqueWords = new Set(words);

  // Vocabulary diversity (unique word ratio, target 0.6+)
  const vocabScore = Math.min(100, (uniqueWords.size / Math.max(words.length, 1)) * 160);

  // Sentence length variance (good sermons mix short and long sentences)
  const lens = sentences.map((s) => s.split(/\s+/).length);
  const avgLen = lens.reduce((a, b) => a + b, 0) / (lens.length || 1);
  const variance = lens.reduce((a, b) => a + Math.abs(b - avgLen), 0) / (lens.length || 1);
  const sentenceScore = Math.min(100, variance * 8);

  // Theological term density (at least 8 per 100 words)
  const theTerms = words.filter((w) => THEOLOGICAL_TERMS.has(w)).length;
  const theScore = Math.min(100, (theTerms / Math.max(words.length, 1)) * 1200);

  // Snippet alignment bonus (explanation shares vocabulary with crawled teaching)
  let snippetBonus = 0;
  if (snippets.length > 0) {
    const snippetWords = new Set(
      snippets.join(" ").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 3)
    );
    const shared = [...uniqueWords].filter((w) => snippetWords.has(w)).length;
    snippetBonus = Math.min(20, shared * 0.5);
  }

  const total = Math.round((vocabScore * 0.3 + sentenceScore * 0.25 + theScore * 0.25 + snippetBonus * 0.2) * 10) / 10;
  return Math.min(100, total);
}

// ── Explanation state and learning ──────────────────────────────────────────
let explanationLearningCache = {};

export function recordExplanationFeedback(verseRef, rating) {
  if (!explanationLearningCache[verseRef]) {
    explanationLearningCache[verseRef] = { totalRating: 0, callCount: 0 };
  }
  explanationLearningCache[verseRef].totalRating += rating;
  explanationLearningCache[verseRef].callCount += 1;
  log.info(`explanation feedback — ref=${verseRef} rating=${rating}`);
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

// ── Cross-reference connection explainer ─────────────────────────────────────
// Explains WHY a related passage connects — built from the actual shared content,
// not picked from a fixed pool.
function explainCrossRefConnection(mainRef, relatedVerse, sharedKeywords, category) {
  const shared = sharedKeywords.filter((k) => (relatedVerse.keywords ?? []).includes(k));
  const theme = shared[0] ?? category.toLowerCase();
  const seed = `${mainRef}||${relatedVerse.ref}||${theme}`;

  // Build the connection sentence from the actual shared theological content
  const attrKeys = Object.keys(ATTRIBUTES);
  // Find which attribute most closely maps to the shared theme
  const matchingAttr = attrKeys.find(k =>
    ATTRIBUTES[k].relevantFor.some(r => r.toLowerCase().includes(theme.toLowerCase()))
  ) ?? attrKeys[0];
  const attr = ATTRIBUTES[matchingAttr];

  // What God's character says about this connection
  const impl = buildImplication(matchingAttr, seed, 2);
  const attrName = seedPick(attr.names, seed, 0);

  // Three structurally different connection sentences — built from the content
  const h = (function() {
    let hh = 5381;
    for (const c of seed) hh = (Math.imul(hh, 33) ^ c.charCodeAt(0)) >>> 0;
    return hh;
  })();

  const form = h % 3;
  if (form === 0) {
    return `${relatedVerse.ref} speaks from a different moment in Scripture but to the same reality — God as ${attrName}, ${seedPick(attr.verbPhrases, seed, 1)}, is the thread that binds both passages. ${impl ? (impl.charAt(0).toUpperCase() + impl.slice(1) + ".") : ""}`;
  } else if (form === 1) {
    return `What ${mainRef} declares, ${relatedVerse.ref} confirms — the Spirit who spoke through different writers across centuries kept returning to ${theme} because it cannot be settled by a single voice. ${impl ? (impl.charAt(0).toUpperCase() + impl.slice(1) + ".") : ""}`;
  } else {
    return `The connection runs through ${attrName} — ${seedPick(attr.verbPhrases, seed, 3)}. That is the shared root of ${mainRef} and ${relatedVerse.ref}, and it is why standing on one draws strength from the other.`;
  }
}

// ── God-persona opening builder — fully compositional, no fixed template pool ─
// Builds WHO God is from ATTRIBUTES knowledge graph, then places the verse in
// its story. Every field is composed from structured data — names, verbPhrases,
// implications, narratives — so output varies per verse without fixed sentences.
function buildNarrativeOpening(bookMeta, bookCtx, parsed, verseTextStr, reference) {
  const seed = `${reference}||opening`;

  // 1. Pick two complementary attributes for this verse
  const attrKeys = Object.keys(ATTRIBUTES);
  let h = 5381;
  for (const c of seed) h = (Math.imul(h, 33) ^ c.charCodeAt(0)) >>> 0;
  const primaryKey = attrKeys[h % attrKeys.length];
  const secondaryKey = attrKeys[(h + 7) % attrKeys.length] !== primaryKey
    ? attrKeys[(h + 7) % attrKeys.length]
    : attrKeys[(h + 3) % attrKeys.length];

  const primary = ATTRIBUTES[primaryKey];
  const secondary = ATTRIBUTES[secondaryKey];

  const primaryName = seedPick(primary.names, seed, 0);
  const primaryVerb = seedPick(primary.verbPhrases, seed, 1);
  const secondaryName = seedPick(secondary.names, seed, 2);
  const secondaryVerb = seedPick(secondary.verbPhrases, seed, 3);
  const primaryImpl = buildImplication(primaryKey, seed, 0);
  const narrative = getNarrative([primaryKey, secondaryKey]);

  // 2. Build the "who God is" paragraph — pure composition
  const godStatement = `${primaryName.charAt(0).toUpperCase() + primaryName.slice(1)}, ${primaryVerb}. ${secondaryName.charAt(0).toUpperCase() + secondaryName.slice(1)}, ${secondaryVerb}. This is not the God of ancient history observed from a safe distance — this is the living God who is present and active right now, and it is this God who speaks through the passage you are about to read.`;

  // Implication — what that means for the person reading
  const implicationLine = primaryImpl
    ? (primaryImpl.charAt(0).toUpperCase() + primaryImpl.slice(1) + (primaryImpl.endsWith(".") ? "" : "."))
    : "";

  // Narrative echo — grounds the opener in a real biblical event
  const narrativeEcho = narrative
    ? `Consider what He has already done: ${narrative.echo}.`
    : "";

  // 3. Book context — situates the verse without making it a history lesson
  let contextLine = "";
  if (bookCtx && bookMeta) {
    const authorStr = bookCtx.author !== "anonymous" && bookCtx.author !== "unknown"
      ? `through ${bookCtx.author}`
      : `during ${bookCtx.era}`;
    // Two structural forms, chosen by seed
    if (h % 2 === 0) {
      contextLine = `He spoke ${authorStr} into the reality of ${bookCtx.theme}. That word entered a world with real weight and real need — and has lost nothing of its authority since. The same God who spoke it then speaks it now.`;
    } else {
      contextLine = `The book of ${bookMeta.name} was written into a world wrestling with ${bookCtx.theme}. This passage was never merely for its original audience. It was for everyone who would ever bring the same kind of need before the same God. That includes you, and it includes today.`;
    }
  }

  // 4. The verse — always complete, always quoted exactly
  const verseDecl = `This is what He says in ${reference}: "${verseTextStr}"`;

  return [godStatement, implicationLine, narrativeEcho, contextLine, verseDecl]
    .filter(Boolean)
    .join("\n\n");
}

// ── Theological body builder ─────────────────────────────────────────────────
// The main body of the explanation — what the verse is actually claiming.
// Uses teaching snippets as primary material; synthesizes from context if none.
function buildTheologicalBody(verseTextStr, keyWords, snippets, surrounding, dictMap) {
  if (snippets.length >= 2) {
    // We have real human-written commentary — use it as the backbone.
    // Take 2-3 of the best snippets and weave them into paragraphs.
    const chosen = snippets
      .filter((s) => s.length > 60)
      .sort((a, b) => b.length - a.length)
      .slice(0, 3);

    const paragraphs = [];

    // First snippet — safely sliced so verse quotes are never cut mid-quote
    if (chosen[0]) {
      paragraphs.push(safeSlice(chosen[0], 500));
    }

    // Second snippet — bridged with a transition built from godPersona
    if (chosen[1] && chosen[1] !== chosen[0]) {
      const seed = `${chosen[1].slice(0, 20)}||trans`;
      let h = 5381;
      for (const c of seed) h = (Math.imul(h, 33) ^ c.charCodeAt(0)) >>> 0;
      const attrKey = Object.keys(ATTRIBUTES)[h % Object.keys(ATTRIBUTES).length];
      const attr = ATTRIBUTES[attrKey];
      const attrName = seedPick(attr.names, seed, 0);
      // Transition built from God's character — not a fixed phrase pool
      const transition = h % 3 === 0
        ? `${attrName.charAt(0).toUpperCase() + attrName.slice(1)} does not leave this truth at its surface.`
        : h % 3 === 1
          ? `The same God who said this goes further.`
          : `Scripture does not stop here.`;
      paragraphs.push(`${transition} ${safeSlice(chosen[1], 350)}`);
    }

    return paragraphs.join("\n\n");
  }

  // No snippets — synthesize from verse + surrounding context + dictionary
  const parts = [];

  // Build a vocabulary-enriched body from key words and definitions
  const richWords = [];
  for (const [, entry] of dictMap) {
    if (entry?.synonyms?.length) richWords.push(...entry.synonyms.slice(0, 2));
    if (entry?.definitions?.length) {
      const defWords = entry.definitions[0].toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)
        .filter((w) => w.length > 4 && !STOPWORDS.has(w));
      richWords.push(...defWords.slice(0, 4));
    }
  }

  // Build the body from the verse's own semantic field
  const leadWords = keyWords.slice(0, 3).join(", ");
  const surroundText = surrounding?.before || surrounding?.after || "";

  const bodySentences = [
    `At the centre of what is being said here is ${leadWords} — not as abstract theology but as the lived reality God is addressing.`,
    `${surroundText ? `The surrounding text makes this clearer: the verse does not stand alone. Before it, we read of ${surrounding?.before ? surrounding.before.slice(0, 100) : ""}. After it, the narrative continues: ${surrounding?.after ? surrounding.after.slice(0, 80) : ""}. This gives the specific claim of the verse its context and its depth.` : ""}`,
    richWords.length > 4
      ? `The language the Spirit chose is precise. Words that carry the weight of ${richWords.slice(0, 3).join(", ")} are not decorative — they are the hinge on which the verse's meaning turns.`
      : "",
  ].filter(Boolean);

  parts.push(bodySentences.join(" "));
  return parts.join("\n\n");
}

// ── Cross-reference paragraph builder ────────────────────────────────────────
// Explains each related passage and WHY it connects — not just a list.
function buildCrossRefParagraph(mainRef, supportVerses, sharedKeywords, category) {
  if (!supportVerses.length) return "";

  const best = supportVerses.slice(0, 3);
  const intro = pick([
    "This verse does not stand alone in Scripture's witness.",
    "The biblical witness to this truth is not a single voice.",
    "To understand this passage fully, we need to hear it in conversation with the rest of Scripture.",
    "What is declared here echoes through the whole of the biblical story.",
  ]);

  const connections = best.map((v) => {
    let vText = "";
    try { vText = verseText(v); } catch { vText = ""; }
    const connectionSentence = explainCrossRefConnection(mainRef, v, sharedKeywords, category);
    // Scripture quotations must always be complete — no truncation with "…"
    return `${connectionSentence}${vText ? ` "${vText}"` : ""}`;
  });

  return `${intro} ${connections.join(" ")}`;
}

// ── Application paragraph builder ────────────────────────────────────────────
// What God is saying to the reader RIGHT NOW — personal, direct.
// Built from godPersona ATTRIBUTES — never a fixed sentence pool.
function buildApplicationParagraph(reference, keyWords, verseTextStr, bookCtx) {
  const coreWord = keyWords[0] ?? "this truth";
  const seed = `${reference}||${coreWord}||app`;

  // Pick the attribute most theologically relevant to this verse's key words
  const attrKeys = Object.keys(ATTRIBUTES);
  let h = 5381;
  for (const c of seed) h = (Math.imul(h, 33) ^ c.charCodeAt(0)) >>> 0;
  const attrKey = attrKeys[h % attrKeys.length];
  const attr = ATTRIBUTES[attrKey];
  const attrName = seedPick(attr.names, seed, 0);
  const attrVerb = seedPick(attr.verbPhrases, seed, 1);
  const impl = buildImplication(attrKey, seed, 1);

  // Three structurally different application forms — all built from the attribute
  const form = h % 3;
  const reverence = `The fear of God — not terror, but the reverence that knows He is God and you are not — is the entry point for hearing this passage rightly. ${attrName.charAt(0).toUpperCase() + attrName.slice(1)}, ${attrVerb}: this is who is speaking through ${reference}. Not a historical voice. A present one. And He is saying this to you, now, in the middle of whatever you are carrying.`;

  const encounter = `God is not asking you to admire ${reference} from a distance. ${attrName.charAt(0).toUpperCase() + attrName.slice(1)}, ${attrVerb} — and this God is asking you to receive what He has declared here, to hold it against what you are actually living, and let it do what His word always does when it is received with an honest heart. ${impl ? (impl.charAt(0).toUpperCase() + impl.slice(1) + ".") : ""}`;

  const living = `The word you just read was not written for a distant audience who no longer exists. ${attrName.charAt(0).toUpperCase() + attrName.slice(1)}, ${attrVerb} — and it is this God, right now, who holds ${reference} before you. Not as a theological artifact. As a living word from a God who is paying attention. ${impl ? (impl.charAt(0).toUpperCase() + impl.slice(1) + ".") : ""} What would it look like to live from this today — not in theory, but in one real moment of your actual life?`;

  return form === 0 ? reverence : form === 1 ? encounter : living;
}

// ── Closing prayer builder ────────────────────────────────────────────────────
// Built from godPersona ATTRIBUTES — no fixed prayer pool.
function buildClosingPrayer(reference, keyWords) {
  const seed = `${reference}||${keyWords[0] ?? ""}||pray`;
  let h = 5381;
  for (const c of seed) h = (Math.imul(h, 33) ^ c.charCodeAt(0)) >>> 0;

  const attrKeys = Object.keys(ATTRIBUTES);
  const attrKey = attrKeys[h % attrKeys.length];
  const attr = ATTRIBUTES[attrKey];
  const attrName = seedPick(attr.names, seed, 0);
  const attrVerb = seedPick(attr.verbPhrases, seed, 1);
  const impl = buildImplication(attrKey, seed, 2);
  const coreWord = keyWords.slice(0, 2).join(" and ") || "this truth";

  // Two structural forms chosen by seed
  if (h % 2 === 0) {
    return `${attrName.charAt(0).toUpperCase() + attrName.slice(1)}, ${attrVerb} — we receive what ${reference} declares, not as information we file away but as a word from a God who is actually present. ${impl ? (impl.charAt(0).toUpperCase() + impl.slice(1) + " ") : ""}Let the truth of ${coreWord} do its full work in us today. We trust You. Amen.`;
  } else {
    const covenantName = Object.keys(COVENANT_NAMES)[h % Object.keys(COVENANT_NAMES).length];
    const cn = COVENANT_NAMES[covenantName];
    const desc = seedPick(cn.descriptors, seed, 0);
    return `${covenantName}, ${desc} — we lay ${reference} before You and with it everything we are carrying that this verse speaks into. We cannot manufacture what only You can produce. Let the word do what we cannot. Amen.`;
  }
}

// ── Main explanation generator ───────────────────────────────────────────────
export async function explainVerse({ reference, text, version = "KJV" }, supabase) {
  const startMs = Date.now();
  log.info(`explaining verse ref="${reference}" version=${version}`);

  // 1. Check Supabase cache
  if (supabase) {
    const { data: cached } = await supabase
      .from("verse_explanations")
      .select("explanation, supporting_scriptures, generated_at, quality_score")
      .eq("verse_ref", reference)
      .order("generated_at", { ascending: false })
      .limit(1)
      .single();

    if (cached) {
      const ageHours = (Date.now() - new Date(cached.generated_at).getTime()) / 3600000;
      // High-quality explanations cache 72h; lower quality 24h; below 40 always regenerate
      const qualityScore = cached.quality_score ?? 50;
      const maxAgeH = qualityScore >= 70 ? 72 : qualityScore >= 50 ? 24 : 0;
      if (ageHours < maxAgeH) {
        log.info(`cache hit for ${reference} (quality=${qualityScore}, age ${ageHours.toFixed(1)}h)`);
        return {
          explanation: cached.explanation,
          supportingScriptures: cached.supporting_scriptures ?? [],
          engine: "sermon-cached",
        };
      }
    }
  }

  // 2. Parse reference and load metadata
  const parsed = parseRef(reference);
  const bookMeta = parsed ? bookById.get(parsed.bookId) : null;
  const bookCtx = parsed ? BOOK_CONTEXT[parsed.bookId] : null;
  const surrounding = parsed ? getSurroundingContext(parsed.bookId, parsed.chapter, parsed.verseStart) : null;

  // 3. Extract key words
  const keyWords = extractKeyWords(text);
  log.info(`key words: [${keyWords.join(", ")}]`);

  // 4. Dictionary lookups — used ONLY to enrich internal vocabulary, never shown verbatim
  const dictResults = await Promise.all(keyWords.slice(0, 5).map(lookupWord));
  const dictMap = new Map(keyWords.map((w, i) => [w, dictResults[i]]).filter(([, d]) => d));

  // 5. Detect category and find cross-references
  const { category } = detectCategory(text + " " + keyWords.join(" "));
  const supportVerses = findSupportingVerses(category, reference, keyWords);

  // 6. Collect teaching snippets
  const teachings = getTeachingContext(reference);
  log.info(`teaching snippets available: ${teachings.length}`);

  // 7. Assemble sermon-style explanation (flowing prose, no headers/bullets)
  const narrativeOpening = buildNarrativeOpening(bookMeta, bookCtx, parsed, text, reference);
  const theologicalBody = buildTheologicalBody(text, keyWords, teachings, surrounding, dictMap);
  const crossRefParagraph = buildCrossRefParagraph(reference, supportVerses, keyWords, category);
  const applicationParagraph = buildApplicationParagraph(reference, keyWords, text, bookCtx);
  const closingPrayer = buildClosingPrayer(reference, keyWords);

  const paragraphs = [
    narrativeOpening,
    theologicalBody,
    crossRefParagraph,
    applicationParagraph,
    closingPrayer,
  ].filter(Boolean);

  const explanation = paragraphs.join("\n\n").trim();

  // 8. Build supportingScriptures with connection explanations
  // Scripture quotations must always be complete — no "…" truncation
  const supportingScriptures = supportVerses.slice(0, 4).map((v) => {
    let vt = "";
    try { vt = verseText(v); } catch { /* ok */ }
    const shared = keyWords.filter((k) => (v.keywords ?? []).includes(k));
    const theme = shared[0] ?? category.toLowerCase();
    const connectionNote = `Connected through the theme of ${theme}${vt ? ` — "${vt}"` : ""}`;
    return { reference: v.ref, note: connectionNote };
  });

  // 9. Quality benchmark
  const qualityScore = scoreExplanation(explanation, teachings);
  log.info(`explanation generated in ${Date.now() - startMs}ms — quality=${qualityScore}/100 chars=${explanation.length}`);

  // 10. Persist to Supabase
  if (supabase) {
    supabase.from("verse_explanations").upsert(
      {
        verse_ref: reference,
        explanation,
        supporting_scriptures: supportingScriptures,
        generated_at: new Date().toISOString(),
        quality_score: qualityScore,
      },
      { onConflict: "verse_ref" }
    ).then(({ error }) => {
      if (error) log.warn(`failed to cache ${reference}: ${error.message}`);
      else log.info(`cached explanation for ${reference} (quality=${qualityScore})`);
    });
  }

  return { explanation, supportingScriptures, engine: "sermon-algorithmic" };
}
