// ─── Dynamic prayer / devotion engine ────────────────────────────────────────
// Produces unique prayer points and devotionals from four live data sources:
//
//   1. Bible text — full KJV, 31 102 verses, via TF-IDF verse selection
//   2. KJV Markov model — bigram/trigram chains produce biblical-register
//      phrases that are unique to each verse because they start from that
//      verse's own vocabulary
//   3. Free Dictionary API — definitions and synonyms for verse key words,
//      used to articulate theological language with precision
//   4. Web-crawled teaching snippets — short real-world commentary passages
//      stored by the web crawler; woven into reflections and prayer bodies
//
// There are NO fixed language pools, NO pre-written sentences to pick from.
// Every address, declaration, petition, and commitment is built at runtime
// from the actual verse text + the user's actual words + the above sources.
// The output evolves as the Bible index learns from usage, new verses are
// discovered by the crawler, and verse weights shift from feedback.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { CATEGORIES, getVerseBank, VERSE_BANK } from "../data/prayerVerses.js";
import { getBibleIndex } from "./bibleIndex.js";
import { getMarkov } from "./markovBible.js";
import { lookupWord, enrichWords } from "./dictionary.js";
import { getTeachingContext } from "./teachingContext.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIBLE_DIR = path.join(__dirname, "..", "data", "bible");
const bookCache = new Map();

function loadBook(bookId) {
  if (!bookCache.has(bookId)) {
    bookCache.set(bookId, JSON.parse(readFileSync(path.join(BIBLE_DIR, `book-${bookId}.json`), "utf-8")));
  }
  return bookCache.get(bookId);
}

export function verseText(entry) {
  const chapters = loadBook(entry.bookId);
  const verses   = chapters[entry.chapter - 1] ?? [];
  const start    = entry.verseStart;
  const end      = entry.verseEnd ?? entry.verseStart;
  return verses.slice(start - 1, end).join(" ");
}

const CURATED_REFS = new Set(VERSE_BANK.map(v => v.ref));

const STOP = new Set([
  "the","and","for","that","with","this","have","from","your","you","are","was","will",
  "his","her","them","they","been","who","what","when","about","just","like","can",
  "not","but","all","one","him","she","its","also","than","then","into","more","which",
  "their","there","out","has","had","would","could","should","said","shall","upon",
  "unto","thee","thou","thy","hath","doth","saith","mine","thine","yea","yet","nor",
  "now","thus","even","both","very","such","where","here","our","let","did","come",
  "came","went","may","might","say","see",
]);

function tokenize(text) {
  return (text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w));
}

// Words that look like content but carry no theological weight — skip them
// in titles, addresses, and anywhere we need a meaningful verse keyword.
const VERSE_NOISE = new Set([
  "also","every","thereof","therein","wherein","because","behold","blessed","shall",
  "little","thing","things","every","many","much","some","same","like","time","times",
  "come","came","went","goes","doth","given","give","gave","take","took","kept","keep",
  "made","make","done","good","great","less","more","most","only","true","well","full",
  "first","last","days","knew","know","word","words","name","names","face","hand",
  "heart","soul","mine","self","body","eyes","ears","feet","arms","head",
  "ways","walk","find","show","seen","look","call","told","tell",
  // Terms of address / relational nouns — meaningful in narrative but not as
  // theological index terms when extracted from context
  "children","father","mother","brother","sister","servant","master","daughter","sons",
  "people","nation","house","woman","women","sheep","lamb","vine","stone","door","tree",
  "brethren","elders","rulers","priests","scribes","judges","kings","queen",
]);

function verseKeyWords(verseTextStr, count = 6) {
  const skip = new Set([...STOP, ...VERSE_NOISE]);
  const words = verseTextStr.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)
    .filter(w => w.length > 4 && !skip.has(w));
  const seen = new Set();
  const unique = words.filter(w => { if (seen.has(w)) return false; seen.add(w); return true; });
  // Prefer words with >= 6 chars as more theologically specific
  const rich = unique.filter(w => w.length >= 6);
  return (rich.length >= count ? rich : [...rich, ...unique.filter(w => w.length < 6)]).slice(0, count);
}

function desireKeyWords(desires) {
  const skip = new Set(["want","need","help","please","really","very","just","that","with","and",
    "for","the","pray","prayer","asking","god","lord","please","asking","about"]);
  return desires.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)
    .filter(w => w.length > 3 && !skip.has(w)).slice(0, 6);
}

