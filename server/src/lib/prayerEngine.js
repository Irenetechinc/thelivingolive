// ─── Rule-based prayer/devotion engine ──────────────────────────────────────
// No LLM calls. Every output is assembled from:
//   1. Real KJV scripture, selected by TF-IDF relevance over all 31,102 verses
//      (via bibleIndex.js) — not just the 40-verse curated bank.
//   2. Dynamically generated language from a KJV bigram model (markovBible.js)
//      so each prayer contains unique, biblically-rooted phrases rather than
//      pre-written strings.
//   3. Section-diverse verse selection (OT + NT breadth, not five Psalms in a row).
//   4. Per-verse learned weights from the genetic algorithm feedback loop.
//   5. Auto-discovery: uncurated verses from the index that appear in
//      highly-rated prayers get promoted to discovered_verses by the scheduler.
//   6. Built-in quality scoring per generated prayer — returned alongside the
//      prayer text so the scheduler can correlate quality with verse/pool choices.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { CATEGORIES, getVerseBank, VERSE_BANK } from "../data/prayerVerses.js";
import { getBibleIndex } from "./bibleIndex.js";
import { getMarkov } from "./markovBible.js";

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

// Reference set of curated verses — used to give them a relevance boost and
// to identify when the index surfaces new uncurated verses for auto-discovery.
const CURATED_REFS = new Set(VERSE_BANK.map(v => v.ref));

const STOP = new Set([
  "the","and","for","that","with","this","have","from","your","you","are","was","will",
  "his","her","them","they","been","who","what","when","about","just","like","can",
  "not","but","all","one","him","she","its","also","than","then","into","more","which",
  "their","there","out","has","had","would","could","should","said","shall","upon",
  "unto","thee","thou","thy","hath","doth","saith","mine","thine","yea","yet","nor",
  "now","thus","even","both","very","such","where","here","our","let","did",
  "come","came","went","may","might","say","see",
]);

function tokenize(text) {
  return (text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w));
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
// Queries the 31,102-verse index + boosts curated bank entries + applies
// per-verse learned weights. Falls back to curated bank if index not ready.
export function selectVerses(desireText, category, count, weights) {
  const weightMap = weights
    ? new Map(Object.entries(weights))
    : null;

  let candidates = [];
  const idx = getBibleIndex();

  if (idx.isBuilt) {
    // Pull from full Bible — diverse across theological sections
    const indexHits = idx.queryDiverse(desireText, Math.max(count * 4, 24), {
      weights:    weightMap,
      curatedRefs: CURATED_REFS,
    });
    // Merge with curated bank entries for the detected category
    // (they're already boosted 40% by curatedRefs in queryDiverse)
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
    // De-duplicate: if a curated verse also appears in indexHits, keep the higher score
    const seen = new Set(indexHits.map(e => e.ref));
    const freshCurated = curatedHits.filter(c => !seen.has(c.ref));
    candidates = [...indexHits, ...freshCurated]
      .sort((a, b) => b.tfidfScore - a.tfidfScore);
  } else {
    // Index not ready yet — fall back to curated bank
    const pool  = getVerseBank().filter(v => v.category === category);
    const words = new Set(tokenize(desireText));
    candidates  = pool.map(v => {
      let vt = "";
      try { vt = verseText(v); } catch { /* ok */ }
      const overlap = v.keywords.reduce((s, k) => s + (words.has(k) ? 1 : 0), 0);
      return {
        ref: v.ref, bookId: v.bookId, text: vt, tfidfScore: overlap * 2 + (weightMap?.get(v.ref) ?? 1),
        _curated: true, _verseEntry: v,
      };
    }).sort((a, b) => b.tfidfScore - a.tfidfScore);
  }

  return candidates.slice(0, Math.max(count, 8));
}

// ── Text helpers ──────────────────────────────────────────────────────────────
function seedPick(arr, seedStr, offset = 0) {
  let h = 5381;
  for (let i = 0; i < seedStr.length; i++) h = (Math.imul(h, 33) ^ seedStr.charCodeAt(i)) >>> 0;
  return arr[(h + offset) % arr.length];
}

function shortStr(text, max = 80) {
  const t = (text || "").trim();
  return t.length <= max ? t : t.slice(0, max - 1) + "…";
}

// NOTE: Scripture quotations in prayer points and devotionals must ALWAYS be
// complete. verseFrag is kept only for legacy callers; verse declarations now
// use the full text directly (see buildDynamicPrayer / generateDevotional).
function verseFrag(text, max = 90) {
  if (!text || text.length <= max) return text || "";
  const cut = text.lastIndexOf(" ", max);
  return cut > 40 ? text.slice(0, cut) + "…" : text.slice(0, max) + "…";
}

function desireKeyWords(desires) {
  const skip = new Set(["want","need","help","please","really","very","just","that","with","and",
    "for","the","pray","prayer","asking","god","lord","please","asking","about"]);
  return desires.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)
    .filter(w => w.length > 3 && !skip.has(w)).slice(0, 5);
}

function verseKeyWords(verseTextStr, count = 6) {
  const skip = new Set([...STOP,
    "also","every","thereof","therein","wherein","because","behold","blessed","shall",
  ]);
  const words = verseTextStr.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)
    .filter(w => w.length > 3 && !skip.has(w));
  const seen = new Set();
  return words.filter(w => { if (seen.has(w)) return false; seen.add(w); return true; })
    .slice(0, count);
}

