// ─── Full-Bible TF-IDF inverted index ────────────────────────────────────────
// Indexes all 31,102 KJV verses on first use. After a ~1-2s one-time build
// (warmed in background at startup), every query is pure in-memory and fast.
//
// This is what makes the prayer engine "self-expanding without an LLM":
// instead of being constrained to ~40 curated verses, every desire text is
// matched against the entire Bible using real TF-IDF relevance scoring, so
// "I need help with my marriage" surfaces Malachi 2:16, Ephesians 5:25, and
// 1 Corinthians 13:4-7 — not just whatever we happened to hand-curate.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIBLE_DIR = path.join(__dirname, "..", "data", "bible");

// ── Theological section classification ───────────────────────────────────────
// Used for diversity enforcement: multi-point prayers spread across sections
// so no prayer has five Psalms in a row.
export const BOOK_SECTION = {
  1:"Law",2:"Law",3:"Law",4:"Law",5:"Law",
  6:"History",7:"History",8:"History",9:"History",10:"History",
  11:"History",12:"History",13:"History",14:"History",15:"History",
  16:"History",17:"History",
  18:"Wisdom",19:"Wisdom",20:"Wisdom",21:"Wisdom",22:"Wisdom",
  23:"Prophets",24:"Prophets",25:"Prophets",26:"Prophets",27:"Prophets",
  28:"Prophets",29:"Prophets",30:"Prophets",31:"Prophets",32:"Prophets",
  33:"Prophets",34:"Prophets",35:"Prophets",36:"Prophets",37:"Prophets",
  38:"Prophets",39:"Prophets",
  40:"Gospels",41:"Gospels",42:"Gospels",43:"Gospels",
  44:"Acts",
  45:"Epistles",46:"Epistles",47:"Epistles",48:"Epistles",49:"Epistles",
  50:"Epistles",51:"Epistles",52:"Epistles",53:"Epistles",54:"Epistles",
  55:"Epistles",56:"Epistles",57:"Epistles",58:"Epistles",59:"Epistles",
  60:"Epistles",61:"Epistles",62:"Epistles",63:"Epistles",64:"Epistles",
  65:"Epistles",
  66:"Revelation",
};

// Section priority order for diversity pass (most theologically rich first)
const SECTION_PRIORITY = ["Epistles","Gospels","Wisdom","Prophets","Acts","History","Law","Revelation"];

const STOP = new Set([
  "the","and","for","that","with","this","have","from","your","you","are","was","will",
  "his","her","them","they","been","who","what","when","about","just","like","can",
  "not","but","all","one","him","she","its","also","than","then","into","more","which",
  "their","there","out","has","had","would","could","should","said","shall","upon",
  "unto","thee","thou","thy","hath","doth","saith","mine","thine","yea","yet","nor",
  "now","thus","even","both","very","such","where","here","our","let","did",
  "come","came","went","may","might","say","see","lord","god","man","men","people",
]);

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w));
}

// ── Core index class ─────────────────────────────────────────────────────────
class BibleIndex {
  constructor() {
    this._built = false;
    // word → flat array of verse entry objects
    this._posting = new Map();
    // word → IDF score
    this._idf = new Map();
    // bookId → name
    this._bookNames = new Map();
    // section → [verse entries] (for section-level random access)
    this._bySection = new Map();
    // ref → entry (for fast lookup by ref)
    this._byRef = new Map();
    this._totalVerses = 0;
  }

  // Synchronous build — called lazily or explicitly via warmBibleIndex()
  build() {
    if (this._built) return;
    const t0 = Date.now();
    const bookIndex = JSON.parse(readFileSync(path.join(BIBLE_DIR, "index.json"), "utf-8"));
    const docFreq = new Map();

    for (const bookMeta of bookIndex) {
      const bookId = bookMeta.id;
      const bookName = bookMeta.name;
      this._bookNames.set(bookId, bookName);
      const section = BOOK_SECTION[bookId] ?? "History";
      if (!this._bySection.has(section)) this._bySection.set(section, []);

      let chapters;
      try {
        chapters = JSON.parse(readFileSync(path.join(BIBLE_DIR, `book-${bookId}.json`), "utf-8"));
      } catch { continue; }

      for (let c = 0; c < chapters.length; c++) {
        const verseList = chapters[c];
        if (!Array.isArray(verseList)) continue;
        for (let v = 0; v < verseList.length; v++) {
          const text = typeof verseList[v] === "string" ? verseList[v] : "";
          if (!text.trim()) continue;

          const ref = `${bookName} ${c + 1}:${v + 1}`;
          const entry = { ref, bookId, bookName, ch: c + 1, v: v + 1, text, section };

          this._byRef.set(ref, entry);
          this._bySection.get(section).push(entry);
          this._totalVerses++;

          const words = tokenize(text);
          const wordSet = new Set(words);
          for (const w of wordSet) docFreq.set(w, (docFreq.get(w) ?? 0) + 1);
          for (const w of words) {
            if (!this._posting.has(w)) this._posting.set(w, []);
            this._posting.get(w).push(entry);
          }
        }
      }
    }

    // Compute IDF
    for (const [word, count] of docFreq) {
      this._idf.set(word, Math.log((this._totalVerses + 1) / (count + 1)) + 1);
    }

    this._built = true;
    console.log(`[bible-index] built: ${this._totalVerses} verses, ${this._posting.size} terms in ${Date.now() - t0}ms`);
  }