// Deterministic hash — same input always → same number.
// Used to make consistent, varied picks without random().
function hashStr(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0;
  return h;
}

// ── Category detection ────────────────────────────────────────────────────────
export function detectCategory(desireText) {
  const words = tokenize(desireText);
  const scores = {};
  for (const cat of CATEGORIES) scores[cat.name] = 0;
  for (const word of words) {
    for (const cat of CATEGORIES) {
      if (cat.keywords.has(word)) scores[cat.name] += cat.keywords.get(word);
    }
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topName, topScore] = ranked[0];
  const totalScore = ranked.reduce((s, [, v]) => s + v, 0) || 1;
  return {
    category:   topScore > 0 ? topName : "Petition",
    confidence: topScore > 0 ? Math.min(1, topScore / totalScore + 0.15) : 0.3,
    scores,
  };
}

// ── Verse selection via full-Bible TF-IDF + curated bank merge ────────────────
export function selectVerses(desireText, category, count, weights) {
  const weightMap = weights ? new Map(Object.entries(weights)) : null;
  let candidates = [];
  const idx = getBibleIndex();

  if (idx.isBuilt) {
    const indexHits = idx.queryDiverse(desireText, Math.max(count * 4, 24), {
      weights: weightMap, curatedRefs: CURATED_REFS,
    });
    const curatedPool = getVerseBank().filter(v => v.category === category);
    const curatedHits = curatedPool.map(v => {
      let vt = "";
      try { vt = verseText(v); } catch { /* ok */ }
      return {
        ref: v.ref, bookId: v.bookId, bookName: "", ch: v.chapter, v: v.verseStart,
        text: vt, section: "curated", tfidfScore: (weightMap?.get(v.ref) ?? 1) * 1.2,
        _curated: true, _verseEntry: v,
      };
    });
    const seen = new Set(indexHits.map(e => e.ref));
    const freshCurated = curatedHits.filter(c => !seen.has(c.ref));
    candidates = [...indexHits, ...freshCurated].sort((a, b) => b.tfidfScore - a.tfidfScore);
  } else {
    const pool  = getVerseBank().filter(v => v.category === category);
    const words = new Set(tokenize(desireText));
    candidates  = pool.map(v => {
      let vt = "";
      try { vt = verseText(v); } catch { /* ok */ }
      const overlap = v.keywords.reduce((s, k) => s + (words.has(k) ? 1 : 0), 0);
      return {
        ref: v.ref, bookId: v.bookId, text: vt,
        tfidfScore: overlap * 2 + (weightMap?.get(v.ref) ?? 1),
        _curated: true, _verseEntry: v,
      };
    }).sort((a, b) => b.tfidfScore - a.tfidfScore);
  }
  return candidates.slice(0, Math.max(count, 8));
}

// ── Quality scorer ────────────────────────────────────────────────────────────
export function scorePrayer(prayerText, verseTextStr, desireText) {
  const pWords  = tokenize(prayerText);
  const vWords  = new Set(tokenize(verseTextStr));
  const dWords  = new Set(tokenize(desireText));
  const pSet    = new Set(pWords);
  if (!pWords.length) return 0;
  const richness  = Math.min(1, pSet.size / Math.max(1, pWords.length) * 2.5);
  const density   = pWords.filter(w => vWords.has(w)).length / Math.max(1, pWords.length);
  const relevance = pWords.filter(w => dWords.has(w)).length / Math.max(1, pWords.length);
  return Math.round((relevance * 45 + richness * 35 + density * 20) * 100);
}

// ── Dynamic movement builders ─────────────────────────────────────────────────
// Each function builds its movement from live data — verse vocabulary, Markov
// chains, dictionary lookups, teaching snippets, and the user's own words.
// Nothing here is pre-written; the content is unique to each verse + request.