// ── Prayer quality scorer ────────────────────────────────────────────────────
// Scores 0-100 on three axes:
//   Vocabulary richness   – unique meaningful words / total words
//   Scripture density     – how much of the prayer text comes from the verse itself
//   Desire relevance      – keyword overlap between desire and prayer text
export function scorePrayer(prayerText, verseTextStr, desireText) {
  const pWords  = tokenize(prayerText);
  const vWords  = new Set(tokenize(verseTextStr));
  const dWords  = new Set(tokenize(desireText));
  const pSet    = new Set(pWords);

  if (!pWords.length) return 0;

  const richness   = Math.min(1, pSet.size / Math.max(1, pWords.length) * 2.5);
  const density    = pWords.filter(w => vWords.has(w)).length / Math.max(1, pWords.length);
  const relevance  = pWords.filter(w => dWords.has(w)).length / Math.max(1, pWords.length);

  // Weights: relevance matters most, then richness, then scripture density
  return Math.round((relevance * 45 + richness * 35 + density * 20) * 100);
}

// ── Language pools ────────────────────────────────────────────────────────────
// 8–10 entries per category per movement. Selected deterministically by seed
// (verse ref + idx), so the same verse always gets the same language variant
// but different verses get different ones.

const ADDRESS = {
  Adoration: [
    vf => `Magnificent God, whose glory fills every corner of creation —`,
    vf => `Father of all light and every perfect gift —`,
    vf => `Lord Most High, worthy of honour that no words can fully contain —`,
    vf => `Everlasting God, whose greatness has no beginning and no end —`,
    vf => `Holy One, before whom the angels cover their faces and cry holy —`,
    vf => `Creator and Sustainer of all that is and was and ever shall be —`,
    vf => `God who is magnificent beyond all our speaking and all our imagining —`,
    vf => `Sovereign Lord, who reigns over all things seen and unseen —`,
    vf => `Alpha and Omega, who holds the whole of time in a single thought —`,
    vf => `God of every morning, whose mercies are new before the sun rises —`,
  ],
  Thanksgiving: [
    vf => `Faithful God, from whose hand every good thing flows —`,
    vf => `Good Father, whose mercies are new every morning —`,
    vf => `Lord of every gift, known and unknown to us —`,
    vf => `Provider and Sustainer — the one who gives and never runs out —`,
    vf => `God of constant goodness, who blesses beyond what we deserve or understand —`,
    vf => `Lord, whose generosity is written into the very fabric of creation —`,
    vf => `Father, in whom there is no shadow of turning or inconsistency —`,
    vf => `Gracious God, whose faithfulness outlasts every generation —`,
    vf => `Lord of all seasons, who is good in the harvest and in the waiting —`,
    vf => `God who remembers — who has not forgotten a single thing He has promised —`,
  ],
  Petition: [
    vf => `Gracious Father, who has told us to ask and promised to hear —`,
    vf => `Lord who hears, who bends low to attend to our voice —`,
    vf => `Heavenly Father, from whom every answer ultimately comes —`,
    vf => `God of every grace, who is not far from any one of us —`,
    vf => `Lord who sees the need before the words leave our lips —`,
    vf => `Father, in whose presence we can bring the full weight of our need —`,
    vf => `God, who delights in the prayers of the righteous —`,
    vf => `Lord, who calls us to come boldly and turns no honest prayer away —`,
    vf => `Father of lights, in whom every good and perfect gift originates —`,
    vf => `God who is able to do exceedingly abundantly above what we ask or think —`,
  ],
  Intercession: [
    vf => `Merciful Lord, who sees every person we could never fully reach —`,
    vf => `God who sees — who is never ignorant of what others are carrying —`,
    vf => `Father of compassion, whose heart is always turned toward the broken —`,
    vf => `Lord of all comfort, who heals what medicine cannot touch —`,
    vf => `God of every nation and every name —`,
    vf => `Father, whose love for others is greater than our love could ever be —`,
    vf => `Lord who stood in the gap before we knew what the gap was —`,
    vf => `Interceding Christ, ever living to make intercession for the saints —`,
    vf => `God who knows what people need before they ask it —`,
    vf => `Father of all mercy, from whom no wandering soul is too far gone —`,
  ],
  Warfare: [
    vf => `Lord God Almighty, whose authority no principality can withstand —`,
    vf => `Captain of the hosts, whose armies are beyond number —`,
    vf => `God of power and authority, in whom all victory is secured —`,
    vf => `Sovereign Lord, before whom every knee will bow —`,
    vf => `Lord of hosts — the God of armies who has never lost a battle —`,
    vf => `Mighty God, who has not given us a spirit of fear but of power —`,
    vf => `Lord, who has disarmed principalities and powers at the cross —`,
    vf => `God of final victory, whose word has already declared the outcome —`,
    vf => `Greater One, who dwells in us and is greater than he that is in the world —`,
    vf => `Lord who sits above every name that is named, in this age and in the age to come —`,
  ],
};

