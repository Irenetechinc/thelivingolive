// ─── KJV Bigram Language Model ────────────────────────────────────────────────
// Trained on the full KJV text. Produces short phrases in the biblical register
// that are woven into dynamically generated prayers — creating language that
// is genuinely rooted in scripture vocabulary and prose patterns rather than
// pre-written pool strings.
//
// Key property: the same (seedWord, seedStr) input always produces the same
// output phrase (deterministic pick from bigram table), so a given verse
// always produces consistent language — but different verses produce
// genuinely different phrases, because they start from different seed words.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIBLE_DIR = path.join(__dirname, "..", "data", "bible");

// Words that produce rich, theologically meaningful bigram sequences
const SKIP = new Set([
  "the","and","for","that","with","this","have","from","are","was","will","his","her",
  "them","they","been","who","what","when","about","just","can","not","but","all","one",
  "him","she","its","also","than","then","into","more","which","their","there","out",
  "has","had","would","could","should","shall","upon","unto","thee","thou","thy",
  "hath","doth","saith","mine","thine","yea","yet","nor","now","thus","even","both",
  "very","such","where","here","our","let","did","say","see","said","lord","god",
  "man","men","people","also","every","said","thereof","therein","wherein",
]);

// KJV-specific contractions to normalize
function normalizeWord(w) {
  return w.toLowerCase().replace(/[^a-z']/g, "").replace(/'s$/, "").replace(/'t$/, "t");
}

class MarkovBible {
  constructor() {
    this._built = false;
    // word → Map(nextWord → count)
    this._bigrams  = new Map();
    // word → Map(nextNextWord → count) — trigram for smoother generation
    this._trigrams = new Map(); // "w1 w2" → Map(nextWord → count)
    this._totalBigrams = 0;
  }

  build() {
    if (this._built) return;
    const t0 = Date.now();
    const bookIndex = JSON.parse(readFileSync(path.join(BIBLE_DIR, "index.json"), "utf-8"));

    for (const bookMeta of bookIndex) {
      let chapters;
      try {
        chapters = JSON.parse(readFileSync(path.join(BIBLE_DIR, `book-${bookMeta.id}.json`), "utf-8"));
      } catch { continue; }

      for (const chapter of chapters) {
        if (!Array.isArray(chapter)) continue;
        for (const verseText of chapter) {
          if (typeof verseText !== "string") continue;
          // Split on KJV clause delimiters to get natural phrase units
          const clauses = verseText.split(/[;:,.]/);
          for (const clause of clauses) {
            const words = clause.trim().split(/\s+/)
              .map(normalizeWord)
              .filter(w => w.length > 1);
            if (words.length < 2) continue;
            for (let i = 0; i < words.length - 1; i++) {
              const w  = words[i];
              const w2 = words[i + 1];
              if (!this._bigrams.has(w)) this._bigrams.set(w, new Map());
              const bm = this._bigrams.get(w);
              bm.set(w2, (bm.get(w2) ?? 0) + 1);
              this._totalBigrams++;
              // Trigrams
              if (i < words.length - 2) {
                const key = `${w} ${w2}`;
                const w3  = words[i + 2];
                if (!this._trigrams.has(key)) this._trigrams.set(key, new Map());
                const tm = this._trigrams.get(key);
                tm.set(w3, (tm.get(w3) ?? 0) + 1);
              }
            }
          }
        }
      }
    }

    this._built = true;
    console.log(`[markov-bible] built: ${this._bigrams.size} states, ${this._totalBigrams} bigrams in ${Date.now() - t0}ms`);
  }

  get isBuilt() { return this._built; }

  // ── Deterministic weighted pick ──────────────────────────────────────────
  // Uses the top-K most frequent successors, picking among them by a hash of
  // the seed string. Same seed → same pick. Different seeds → varied picks.
  _pick(map, seedStr, topK = 6) {
    if (!map || map.size === 0) return null;
    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const pool   = sorted.slice(0, Math.min(topK, sorted.length));
    let h = 5381;
    for (let i = 0; i < seedStr.length; i++) h = (Math.imul(h, 33) ^ seedStr.charCodeAt(i)) >>> 0;
    return pool[h % pool.length][0];
  }

  // ── Phrase generation ─────────────────────────────────────────────────────
  // Generates a phrase of up to `len` words starting from `seedWord`.
  // Prefers trigram transitions when available (smoother, more coherent).
  // The `seedStr` is mixed into every pick to create deterministic variety.
  generatePhrase(seedWord, len = 9, seedStr = "") {
    this.build();
    const words = [seedWord.toLowerCase()];
    for (let i = 0; i < len - 1; i++) {
      const prev = words[words.length - 2] ?? null;
      const curr = words[words.length - 1];
      const triKey = prev ? `${prev} ${curr}` : null;
      const triMap = triKey ? this._trigrams.get(triKey) : null;
      const biMap  = this._bigrams.get(curr);
      // Prefer trigram (more coherent) but fall back to bigram
      const chosen = (triMap && triMap.size > 0)
        ? this._pick(triMap, seedStr + i, 5)
        : this._pick(biMap, seedStr + i, 6);
      if (!chosen) break;
      words.push(chosen);
    }
    return words.join(" ");
  }

  // ── Bridge phrase ────────────────────────────────────────────────────────
  // Takes key words from the verse text and generates a biblical-register
  // phrase that serves as a connective "echo" in the prayer movement.
  // Returns empty string if the model is not built or no good seed word found.
  bridgePhrase(verseText, seedStr = "", len = 10) {
    if (!this._built) return "";
    // Find words in the verse that have rich bigram successors
    const candidates = verseText.toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter(w => {
        if (w.length < 4 || SKIP.has(w)) return false;
        const bm = this._bigrams.get(w);
        return bm && bm.size >= 3;
      });
    if (!candidates.length) return "";
    // Pick seed word deterministically
    let h = 0;
    for (const ch of seedStr) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0;
    const seed = candidates[Math.abs(h) % candidates.length];
    const phrase = this.generatePhrase(seed, len, seedStr);
    // Capitalize first word, return if it's long enough to be meaningful
    if (phrase.split(" ").length < 4) return "";
    return phrase.charAt(0).toUpperCase() + phrase.slice(1);
  }

  // ── Verse paraphrase ─────────────────────────────────────────────────────
  // Generates a short paraphrase-like phrase by chaining through the most
  // theologically significant words of the verse. Used in the DECLARE
  // movement to deepen the scripture reflection beyond a single quote.
  verseEcho(verseText, seedStr = "") {
    if (!this._built) return "";
    const words = verseText.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)
      .filter(w => w.length > 4 && !SKIP.has(w) && this._bigrams.has(w));
    if (words.length < 2) return "";
    // Use two different words from the verse as anchors, connected by their bigram chains
    let h = 0;
    for (const ch of seedStr) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0;
    const w1 = words[Math.abs(h) % words.length];
    const w2 = words[Math.abs(h + 7) % words.length];
    const p1 = this.generatePhrase(w1, 5, seedStr + "a");
    const p2 = this.generatePhrase(w2, 5, seedStr + "b");
    if (p1 === p2 || p2.split(" ").length < 3) return p1;
    return `${p1} — ${p2}`;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
let _instance = null;
export function getMarkov() {
  if (!_instance) _instance = new MarkovBible();
  return _instance;
}

export function warmMarkov() {
  setTimeout(() => {
    try {
      const m = getMarkov();
      if (!m.isBuilt) m.build();
    } catch (e) {
      console.warn("[markov-bible] warm failed:", e.message);
    }
  }, 9000); // after bible-index warms (4s), start markov (9s)
}