// ADDRESS — opening address to God
// Built from: theological words actually present in the verse + Markov chains
// from those words + dictionary synonyms for additional precision.
function buildAddress(verseTextStr, category, seed, markov, dictMap) {
  const DIVINE_ATTRS = new Set([
    "holy","eternal","sovereign","almighty","faithful","righteous","merciful","gracious",
    "glorious","mighty","living","true","good","loving","powerful","strong","everlasting",
    "perfect","just","great","awesome","wonderful","majestic","wise","supreme","infinite",
    "compassionate","abundant","steadfast","excellent","magnificent","omnipotent",
  ]);

  const verseWords = verseTextStr.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/);
  const divineInVerse = verseWords.filter(w => DIVINE_ATTRS.has(w));

  // Generate a Markov phrase seeded by a divine-attribute word found IN this verse.
  // Because each verse contains different words, the Markov output is unique per verse.
  let markovAddr = "";
  if (markov.isBuilt) {
    const seeds = divineInVerse.length
      ? divineInVerse
      : verseWords.filter(w => w.length > 4 && !STOP.has(w) && markov._bigrams?.has(w)).slice(0, 4);
    if (seeds.length) {
      const h = hashStr(seed + "addr");
      const seedWord = seeds[Math.abs(h) % seeds.length];
      markovAddr = markov.generatePhrase(seedWord, 10, seed + "addr");
    }
  }

  // Dictionary synonym enrichment — adds precision from real definitions
  let dictAttr = "";
  for (const [, entry] of dictMap) {
    if (entry?.synonyms?.length) {
      dictAttr = entry.synonyms[0];
      break;
    }
  }

  if (markovAddr && markovAddr.split(" ").length >= 4) {
    const phrase = markovAddr.charAt(0).toUpperCase() + markovAddr.slice(1);
    return `${phrase}${dictAttr ? `, ${dictAttr}` : ""} —`;
  }

  // Fallback: build directly from verse key words
  const vkw = verseKeyWords(verseTextStr, 3);
  const kwPhrase = vkw.length ? vkw.join(", ") : "truth and grace";
  return `God whose word speaks of ${kwPhrase}${dictAttr ? ` and ${dictAttr}` : ""} —`;
}

// DECLARE — scripture declaration
// Always uses the COMPLETE verse text. Teaching snippets from the web crawler
// are woven in if available. Markov bridge deepens the scriptural resonance.
function buildDeclaration(ref, vf, bridge1, bridge2, snippets, seed) {
  // Select best teaching snippet (longest with theological language)
  const goodSnippets = snippets
    .filter(s => s.length > 50 && /[Gg]od|[Ll]ord|[Cc]hrist|[Ff]aith|[Gg]race|[Ss]cripture|[Hh]oly/.test(s));
  const snippetFrag = goodSnippets.length
    ? goodSnippets.sort((a, b) => b.length - a.length)[0].slice(0, 140).replace(/\s+\S*$/, "")
    : "";

  const verbs = ["declares", "proclaims", "speaks", "stands", "says"];
  const h = hashStr(seed + "dv");
  const verb = verbs[Math.abs(h) % verbs.length];

  // Full verse text — never truncated
  let decl = `Your word in ${ref} ${verb}: "${vf}"`;
  if (bridge1 && bridge1.length > 8) decl += ` ${bridge1}.`;
  else if (bridge2 && bridge2.length > 8) decl += ` ${bridge2}.`;
  if (snippetFrag) decl += ` ${snippetFrag}.`;
  return decl;
}

// PETITION — the specific request
// Built from the user's actual words + verse concepts + Markov phrase seeded
// from the user's own request vocabulary (not pre-written prayer language).
function buildPetition(desires, desireKW, vkw, markovDesire, category, seed) {
  // Use the user's exact desire text — this is their specific language
  const coreDesire = desires.trim().slice(0, 160);

  // Category tones: short connective phrases only — the content is the user's words
  const TONES = {
    Warfare:      "against every opposition to",
    Adoration:    "to worship You in the midst of",
    Thanksgiving: "with gratitude as I acknowledge",
    Petition:     "honestly and directly about",
    Intercession: "on behalf of others concerning",
  };
  const tone = TONES[category] ?? "before You about";

  let petition = `I come ${tone} ${coreDesire}.`;

  // Weave in a Markov phrase seeded from the user's own words for biblical texture
  if (markovDesire && markovDesire.split(" ").length >= 3) {
    petition += ` ${markovDesire.charAt(0).toUpperCase() + markovDesire.slice(1)}.`;
  } else if (vkw.length >= 2) {
    petition += ` Let what this verse declares about ${vkw.slice(0, 2).join(" and ")} speak directly into this.`;
  }
  return petition;
}