const DECLARE = {
  Adoration: [
    (vf, ref, echo) => `Your word in ${ref} declares "${vf}${echo ? " — " + echo : ""}" — I receive that not as information but as an encounter with who You actually are.`,
    (vf, ref, echo) => `Scripture speaks in ${ref}: "${vf}" ${echo ? `The whole of Your word echoes it — "${echo}" — ` : ""}and I want to stand in that truth before I do anything else.`,
    (vf, ref, echo) => `"${vf}" — ${ref}. ${echo ? `And Scripture adds its own echo: "${echo}." ` : ""}I come today not to bring a request but to acknowledge what is already true about You.`,
    (vf, ref, echo) => `In ${ref} we read: "${vf}" ${echo ? `— a truth that runs through the whole of Scripture: "${echo}." ` : ""}I receive that as the ground I am standing on as I come to You.`,
    (vf, ref, echo) => `The declaration of ${ref} — "${vf}" — is not a sentiment. ${echo ? `The whole of Scripture agrees: "${echo}." ` : ""}It is a reality I am choosing to encounter right now.`,
    (vf, ref, echo) => `"${vf}" is the word of ${ref}${echo ? `, and it echoes in the whole of Scripture: "${echo}"` : ""}. I choose to begin here — not with my need but with Your nature.`,
    (vf, ref, echo) => `Your word stands in ${ref}: "${vf}"${echo ? ` — Scripture adds its voice: "${echo}"` : ""}. I receive that today as a foundation, not a feeling.`,
    (vf, ref, echo) => `${ref} is where I plant this prayer: "${vf}"${echo ? ` — and the whole of Scripture agrees: "${echo}"` : ""}. You are worthy before a single circumstance changes.`,
  ],
  Thanksgiving: [
    (vf, ref, echo) => `Your word reminds me in ${ref}: "${vf}"${echo ? ` — and throughout Scripture we hear: "${echo}"` : ""}. Looking back, I can see that it is true. You have been faithful.`,
    (vf, ref, echo) => `"${vf}" — ${ref}. ${echo ? `Scripture adds: "${echo}." ` : ""}I want to hold that truth before I move into anything else today.`,
    (vf, ref, echo) => `In ${ref} You speak: "${vf}"${echo ? ` — the whole of Scripture echoes it: "${echo}"` : ""}. I receive that not just as theology but as the lived reality of my story with You.`,
    (vf, ref, echo) => `Your faithfulness is declared in ${ref}: "${vf}"${echo ? `, affirmed throughout Scripture in words like "${echo}"` : ""}. I receive it as a foundation for gratitude.`,
    (vf, ref, echo) => `"${vf}" is what ${ref} declares${echo ? `, and Scripture adds: "${echo}"` : ""}. I choose to let that be true rather than arguing with it.`,
    (vf, ref, echo) => `The truth of ${ref} settles over everything: "${vf}"${echo ? ` — the whole of Scripture says the same: "${echo}"` : ""}. I receive it as the ground of thanksgiving.`,
    (vf, ref, echo) => `${ref} speaks plainly: "${vf}"${echo ? `, and Scripture's voice runs with it: "${echo}"` : ""}. I choose to begin with thanksgiving, not with my need.`,
    (vf, ref, echo) => `I receive the word of ${ref}: "${vf}"${echo ? ` — affirmed across the whole of Scripture: "${echo}"` : ""}. That is where gratitude begins — in what God has already said.`,
  ],
  Petition: [
    (vf, ref, echo) => `Your word promises in ${ref}: "${vf}"${echo ? ` — and throughout Scripture: "${echo}"` : ""}. I hold that against what I am facing and choose to ask on the basis of what You have said.`,
    (vf, ref, echo) => `"${vf}" — ${ref}. ${echo ? `Scripture adds its weight: "${echo}." ` : ""}I am asking not because I deserve an answer but because Your word has opened the door.`,
    (vf, ref, echo) => `Scripture gives me ground in ${ref}: "${vf}"${echo ? ` — and affirms it throughout: "${echo}"` : ""}. I take You at Your word and bring this need directly before You.`,
    (vf, ref, echo) => `In ${ref} You say "${vf}"${echo ? ` — Scripture echoes: "${echo}"` : ""}. That is the promise I am standing on as I make this request.`,
    (vf, ref, echo) => `"${vf}" is what You have declared in ${ref}${echo ? `, and Scripture confirms: "${echo}"` : ""}. It gives me confidence to bring this honestly.`,
    (vf, ref, echo) => `Your promise in ${ref}: "${vf}"${echo ? ` — and Scripture's voice runs alongside: "${echo}"` : ""}. I receive that as permission to bring this need fully before You.`,
    (vf, ref, echo) => `${ref} says "${vf}"${echo ? ` — throughout Scripture: "${echo}"` : ""}. That is the ground of this prayer, not my own righteousness.`,
    (vf, ref, echo) => `I plant this prayer in ${ref}: "${vf}"${echo ? ` — Scripture's own voice agrees: "${echo}"` : ""}. I bring this need in the confidence of what You have said.`,
  ],
  Intercession: [
    (vf, ref, echo) => `Your word in ${ref} says "${vf}"${echo ? ` — and Scripture adds: "${echo}"` : ""}. I claim that promise not just for myself but for those I am lifting before You right now.`,
    (vf, ref, echo) => `"${vf}" — ${ref}. ${echo ? `Scripture confirms: "${echo}." ` : ""}I bring others before You on the strength of this word.`,
    (vf, ref, echo) => `Scripture declares in ${ref}: "${vf}"${echo ? ` — and echoes it: "${echo}"` : ""}. I hold that over the people I am praying for today.`,
    (vf, ref, echo) => `In ${ref} we read: "${vf}"${echo ? ` — and Scripture adds: "${echo}"` : ""}. I receive that as true for those I carry in this prayer.`,
    (vf, ref, echo) => `"${vf}" is Your word in ${ref}${echo ? `, confirmed in Scripture: "${echo}"` : ""}. I stand on it on behalf of others who may not be standing on anything right now.`,
    (vf, ref, echo) => `The promise of ${ref} — "${vf}"${echo ? ` — and Scripture's: "${echo}"` : ""} — is big enough to cover what I am about to bring to You.`,
    (vf, ref, echo) => `${ref} declares "${vf}"${echo ? ` — Scripture agrees: "${echo}"` : ""}. I receive that not only for me but for every person caught up in this situation.`,
    (vf, ref, echo) => `I bring ${ref} before You on behalf of others: "${vf}"${echo ? ` — and Scripture's word runs with it: "${echo}"` : ""}. What I cannot do for them, You can.`,
  ],
  Warfare: [
    (vf, ref, echo) => `Scripture declares in ${ref}: "${vf}"${echo ? ` — and its voice runs through the whole of Scripture: "${echo}"` : ""}. That is the ground I am standing on — not my own strength.`,
    (vf, ref, echo) => `"${vf}" — ${ref}. ${echo ? `Scripture adds: "${echo}." ` : ""}What God has declared, no authority in heaven or earth can reverse.`,
    (vf, ref, echo) => `In ${ref}, the word of God settles this: "${vf}"${echo ? ` — and Scripture adds its voice: "${echo}"` : ""}. I receive that as my authority in this prayer.`,
    (vf, ref, echo) => `Your word in ${ref} is my weapon: "${vf}"${echo ? ` — and Scripture declares it throughout: "${echo}"` : ""}. I declare that truth now and will not retreat from it.`,
    (vf, ref, echo) => `"${vf}" is what ${ref} says${echo ? `, and Scripture confirms: "${echo}"` : ""}. I place it between me and everything that would contradict it.`,
    (vf, ref, echo) => `The declaration of ${ref} — "${vf}"${echo ? ` — Scripture's own echo: "${echo}"` : ""} — is not a suggestion. It is the ground I am standing on as a weapon of war.`,
    (vf, ref, echo) => `${ref} speaks plainly: "${vf}"${echo ? ` — the whole of Scripture agrees: "${echo}"` : ""}. I receive that as settled and stand on it now.`,
    (vf, ref, echo) => `I take ${ref} as my authority: "${vf}"${echo ? ` — Scripture adds its voice: "${echo}"` : ""}. The battle is the Lord's and the victory is already declared.`,
  ],
};

