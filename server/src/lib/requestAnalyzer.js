// ─── Deep Prayer Request Analyzer ────────────────────────────────────────────
// Goes far beyond keyword→category classification.
// Understands: emotional tone, urgency, situation domains, spiritual needs,
// and which aspects of God's character are most relevant to THIS specific request.
//
// Returns a rich semantic profile used by prayerComposer to build
// language that speaks DIRECTLY to the person's actual situation —
// not to a generic "prayer category."

import { ATTRIBUTES, COVENANT_NAMES, getRelevantAttributes, getBestCovenantName } from "./godPersona.js";
import { CATEGORIES } from "../data/prayerVerses.js";

// ── Stop words ────────────────────────────────────────────────────────────────
const STOP = new Set([
  "the","and","for","that","with","this","have","from","your","you","are","was","will",
  "his","her","them","they","been","who","what","when","about","just","like","can",
  "not","but","all","one","him","she","its","also","than","then","into","more","which",
  "their","there","out","has","had","would","could","should","said","shall","upon",
  "unto","thee","thou","thy","hath","doth","saith","mine","thine","yea","yet","nor",
  "now","thus","even","both","very","such","where","here","our","let","did",
  "come","came","went","may","might","say","see","god","lord","jesus","christ","prayer",
  "pray","please","help","need","want","really","make","know","feel","think",
]);

function tokenize(text) {
  return (text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w));
}

// ── Urgency signals ───────────────────────────────────────────────────────────
// Words that indicate high emotional urgency — desperation, crisis, acute need
const URGENCY_HIGH = new Set([
  "desperate", "desperately", "urgent", "urgently", "crisis", "breaking", "broken",
  "dying", "hopeless", "failing", "destroyed", "devastated", "collapsed", "critical",
  "emergency", "immediately", "tonight", "today", "now", "right now", "falling apart",
  "overwhelmed", "drowning", "sinking", "losing", "lost everything", "cannot",
]);
const URGENCY_MED = new Set([
  "struggling", "difficult", "hard", "challenging", "worried", "concern", "scared",
  "confused", "uncertain", "unsure", "stuck", "trying", "fighting", "battle",
]);

// ── Emotional tone signals ────────────────────────────────────────────────────
const TONE_GRATITUDE = new Set([
  "thank", "grateful", "thankful", "blessed", "bless", "appreciate", "gratitude",
  "praise", "goodness", "faithful", "faithfulness", "testimony",
]);
const TONE_GRIEF = new Set([
  "grief", "grieve", "mourning", "loss", "died", "death", "passed away", "gone",
  "miss", "missing", "heartbreak", "heartbroken", "sorrow", "sad", "pain",
]);
const TONE_FEAR = new Set([
  "fear", "afraid", "terrified", "scared", "anxious", "anxiety", "worry", "panic",
  "dread", "trembling", "nervous", "phobia",
]);
const TONE_PRAISE = new Set([
  "worship", "adore", "magnify", "exalt", "honor", "glorify", "awesome", "great",
  "wonderful", "mighty", "majestic", "holy",
]);
const TONE_WARFARE = new Set([
  "warfare", "spiritual battle", "attack", "attacked", "enemy", "demon", "devil",
  "satan", "principality", "oppression", "oppressed", "darkness", "stronghold",
  "witchcraft", "curse", "cursed", "hex", "binding", "loose", "rebuke", "resist",
  "armor", "shield", "sword", "fight", "overcome",
]);
const TONE_CONFESSION = new Set([
  "confess", "forgive", "sorry", "repent", "sinned", "sin", "mistake", "guilt",
  "guilty", "shame", "ashamed", "failed", "wrong", "transgression", "iniquity",
]);