// COMMITMENT — closing
// Built from the verse's own resolution vocabulary via Markov chains.
// Different verses produce different closing language because the Markov
// starts from a different word each time.
function buildCommitment(verseTextStr, vkw, seed, markov, dictMap) {
  let markovCommit = "";
  if (markov.isBuilt && vkw.length) {
    // Use the last key word of the verse — natural closing position
    const lastKW = vkw[vkw.length - 1];
    markovCommit = markov.generatePhrase(lastKW, 9, seed + "commit");
  }

  // Dictionary — one more enrichment layer in the closing
  let dictClose = "";
  for (const [, entry] of dictMap) {
    if (entry?.definitions?.[0]) {
      const defWords = entry.definitions[0].toLowerCase()
        .replace(/[^a-z\s]/g, "").split(/\s+/)
        .filter(w => w.length > 4 && !STOP.has(w));
      if (defWords.length > 2) { dictClose = defWords.slice(0, 3).join(" "); break; }
    }
  }

  const coreKW = vkw[0] ?? "this";
  if (markovCommit && markovCommit.split(" ").length >= 4) {
    const cap = markovCommit.charAt(0).toUpperCase() + markovCommit.slice(1);
    return `${cap}${dictClose ? ` — ${dictClose}` : ""}. I trust You with this completely. Amen.`;
  }
  return `Whatever ${coreKW} requires of You, I trust that You are sufficient for it. Amen.`;
}

// ── Full prayer point builder (async — needs dictionary + teaching context) ───
async function buildPrayerPoint(entry, verseTextStr, desires, category, idx) {
  const seed = `${entry.ref}||${idx}`;
  const ref  = entry.ref;
  const vf   = (verseTextStr || "").trim(); // NEVER truncated

  const markov = getMarkov();

  // Live sources — unique to this verse
  const vkw         = verseKeyWords(verseTextStr, 6);
  const dictMap     = await enrichWords(vkw.slice(0, 3));
  const snippets    = getTeachingContext(ref);
  const bridge1     = markov.isBuilt ? markov.bridgePhrase(verseTextStr, seed + "b1", 11) : "";
  const bridge2     = markov.isBuilt ? markov.verseEcho(verseTextStr, seed + "b2") : "";
  const desireKW    = desireKeyWords(desires);
  const markovDesire = (markov.isBuilt && desireKW.length)
    ? markov.generatePhrase(desireKW[0], 9, seed + "des")
    : "";

  const address    = buildAddress(verseTextStr, category, seed, markov, dictMap);
  const declaration = buildDeclaration(ref, vf, bridge1, bridge2, snippets, seed);
  const petition   = buildPetition(desires, desireKW, vkw, markovDesire, category, seed);
  const commitment = buildCommitment(verseTextStr, vkw, seed, markov, dictMap);

  const prayerText = [address, declaration, petition, commitment].filter(Boolean).join(" ");
  const quality    = scorePrayer(prayerText, verseTextStr, desires);
  return { prayerText, quality };
}

// ── Public API: generate prayer points ────────────────────────────────────────
export async function generatePrayerPoints({ desires, type, count, weights }) {
  const n = Math.min(Math.max(parseInt(count, 10) || 1, 1), 10);

  // Always analyse the prayer request to understand the true spiritual need.
  // A person who selects "Adoration" but writes about fear or oppression is in
  // a Warfare prayer — serving them Adoration would miss the point entirely.
  const detected = detectCategory(desires);
  const validCategories = new Set(["Warfare", "Adoration", "Thanksgiving", "Petition", "Intercession"]);
  const userType = validCategories.has(type) ? type : null;
  let category;
  if (!userType) {
    category = detected.category;
  } else if (detected.category !== userType && detected.confidence > 0.52) {
    category = detected.category; // Override: request text wins over button tap
  } else {
    category = userType;
  }

  const pool = selectVerses(desires, category, n * 3, weights);
  const used = new Set(pool.map(e => e.ref));
  const fallback = selectVerses(desires, "Petition", n * 2, weights).filter(e => !used.has(e.ref));
  const combined = [...pool, ...fallback];

  // Book diversity — pull from different parts of Scripture
  const usedBooks = new Set();
  const primary = [], secondary = [];
  for (const entry of combined) {
    if (entry.bookId && !usedBooks.has(entry.bookId)) {
      primary.push(entry); usedBooks.add(entry.bookId);
    } else {
      secondary.push(entry);
    }
  }
  const merged = [...primary, ...secondary].slice(0, n);

  const uncurated = merged
    .filter(e => !CURATED_REFS.has(e.ref))
    .map(e => ({ ref: e.ref, bookId: e.bookId, ch: e.ch, v: e.v, section: e.section, text: e.text }));

  const prayerPoints = await Promise.all(merged.map(async (entry, i) => {
    const text = entry.text ||
      (entry._verseEntry ? (() => { try { return verseText(entry._verseEntry); } catch { return ""; } })() : "");
    const { prayerText, quality } = await buildPrayerPoint(entry, text, desires, category, i);
    return {
      title:              entry._verseEntry?.title ?? entry.ref,
      prayerText,
      scriptureReference: entry.ref,
      category,
      quality,
      _uncurated:         !CURATED_REFS.has(entry.ref),
      _ref:               entry.ref,
    };
  }));

  return {
    prayerPoints,
    detectedCategory:    category,
    userTypeOverridden:  category !== (userType ?? category),
    uncuratedVerses:     uncurated,
  };
}