const PETITION = {
  Adoration: [
    desire => `In the middle of everything surrounding ${desire}, I pause to acknowledge that You are worthy of praise before You move a single circumstance.`,
    desire => `I am not coming with a list of things I need changed. I am coming because You are who You are — and that is the thing I actually need most right now, even around ${desire}.`,
    desire => `Where ${desire} has consumed my attention, I choose to redirect it — not because the need is small, but because You are greater than the need.`,
    desire => `You do not need my praise to be God. But I need to praise You to remember that You are. Let me do that now, even in the middle of ${desire}.`,
    desire => `Every circumstance surrounding ${desire} is held in hands that made the stars. I want to acknowledge that before I do anything else.`,
    desire => `I come to honour You — not because things are perfect around ${desire}, but because You are perfect regardless of what is around me.`,
    desire => `Whatever is happening around ${desire}, You have not changed. I want to begin by saying that out loud and meaning it.`,
    desire => `The praise I bring to You around ${desire} is not performance. It is my choosing, again today, to acknowledge what is actually true about You.`,
  ],
  Thanksgiving: [
    desire => `Even in the middle of ${desire}, I choose to thank You for what You have already done — and for what You are doing that I cannot yet see.`,
    desire => `I want to be honest: ${desire} is real and it matters. And so does the long list of things You have already done that I did not earn. I am choosing gratitude before I choose anything else.`,
    desire => `In the tension of ${desire}, I am not pretending everything is easy. I am choosing to count what You have already given me before asking for more.`,
    desire => `${desire} is a real weight. And so is Your faithfulness. I hold both of them before You and let thanksgiving come first.`,
    desire => `I thank You — specifically, genuinely — in the middle of ${desire}. Not because I feel like it, but because You are worthy of it regardless of how I feel.`,
    desire => `Before I bring the need of ${desire} before You, I want to stop and name what You have already done. You have been faithful in ways I do not always remember to count.`,
    desire => `The truth of what You have provided outweighs the weight of ${desire}. I choose to let that be true today, and I begin with thanksgiving.`,
    desire => `I approach ${desire} with gratitude as my posture — not because it removes the difficulty, but because it reminds me who is greater than the difficulty.`,
  ],
  Petition: [
    desire => `I am asking specifically about ${desire}. Not because I have earned an answer, but because You are good and You have told me to ask. So I am asking.`,
    desire => `I bring ${desire} to You directly and honestly. I am not trying to dress it up or make it sound better than it is. This is what I need.`,
    desire => `Lord, the matter of ${desire} is not small to me. I believe it is not small to You either. I bring it now and ask You to move.`,
    desire => `I am specifically asking You to intervene in ${desire}. I have thought about it, prayed about it, tried to handle it on my own. I am bringing it to You now.`,
    desire => `${desire} is what I am carrying, and I am laying it at Your feet — not with a plan, not with a demand, just honestly, as someone who needs You.`,
    desire => `I make this specific request about ${desire}: move in this, Father. Do what only You can do, in the way only You would choose to do it.`,
    desire => `I am asking plainly — not because I deserve an answer but because You have invited me to ask. The matter is ${desire}, and I need You to be God in it.`,
    desire => `Lord, I am not asking You to do what I could do for myself. I am asking You to do what only You can do with ${desire}. I trust the difference.`,
  ],
  Intercession: [
    desire => `I lift those caught up in ${desire} before You now. Reach into the places I cannot go. Move in ways only You can. Let Your mercy be greater than their need.`,
    desire => `I am standing in the gap today for those affected by ${desire}. I cannot fix it. I cannot reach them in every way they need. But You can.`,
    desire => `Lord, I bring others before You — those whose lives are shaped by ${desire}. Let Your hand reach further into their situation than mine ever could.`,
    desire => `I intercede now for those who are in the middle of ${desire}. Give them what they cannot give themselves. Be near to them in ways they cannot manufacture.`,
    desire => `For everyone touched by ${desire} — I ask You to move. I cannot be everywhere. You can. I cannot fix everything. You can. I am asking.`,
    desire => `I carry the weight of ${desire} on behalf of others today. Meet them where they are. Bring healing, clarity, and peace where I cannot go.`,
    desire => `Let Your intervention in ${desire} be greater than anything human hands can bring. I release those involved into Your care and trust You with the outcome.`,
    desire => `I stand before You for those caught up in ${desire}. They may not be praying right now. I am praying on their behalf, and I trust that is not a small thing.`,
  ],
  Warfare: [
    desire => `I bring ${desire} into the light of Your word and resist every lie, fear, or oppression attached to it. No weapon formed against what You have purposed will stand.`,
    desire => `In the name and authority of Christ, I come against everything that would hold ${desire} under darkness. Your word is my weapon and Your promise is my ground.`,
    desire => `I take authority — not in my own name but in Christ's — over everything that has attached itself to ${desire}. I declare it broken, in Jesus' name.`,
    desire => `Lord, ${desire} is not just a circumstance. There are spiritual realities at work. I bring them into the light of Your word and ask for Your authority to push back the darkness.`,
    desire => `I stand against every lie, every fear, every stronghold connected to ${desire}. Not because I am strong enough, but because You are — and You are in me.`,
    desire => `The battle over ${desire} is not mine to win in my own strength. I take my stand in Christ and call on the God of hosts to fight what I cannot fight alone.`,
    desire => `I refuse to be moved by what I see around ${desire}. I choose to be moved by what God has said. I declare His word over this situation now.`,
    desire => `${desire} has tried to define the territory. I am declaring that the territory belongs to God, and I stand in that declaration right now.`,
  ],
};