// ── Situation domain signals ──────────────────────────────────────────────────
const SITUATIONS = {
  health:        ["sick", "heal", "health", "disease", "body", "pain", "doctor", "cancer", "diagnosis", "recovery", "chronic", "medicine", "hospital", "surgery", "ill", "illness"],
  family:        ["family", "marriage", "husband", "wife", "child", "children", "parent", "father", "mother", "brother", "sister", "divorce", "relationship", "home", "son", "daughter"],
  finances:      ["money", "bills", "job", "work", "financial", "debt", "poverty", "provision", "afford", "supply", "income", "unemployed", "business", "salary", "rent", "mortgage"],
  work:          ["work", "job", "career", "business", "boss", "colleague", "workplace", "employment", "project", "purpose", "calling", "ministry"],
  spiritual:     ["faith", "believe", "doubt", "backsliding", "spiritual", "church", "bible", "word", "anointing", "calling", "ministry", "prayer life"],
  guidance:      ["direction", "decision", "choice", "path", "where", "guidance", "wisdom", "discernment", "clarity", "confused", "lost", "signs"],
  grief:         ["died", "death", "loss", "mourning", "grief", "passed", "gone", "funeral", "bereavement", "missing"],
  protection:    ["protection", "safe", "safety", "danger", "threat", "harm", "accident", "violence", "security", "guard", "watch over"],
  warfare:       ["warfare", "spiritual battle", "attack", "enemy", "demon", "devil", "stronghold", "darkness", "oppression", "principality", "witchcraft"],
  identity:      ["identity", "purpose", "worth", "value", "self", "who am i", "belonging", "accepted", "rejected", "lonely", "alone", "forgotten"],
};

// ── Category keywords (extended from CATEGORIES) ──────────────────────────────
// We supplement the existing keyword maps with strong signals per category.
const CATEGORY_STRONG_SIGNALS = {
  Warfare:      ["warfare", "spiritual battle", "attack", "demon", "devil", "principality", "darkness", "rebuke", "binding", "witchcraft", "oppression", "stronghold", "enemy"],
  Intercession: ["them", "they", "their", "someone", "others", "everyone", "people", "friend", "loved one", "nation", "family member", "pray for", "standing for"],
  Thanksgiving: ["thank", "grateful", "thankful", "praise", "bless", "blessed", "testimony", "goodness"],
  Adoration:    ["worship", "adore", "magnify", "exalt", "honor", "glorify", "awesome", "majestic", "holy"],
  Petition:     ["ask", "need", "request", "please", "grant", "give", "provide", "help me", "i need"],
};