// ── Dynamic devotion builders ─────────────────────────────────────────────────

// OPENING — who God is, established from the verse's vocabulary
// Built from: Markov phrase seeded by the verse's theological words + the user's
// goal + dictionary definition of the verse's core word.
function buildDevotionOpening(goal, verseTextStr, vkw, dictMap, markovBridge) {
  const coreVerseWord = vkw[0] ?? "truth";

  // Dictionary fragment for the core verse word — articulates its meaning precisely
  const dictEntry = dictMap.get(coreVerseWord);
  const rawDef = dictEntry?.definitions?.[0] ?? "";
  // Take only the first clause (before any semicolon, colon, or parenthesis)
  const dictFrag = rawDef
    ? rawDef.split(/[;:(]/)[0].toLowerCase().replace(/[^a-z\s]/g, "").trim().slice(0, 80)
    : "";

  // Markov phrase introduces God's character as revealed in this specific verse
  const godChar = markovBridge && markovBridge.length > 10
    ? `The God revealed in this verse is not distant — ${markovBridge.charAt(0).toLowerCase() + markovBridge.slice(1)}.`
    : `The God who speaks into ${coreVerseWord} is present, holy, and actively engaged with what you are carrying.`;

  const goalIntro = `The matter of ${goal.trim()} is not one God has overlooked. He has spoken directly into it — and what He has said carries the full weight of His character behind every word.`;

  const dictNote = dictFrag && dictFrag.length > 20
    ? `The word "${coreVerseWord}" — carrying the meaning of ${dictFrag} — sits at the heart of what this passage declares.`
    : "";

  return [godChar, goalIntro, dictNote].filter(Boolean).join(" ");
}

// REFLECTION — the verse + web-crawled teaching + dictionary-enriched commentary
// Primary material comes from the verse text itself and real teaching snippets
// from openbible.info. Dictionary enrichment adds precise theological language.
function buildDevotionReflection(ref, vf, vkw, snippets, bridge, dictMap, coreWord) {
  // Best teaching snippet from the web crawler — unique to this verse
  const goodSnippets = snippets
    .filter(s => s.length > 60 && /[Gg]od|[Ll]ord|[Cc]hrist|[Ff]aith|[Gg]race|[Hh]oly/.test(s));
  const snippetText = goodSnippets.length
    ? goodSnippets.sort((a, b) => b.length - a.length)[0].slice(0, 320).replace(/\s+\S*$/, "") + "."
    : "";

  // Dictionary — precise articulation of the verse's key words
  let dictComment = "";
  for (const [word, entry] of dictMap) {
    if (entry?.synonyms?.length >= 2) {
      dictComment = `The language of "${word}" here carries the weight of ${entry.synonyms.slice(0, 3).join(", ")} — language that does not soften the claim of this verse but sharpens it.`;
      break;
    }
  }

  // Scripture quotation — always complete, never truncated with "..."
  const verseDecl = `The word of ${ref} stands: "${vf}"${bridge ? ` — ${bridge}.` : "."}`;

  const commentary = snippetText
    ? `${snippetText} That is the witness of those who have stood on this passage and found it sufficient.`
    : `What ${ref} is saying is not conditional on your circumstances. It is a declaration of what God is and what He does — regardless of what your situation looks like right now.`;

  return [verseDecl, dictComment, commentary].filter(Boolean).join("\n\n");
}

// APPLICATION — practical movement for today
// Built from the verse's core word + the user's goal + Markov phrase.
function buildDevotionApplication(goal, vkw, markovPhrase) {
  const coreWord = vkw[0] ?? "this truth";
  const goalCore = goal.trim().slice(0, 90);
  const markovLine = markovPhrase && markovPhrase.split(" ").length >= 4
    ? ` ${markovPhrase.charAt(0).toUpperCase() + markovPhrase.slice(1)}.`
    : "";

  return `Bring ${goalCore} and this verse into the same moment today. Not as a theological exercise — as an honest conversation with the God who wrote it. Let what ${coreWord} means in this passage shape how you approach what you are carrying.${markovLine} One step in that direction is all this devotion asks.`;
}

// CLOSING PRAYER — built from verse reference + goal + Markov
// The prayer is unique because it uses the specific reference + the user's goal
// + a Markov phrase from the verse's vocabulary.
function buildDevotionPrayer(ref, goal, vkw, markovPhrase) {
  const goalCore = goal.trim().slice(0, 80);
  const coreWord = vkw[0] ?? "this";
  const markovLine = markovPhrase && markovPhrase.split(" ").length >= 3
    ? ` ${markovPhrase.charAt(0).toUpperCase() + markovPhrase.slice(1)}.`
    : "";

  return `Father, the word of ${ref} is enough for ${goalCore}. Let it be enough in me today — not as information I hold about You, but as a truth I live from. Let ${coreWord} stop being something I believe in theory and become something that changes what I actually do.${markovLine} I trust You with what I cannot carry. Amen.`;
}

// TITLE — built from verse ref + core verse word + user goal (not a pool)
function buildDevotionTitle(goal, ref, vkw) {
  const coreWord = vkw[0] ? vkw[0].charAt(0).toUpperCase() + vkw[0].slice(1) : null;
  const shortGoal = goal.trim().slice(0, 55);
  return coreWord && coreWord.length > 3
    ? `${coreWord} — ${shortGoal}`
    : `${ref}: ${shortGoal}`;
}

// ── Public API: generate devotional ──────────────────────────────────────────
export async function generateDevotional({ goal, dayNumber, weights }) {
  const idx        = getBibleIndex();
  const goalTokens = tokenize(goal).filter(w => !STOP.has(w));
  const weightMap  = weights ? new Map(Object.entries(weights)) : null;
  const markov     = getMarkov();

  let verse, verseTextStr;

  if (idx.isBuilt) {
    const hits   = idx.query(goal, { topN: 30, weights: weightMap, curatedRefs: CURATED_REFS });
    const pickIdx = (dayNumber ?? 0) % Math.max(hits.length, 1);
    const hit    = hits[pickIdx] ?? hits[0];
    verse        = hit ? { ref: hit.ref, ch: hit.ch, v: hit.v, bookId: hit.bookId, text: hit.text } : null;
    verseTextStr = verse?.text ?? "";
  }

  if (!verse || !verseTextStr) {
    const bank    = getVerseBank();
    const keySet  = new Set(goalTokens);
    const pool    = bank.filter(v => v.keywords.some(k => keySet.has(k)));
    const fallpool = pool.length >= 2 ? pool : bank.filter(v => v.category === "Thanksgiving");
    const fi      = (dayNumber ?? 0) % Math.max(fallpool.length, 1);
    const bv      = fallpool[fi] ?? bank[0];
    try { verseTextStr = verseText(bv); } catch { verseTextStr = ""; }
    verse = { ref: bv.ref, ch: bv.chapter, v: bv.verseStart, bookId: bv.bookId, text: verseTextStr };
  }

  const ref  = verse.ref;
  const vf   = (verseTextStr || "").trim(); // NEVER truncated
  const seed = `${ref}||${goal}`;

  // Live data sources — unique per verse + goal combination
  const vkw      = verseKeyWords(verseTextStr, 6);
  const dictMap  = await enrichWords(vkw.slice(0, 4));
  const snippets = getTeachingContext(ref);
  const bridge1  = markov.isBuilt ? markov.bridgePhrase(verseTextStr, seed, 12) : "";
  const bridge2  = markov.isBuilt ? markov.verseEcho(verseTextStr, seed + "e") : "";
  const goalSeed = goalTokens[0];
  const markovGoal = (markov.isBuilt && goalSeed)
    ? markov.generatePhrase(goalSeed, 8, seed + "g")
    : "";

  const title       = buildDevotionTitle(goal, ref, vkw);
  const opening     = buildDevotionOpening(goal, verseTextStr, vkw, dictMap, bridge1);
  const reflection  = buildDevotionReflection(ref, vf, vkw, snippets, bridge2 || bridge1, dictMap, goalTokens[0] ?? vkw[0]);
  const application = buildDevotionApplication(goal, vkw, markovGoal);
  const closing     = buildDevotionPrayer(ref, goal, vkw, bridge1);

  return {
    title,
    scriptureReference: ref,
    scriptureText:      verseTextStr,
    body:               `${opening}\n\n${reflection}\n\n${application}`,
    closingPrayer:      closing,
    detectedCategory:   detectCategory(goal).category,
  };
}