const COMMIT = {
  Adoration: [
    () => `I trust You with all of it. You are God and I am not, and today that is enough. Amen.`,
    () => `Everything I carry, I lay at Your feet — not because I have solved it, but because You are the God I have been learning to trust. Amen.`,
    () => `I release what I cannot control and receive what You are. That is the only exchange worth making. Amen.`,
    () => `My confidence is not in my praise being eloquent enough. It is in You being exactly who You are. Amen.`,
    () => `I come, I worship, I go out different. That is what praise does when we mean it. Amen.`,
    () => `I leave this moment different from how I entered it — because I have been in the presence of God. Amen.`,
    () => `You are worthy. That is where I begin and where I end. Amen.`,
    () => `I choose to walk away from this prayer not carrying less — but seeing more clearly who carries it all. Amen.`,
  ],
  Thanksgiving: [
    () => `My trust is in You. You have been faithful and You will be faithful. Amen.`,
    () => `I choose gratitude, not because everything is resolved, but because You are resolved — unchanging and faithful. Amen.`,
    () => `What I am grateful for is not a small thing. I receive it as a gift and hold it carefully. Amen.`,
    () => `Thank You — specifically, genuinely — not because I have worked up enough emotion, but because You are worth thanking. Amen.`,
    () => `I leave this prayer with more than I came with — because gratitude does that when it is real. Amen.`,
    () => `Your goodness is not conditional on my circumstances. I receive that truth and I thank You for it. Amen.`,
    () => `You have been good. You are good. You will be good. I rest in that. Amen.`,
    () => `Gratitude is not the end of the conversation — it is the beginning of the right one. I choose it today. Amen.`,
  ],
  Petition: [
    () => `Whatever Your answer looks like, I trust that You are working for my good and Your glory. Amen.`,
    () => `I have brought it. I leave it. Whatever You do with it is wisdom I cannot match. Amen.`,
    () => `I am not telling You what to do — I am asking You to do what only You can. I trust the difference. Amen.`,
    () => `I release this into Your hands, knowing that Your hands are better than mine. Amen.`,
    () => `Your answer will be right. It may not look like what I imagined, but it will be right. I trust You with that. Amen.`,
    () => `I have asked honestly. I wait expectantly. I trust completely. Amen.`,
    () => `This is Yours now. Do what only You can do, in the way only You would choose. Amen.`,
    () => `I release my timeline, my expectations, and my preferred outcome — and trust You with all three. Amen.`,
  ],
  Intercession: [
    () => `I release this into Your hands, trusting You see what I cannot. Amen.`,
    () => `I have done what I can do — I have prayed. I trust You with the rest. Amen.`,
    () => `What I have placed in Your hands is safer there than in mine. I trust You with it. Amen.`,
    () => `I cannot be God in this situation. I am asking the God of this situation to show up. Amen.`,
    () => `I have stood in the gap. Now I stand back and trust the God who fills every gap. Amen.`,
    () => `The people I have prayed for are in Your hands now — hands far more capable than mine. Amen.`,
    () => `I intercede and I trust — because prayer without trust is just anxiety in religious language. Amen.`,
    () => `I let go of what I cannot carry and trust it to the One who already carries all things. Amen.`,
  ],
  Warfare: [
    () => `I choose to stand, not in my own strength, but in Yours. In Jesus' name. Amen.`,
    () => `The battle is the Lord's. I stand in it with Him. That is all the confidence I need. Amen.`,
    () => `I declare the victory that is already won, and I walk forward in it. Amen.`,
    () => `No weapon formed against what God has purposed will stand. I receive that as settled. Amen.`,
    () => `I put down what I was carrying in my own strength and pick up what God has already provided. Amen.`,
    () => `Greater is He that is in me. That is not a slogan — it is the ground I stand on. Amen.`,
    () => `The name above every name is the only authority I need. I pray in it. Amen.`,
    () => `I leave this battle in the hands of the One who has never lost one. Amen.`,
  ],
};