// ── Main analysis function ────────────────────────────────────────────────────
export function analyzeRequest(desireText) {
  const raw = (desireText || "").trim();
  const lower = raw.toLowerCase();
  const tokens = tokenize(raw);
  const tokenSet = new Set(tokens);

  // ── 1. Urgency score (0-1) ──
  let urgencyScore = 0;
  for (const t of tokens) {
    if (URGENCY_HIGH.has(t)) urgencyScore = Math.max(urgencyScore, 0.85);
    else if (URGENCY_MED.has(t)) urgencyScore = Math.max(urgencyScore, 0.5);
  }
  // Sentence-level signals (multi-word patterns)
  if (/i (cannot|can't|don't know how)/.test(lower)) urgencyScore = Math.max(urgencyScore, 0.65);
  if (/right now|this very|this moment|today/.test(lower)) urgencyScore = Math.max(urgencyScore, 0.55);

  // ── 2. Emotional tone ──
  const tone = {
    gratitude:  scoreSet(tokens, TONE_GRATITUDE),
    grief:      scoreSet(tokens, TONE_GRIEF),
    fear:       scoreSet(tokens, TONE_FEAR),
    praise:     scoreSet(tokens, TONE_PRAISE),
    warfare:    scoreSet(tokens, TONE_WARFARE),
    confession: scoreSet(tokens, TONE_CONFESSION),
  };
  const dominantTone = Object.entries(tone).sort((a, b) => b[1] - a[1])[0][0];

  // ── 3. Situation domains ──
  const detectedSituations = [];
  for (const [sit, signals] of Object.entries(SITUATIONS)) {
    if (signals.some(s => tokenSet.has(s) || lower.includes(s))) {
      detectedSituations.push(sit);
    }
  }

  // ── 4. Category detection (enhanced) ──
  // Use both CATEGORIES keyword maps AND strong-signal overrides
  const catScores = {};
  for (const cat of CATEGORIES) catScores[cat.name] = 0;
  for (const t of tokens) {
    for (const cat of CATEGORIES) {
      if (cat.keywords.has(t)) catScores[cat.name] += cat.keywords.get(t);
    }
  }
  // Apply strong signals — these can dominate when present
  for (const [catName, signals] of Object.entries(CATEGORY_STRONG_SIGNALS)) {
    const hits = signals.filter(s => lower.includes(s));
    if (hits.length >= 2) catScores[catName] = (catScores[catName] ?? 0) + hits.length * 3;
  }

  const ranked = Object.entries(catScores).sort((a, b) => b[1] - a[1]);
  const [topName, topScore] = ranked[0];
  const totalScore = ranked.reduce((s, [, v]) => s + v, 0) || 1;
  const confidence = topScore > 0 ? Math.min(1, topScore / totalScore + 0.15) : 0.3;
  const category = topScore > 0 ? topName : "Petition";

  // ── 5. Key phrases — 2-3 meaningful phrases from the request to reflect back ──
  // Extract meaningful multi-word fragments (3-5 word windows)
  const rawWords = raw.replace(/[^a-zA-Z\s']/g, " ").split(/\s+/).filter(w => w.length > 1);
  const keyPhrases = [];
  for (let i = 0; i < rawWords.length - 2; i++) {
    const phrase = rawWords.slice(i, i + 3).join(" ").toLowerCase();
    const phraseWords = phrase.split(/\s+/).filter(w => !STOP.has(w) && w.length > 3);
    if (phraseWords.length >= 2 && !keyPhrases.some(p => p.includes(phrase) || phrase.includes(p))) {
      keyPhrases.push(phrase);
      if (keyPhrases.length >= 3) break;
    }
  }

  // ── 6. Spiritual needs — what does this person actually need from God ──
  const spiritualNeeds = [];
  if (detectedSituations.includes("health")) spiritualNeeds.push("healing");
  if (detectedSituations.includes("finances") || detectedSituations.includes("work")) spiritualNeeds.push("provision");
  if (detectedSituations.includes("warfare")) spiritualNeeds.push("deliverance");
  if (detectedSituations.includes("guidance")) spiritualNeeds.push("wisdom");
  if (detectedSituations.includes("grief")) spiritualNeeds.push("comfort");
  if (detectedSituations.includes("family")) spiritualNeeds.push("restoration");
  if (detectedSituations.includes("protection")) spiritualNeeds.push("protection");
  if (detectedSituations.includes("identity")) spiritualNeeds.push("affirmation");
  if (tone.confession > 0.3) spiritualNeeds.push("forgiveness");
  if (urgencyScore > 0.6) spiritualNeeds.push("breakthrough");
  if (spiritualNeeds.length === 0) spiritualNeeds.push("strength");

  // ── 7. Best covenant name match ──
  const covenantName = getBestCovenantName(detectedSituations, tokens);

  // ── 8. Ranked God attributes ──
  const rankedAttributes = getRelevantAttributes(category, detectedSituations);

  // ── 9. Seed string for deterministic composition ──
  // Based on request content — same request always produces same composition
  let seedHash = 5381;
  for (const c of raw) seedHash = (Math.imul(seedHash, 33) ^ c.charCodeAt(0)) >>> 0;
  const seed = seedHash.toString(36);

  return {
    category,
    confidence,
    urgency: urgencyScore,
    tone,
    dominantTone,
    situations: detectedSituations,
    spiritualNeeds,
    keyPhrases,
    tokens,
    covenantName,
    rankedAttributes,
    seed,
    raw,
  };
}

function scoreSet(tokens, signalSet) {
  let score = 0;
  for (const t of tokens) if (signalSet.has(t)) score += 1;
  return Math.min(1, score / 3);
}