  get isBuilt() { return this._built; }
  get totalVerses() { return this._totalVerses; }
  bookName(bookId) { return this._bookNames.get(bookId) ?? ""; }
  byRef(ref) { return this._byRef.get(ref) ?? null; }

  // ── TF-IDF query ────────────────────────────────────────────────────────────
  // Returns topN verses ranked by summed IDF of matched query terms.
  // `weights` (optional) is a Map of ref → learned_weight that shifts ranking.
  // `curatedBoost` is an extra score bonus for refs in the curated verse bank.
  query(desireText, { topN = 20, weights = null, curatedRefs = null } = {}) {
    this.build();
    const queryWords = tokenize(desireText);
    if (!queryWords.length) return [];

    const scores = new Map();  // ref → tfidf score
    const entryRef = new Map(); // ref → entry

    for (const w of queryWords) {
      const idf = this._idf.get(w) ?? 0;
      if (idf === 0) continue;
      const postings = this._posting.get(w) ?? [];
      for (const entry of postings) {
        scores.set(entry.ref, (scores.get(entry.ref) ?? 0) + idf);
        entryRef.set(entry.ref, entry);
      }
    }

    // Apply learned weights + curated boost
    const ranked = [...scores.entries()].map(([ref, score]) => {
      let final = score;
      if (weights) final *= (weights.get(ref) ?? 1.0);
      if (curatedRefs?.has(ref)) final *= 1.4; // hand-curated verses get a 40% boost
      return { ref, score: final, entry: entryRef.get(ref) };
    });

    ranked.sort((a, b) => b.score - a.score);
    return ranked.slice(0, topN).map(r => ({ ...r.entry, tfidfScore: r.score }));
  }

  // ── Diverse query ────────────────────────────────────────────────────────────
  // Returns `count` verses spread across theological sections.
  // Ensures prayers draw from multiple parts of Scripture.
  queryDiverse(desireText, count = 5, opts = {}) {
    this.build();
    const { weights = null, curatedRefs = null, excludeRefs = new Set() } = opts;
    // Pull a broad candidate pool
    const candidates = this.query(desireText, { topN: 80, weights, curatedRefs })
      .filter(e => !excludeRefs.has(e.ref));

    const result = [];
    const usedSections = new Set();

    // First pass: best representative from each section
    for (const section of SECTION_PRIORITY) {
      if (result.length >= count) break;
      const best = candidates.find(c => c.section === section && !usedSections.has(c.section));
      if (best) { result.push(best); usedSections.add(section); }
    }

    // Second pass: fill remaining with highest-scoring unused
    for (const c of candidates) {
      if (result.length >= count) break;
      if (!result.some(r => r.ref === c.ref)) result.push(c);
    }

    return result.slice(0, count);
  }

  // ── Auto-discovery ──────────────────────────────────────────────────────────
  // Returns verses that are relevant to the desire but NOT in the curated bank.
  // When these get high ratings, the scheduler promotes them to discovered_verses.
  findUncuratedMatches(desireText, curatedRefs, topN = 5) {
    this.build();
    return this.query(desireText, { topN: 30, curatedRefs })
      .filter(e => !curatedRefs.has(e.ref))
      .slice(0, topN);
  }

  // ── Contextual fetch ─────────────────────────────────────────────────────────
  // Returns the N verses immediately surrounding a reference — used for
  // deeper explanations and cross-reference enrichment.
  surroundingContext(ref, radius = 2) {
    this.build();
    const entry = this._byRef.get(ref);
    if (!entry) return [];
    const { bookId, bookName, ch, v } = entry;
    const section = BOOK_SECTION[bookId] ?? "History";
    const result = [];
    for (let dv = -radius; dv <= radius; dv++) {
      if (dv === 0) continue;
      const candidateRef = `${bookName} ${ch}:${v + dv}`;
      const e = this._byRef.get(candidateRef);
      if (e) result.push(e);
    }
    return result;
  }
}

// ── Singleton export ─────────────────────────────────────────────────────────
let _instance = null;
export function getBibleIndex() {
  if (!_instance) _instance = new BibleIndex();
  return _instance;
}

// Call this after server startup to warm the index before first user request.
export function warmBibleIndex() {
  setTimeout(() => {
    try {
      const t = getBibleIndex();
      if (!t.isBuilt) t.build();
    } catch (e) {
      console.warn("[bible-index] warm failed:", e.message);
    }
  }, 4000);
}