// ── Dynamic prayer builder ─────────────────────────────────────────────────
// Assembles one prayer point using:
//   - Pool entries chosen deterministically from verse ref + idx
//   - A Markov-generated "echo phrase" woven into the DECLARE movement
//     — derived from the selected verse's actual vocabulary
//   - Quality score computed and returned alongside the text
function buildDynamicPrayer(entry, verseTextStr, desires, category, idx) {
  const cat    = ADDRESS[category] ? category : "Petition";
  const seed   = `${entry.ref}||${idx}`;
  const ref    = entry.ref;
  // Use the FULL verse text — scripture quotes must never be truncated with "…"
  const vf     = (verseTextStr || "").trim();
  const shortD = shortStr(desires);

  // Markov echo: a bridge phrase in biblical register, derived from the verse
  const markov = getMarkov();
  const echo   = markov.isBuilt ? markov.bridgePhrase(verseTextStr, seed, 10) : "";
  // Verse echo: a secondary phrase from the verse vocabulary
  const echo2  = markov.isBuilt ? markov.verseEcho(verseTextStr, seed + "e") : "";

  const address  = seedPick(ADDRESS[cat],  seed, 0)(vf);
  const declare  = seedPick(DECLARE[cat],  seed, 1)(vf, ref, echo || echo2 || null);
  const petition = seedPick(PETITION[cat], seed, 2)(shortD);
  const commit   = seedPick(COMMIT[cat],   seed, 3)();

  const prayerText = `${address} ${declare} ${petition} ${commit}`;
  const quality    = scorePrayer(prayerText, verseTextStr, desires);

  return { prayerText, quality };
}

// ── Public API: generate prayer points ──────────────────────────────────────
export function generatePrayerPoints({ desires, type, count, weights }) {
  const n = Math.min(Math.max(parseInt(count, 10) || 1, 1), 10);

  // Always analyse the prayer request text to understand what the person
  // actually needs before God — not just the category button they tapped.
  // A user who selects "Adoration" but writes about spiritual oppression is
  // in a Warfare prayer; serving them Adoration would miss the point entirely.
  const detected = detectCategory(desires);
  const userType = ADDRESS[type] ? type : null;
  let category;
  if (!userType) {
    category = detected.category;
  } else if (detected.category !== userType && detected.confidence > 0.52) {
    // The prayer request text strongly indicates a different category
    category = detected.category;
  } else {
    category = userType;
  }

  const pool = selectVerses(desires, category, n * 3, weights);

  // Fill short-fall with any category if needed
  const used     = new Set(pool.map(e => e.ref));
  const fallback = selectVerses(desires, "Petition", n * 2, weights)
    .filter(e => !used.has(e.ref));
  const combined = [...pool, ...fallback];

  // Book-level diversity pass: prayer points should come from different books
  // of the Bible, not five verses from Romans just because they share keywords.
  // Verses from the same book as an already-selected verse are placed last.
  const usedBooks = new Set();
  const primary   = [];
  const secondary = [];
  for (const entry of combined) {
    const bid = entry.bookId;
    if (bid && !usedBooks.has(bid)) {
      primary.push(entry);
      usedBooks.add(bid);
    } else {
      secondary.push(entry);
    }
  }
  const merged = [...primary, ...secondary].slice(0, n);

  // Track uncurated verses (used by scheduler for auto-discovery)
  const uncurated = merged
    .filter(e => !CURATED_REFS.has(e.ref))
    .map(e => ({ ref: e.ref, bookId: e.bookId, ch: e.ch, v: e.v, section: e.section, text: e.text }));

  const prayerPoints = merged.map((entry, i) => {
    const text  = entry.text || (entry._verseEntry ? (() => { try { return verseText(entry._verseEntry); } catch { return ""; } })() : "");
    const { prayerText, quality } = buildDynamicPrayer(entry, text, desires, category, i);
    return {
      title:             entry._verseEntry?.title ?? entry.ref,
      prayerText,
      scriptureReference: entry.ref,
      category,
      quality,
      _uncurated:        !CURATED_REFS.has(entry.ref),
      _ref:              entry.ref,
    };
  });

  return { prayerPoints, detectedCategory: category, userTypeOverridden: category !== (userType ?? category), uncuratedVerses: uncurated };
}

// ── Devotional generator ─────────────────────────────────────────────────────
// Upgraded: uses full-Bible TF-IDF for verse selection, Markov for bridge
// language in the reflection movement, and rotating diverse verse selection
// so devotionals from consecutive days pull from different parts of Scripture.

const DEVOTION_OPENINGS = [
  goal => `There is something worth sitting with today around the matter of ${goal}.`,
  goal => `The question underneath ${goal} is not simply practical — it is a question about trust.`,
  goal => `When we bring ${goal} honestly before God, something has to give — and it will not be His word.`,
  goal => `${goal.charAt(0).toUpperCase() + goal.slice(1)} is not a peripheral concern. Scripture speaks directly into it.`,
  goal => `Most people treat ${goal} as a problem to solve. Scripture treats it as an invitation to encounter God.`,
  goal => `What if the real question behind ${goal} is not "how do I fix this?" but "who is God in this?"`,
  goal => `${goal.charAt(0).toUpperCase() + goal.slice(1)} has a way of revealing where our actual trust lies. That is not comfortable — but it is useful.`,
  goal => `God has not been silent about ${goal}. The question is whether we are prepared to hear what He has said.`,
  goal => `To bring ${goal} to God is to begin a conversation He has been waiting to have with you.`,
  goal => `The weight of ${goal} is real. So is the God who knows about it — and who has already spoken.`,
];

const DEVOTION_REFLECTIONS = [
  (ref, vf, word, bridge) => `The words of ${ref} are not decorative comfort — they carry the full weight of God's character behind them. "${vf}"${bridge ? ` The whole of Scripture speaks with them: "${bridge}."` : ""} Every word that verse rests on has been proven across centuries of people who brought the same kind of need you are carrying today.`,
  (ref, vf, word, bridge) => `In ${ref} we find this: "${vf}"${bridge ? ` — and Scripture's own voice adds: "${bridge}."` : ""} It is worth noticing that God does not say this as a suggestion — He says it as a declaration. The question is whether we are willing to receive it in that spirit.`,
  (ref, vf, word, bridge) => `Consider what ${ref} is actually claiming: "${vf}"${bridge ? ` Scripture's voice runs alongside: "${bridge}."` : ""} The invitation here is not to produce something you don't have, but to receive something already on offer. That shifts everything about how you approach ${word} today.`,
  (ref, vf, word, bridge) => `"${vf}"${bridge ? ` — Scripture echoes it: "${bridge}"` : ""} — those are the words of ${ref}, and they are not offered to the strong or the sorted. They are offered to the honest. The honest who admit they need what only God can give.`,
  (ref, vf, word, bridge) => `${ref} does not soften the difficulty of ${word}. It puts God's character directly next to it. "${vf}"${bridge ? ` — and Scripture's own voice adds: "${bridge}."` : ""} That is not a platitude — it is a claim about who God is when we bring our real need to Him.`,
  (ref, vf, word, bridge) => `Every phrase of "${vf}" — ${ref}${bridge ? ` — and Scripture adds: "${bridge}"` : ""} — carries deliberate weight. This was written by someone who had already trusted God with a weight like ${word} and found Him sufficient.`,
  (ref, vf, word, bridge) => `The truth of ${ref} is that God has already spoken about ${word}: "${vf}"${bridge ? ` — and Scripture affirms it: "${bridge}"` : ""}. The gap between knowing that and living it is not closed by more information. It is closed by trust built one day at a time.`,
  (ref, vf, word, bridge) => `What ${ref} is saying goes deeper than immediate comfort: "${vf}"${bridge ? ` Scripture's own words add: "${bridge}"` : ""}. It is saying that the God who made the world has a specific posture toward the person carrying ${word}, and that posture is not indifference.`,
  (ref, vf, word, bridge) => `There is a reason Scripture returns again and again to the ground of ${ref}: "${vf}"${bridge ? ` — the whole of Scripture agrees: "${bridge}"` : ""}. God knew that people in every era would need this truth — not just to hear, but to live from.`,
  (ref, vf, word, bridge) => `"${vf}"${bridge ? ` — Scripture adds: "${bridge}"` : ""} — ${ref}. Let that land. Not as something to analyze but as something to receive. God is saying something specific here to the person carrying ${word}.`,
];

const DEVOTION_APPLICATIONS = [
  goal => `One practical step today: before you act on ${goal} from anxiety or striving, pause and read this verse once more. Let the truth settle before the action begins.`,
  goal => `Take one moment today — just one — to consciously lay ${goal} down and pick it back up as a trust decision rather than a weight. That is what this verse is asking of you.`,
  goal => `Today's invitation is simple: bring ${goal} into conversation with this verse. Not a long theological exercise — just a moment of honesty with God about what you actually need.`,
  goal => `Wherever you are with ${goal} today — stuck, uncertain, or carrying something heavy — there is one movement this verse calls for: trust. Choose it once, right now.`,
  goal => `The practical application of this verse is not complicated: take what it says, put it next to ${goal}, and ask God to make it real in your actual situation today.`,
  goal => `Do not try to resolve ${goal} by tomorrow. Do try to bring it honestly before God today, with this verse as your footing. That is sustainable, and it is what this devotion asks.`,
  goal => `This verse is not asking you to feel differently about ${goal}. It is asking you to think differently — specifically, in light of who God is rather than only what the circumstances look like.`,
  goal => `Before the day is over, hold this verse in one hand and ${goal} in the other. Let God be the one to show you what they have to say to each other.`,
  goal => `The only next step this devotion calls for is honesty: honest prayer about ${goal}, grounded in this verse. Not performance — just real conversation with a God who already knows what you're carrying.`,
  goal => `Take what this verse says about ${goal} and apply it in one specific place today. Not in theory — in one real decision, one real conversation, one real moment of choosing trust over control.`,
];

const DEVOTION_PRAYERS = [
  (ref, goal) => `Father, Your word in ${ref} is enough. Let it be enough for me today — specifically around ${goal}. I receive it as truth and choose to act from it rather than from fear. Amen.`,
  (ref, goal) => `Lord, I hold ${goal} before You and hold ${ref} beside it. Where they don't line up with how I've been thinking, change my thinking. I trust You with the rest. Amen.`,
  (ref, goal) => `God, I am not equal to ${goal} on my own. But that is the point — You are. Let this verse be the ground I stand on today, not just something I read. Amen.`,
  (ref, goal) => `Father, the truth of ${ref} is not a small thing. Let it do its full work in me — especially in the part of me still trying to handle ${goal} without You. Amen.`,
  (ref, goal) => `Lord, I bring ${goal} to You and I bring this verse with it. Let the word of God be what actually shapes my response today, not my anxiety. Amen.`,
  (ref, goal) => `God, I choose to believe what ${ref} says more than what my circumstances say about ${goal}. Help me live from that choice today. Amen.`,
  (ref, goal) => `Father, thank You for speaking directly into ${goal}. I receive ${ref} not as religious information but as a word from a God who is paying attention. Amen.`,
  (ref, goal) => `Lord, let the truth of this verse do what I cannot do for myself with ${goal}. I stop striving. I trust. Amen.`,
  (ref, goal) => `I bring ${goal} honestly before You, Lord, and I bring ${ref} with it. I ask You to do in me what only You can do. Amen.`,
  (ref, goal) => `Father, You have spoken about ${goal} in ${ref} and I choose to receive what You have said. Let that word take root today and produce something I could not produce on my own. Amen.`,
];

export function generateDevotional({ goal, dayNumber, weights }) {
  const idx  = getBibleIndex();
  const goalTokens = tokenize(goal).filter(w => !STOP.has(w));
  const shortGoal  = shortStr(goal, 70);
  const weightMap  = weights ? new Map(Object.entries(weights)) : null;

  let verse, verseTextStr;

  if (idx.isBuilt) {
    // Full-Bible TF-IDF with learned weights + curated boost
    // Rotate through results across days so consecutive devotionals differ
    const hits = idx.query(goal, { topN: 30, weights: weightMap, curatedRefs: CURATED_REFS });
    const pickIdx = (dayNumber ?? 0) % Math.max(hits.length, 1);
    const hit   = hits[pickIdx] ?? hits[0];
    verse       = hit ? { ref: hit.ref, ch: hit.ch, v: hit.v, bookId: hit.bookId, text: hit.text } : null;
    verseTextStr = verse?.text ?? "";
  }

  // Fallback: curated bank
  if (!verse || !verseTextStr) {
    const bank   = getVerseBank();
    const keySet = new Set(goalTokens);
    const pool   = bank.filter(v => v.keywords.some(k => keySet.has(k)));
    const fallpool = pool.length >= 2 ? pool : bank.filter(v => v.category === "Thanksgiving");
    const fi     = (dayNumber ?? 0) % Math.max(fallpool.length, 1);
    const bv     = fallpool[fi] ?? bank[0];
    try { verseTextStr = verseText(bv); } catch { verseTextStr = ""; }
    verse = { ref: bv.ref, ch: bv.chapter, v: bv.verseStart, bookId: bv.bookId, text: verseTextStr };
  }

  const ref     = verse.ref;
  // Scripture text in devotionals must be complete — no truncation with "…"
  const vf      = (verseTextStr || "").trim();
  const seed    = `${ref}||${goal}`;
  const coreWord = goalTokens[0] ?? verseKeyWords(verseTextStr, 3)[0] ?? "this";

  // Markov bridge phrase woven into the reflection
  const markov = getMarkov();
  const bridge  = markov.isBuilt ? markov.bridgePhrase(verseTextStr, seed, 12) : "";

  const opening     = seedPick(DEVOTION_OPENINGS,     seed, 0)(shortGoal);
  const reflection  = seedPick(DEVOTION_REFLECTIONS,  seed, 1)(ref, vf, coreWord, bridge || null);
  const application = seedPick(DEVOTION_APPLICATIONS, seed, 2)(shortGoal);
  const closing     = seedPick(DEVOTION_PRAYERS,       seed, 3)(ref, shortGoal);

  return {
    title:             `Walking Toward: ${goal}`,
    scriptureReference: ref,
    scriptureText:     verseTextStr,
    body:              `${opening}\n\n${reflection}\n\n${application}`,
    closingPrayer:     closing,
    detectedCategory:  detectCategory(goal).category,
  };
}
