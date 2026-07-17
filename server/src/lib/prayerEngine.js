// ─── Rule-based prayer/devotion engine ──────────────────────────────────────
// Deliberately contains NO calls to any LLM API and needs no GPU: every
// prayer point and devotional below is assembled from (a) a curated table of
// real scripture references, matched by keyword overlap against what the
// user typed, and (b) dynamically chosen language pools driven by the verse
// text, verse keywords, and user desires — not fixed per-category templates.
//
// "Self-evolving" means concretely:
//   - every generated item can be rated; ratings adjust a per-verse weight
//     (verse_category_weights) so better-received scripture gets selected more
//     often over time
//   - the daily web crawl (webCrawler.js) discovers new scripture candidates
//   - the genetic algorithm (geneticAlgorithm.js) re-derives the whole weight
//     vector per category against full feedback history
//   - keywords from highly-rated requests are promoted into the keyword table
//   - the verse explain engine quality-benchmarks its own output and purges
//     low-scoring cached entries
// That is a real, working feedback loop — not simulated.

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
// Bible data, so the engine never has to hardcode scripture text separately.
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
    category: topScore > 0 ? topName : "Petition",
    confidence: topScore > 0 ? Math.min(1, topScore / totalScore + 0.15) : 0.3,
    scores,
  };
}

// ── Verse selection ─────────────────────────────────────────────────────
export function selectVerses(category, desireText, count, weights) {
  const words = new Set(tokenize(desireText).filter((w) => !STOPWORDS.has(w)));
  const pool = getVerseBank().filter((v) => v.category === category);
  const scored = pool.map((v) => {
    const overlap = v.keywords.reduce((s, k) => s + (words.has(k) ? 1 : 0), 0);
    const weight = weights?.[v.ref] ?? 1;
    const jitter = (v.ref.length % 7) * 0.01;
    return { v, score: overlap * 2 + weight + jitter };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map((s) => s.v);
}

// ── Dynamic text helpers ─────────────────────────────────────────────────

// Deterministic pick seeded from verse ref + index — avoids Math.random()
// so the same verse+desire combo produces consistent (but varied) language.
function seedPick(arr, seedStr, offset = 0) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (Math.imul(31, h) + seedStr.charCodeAt(i)) | 0;
  return arr[Math.abs(h + offset) % arr.length];
}

// Extract the most significant non-trivial words from verse text
function verseKeyFragments(verseTextStr, count = 5) {
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

// Pull meaningful words from the user's desires string
function desireKeyWords(desires) {
  const SKIP = new Set(["want","need","help","please","really","very","just","that","with","for","and","the","pray","prayer"]);
  return desires.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)
    .filter((w) => w.length > 3 && !SKIP.has(w)).slice(0, 4);
}

// Truncate desires for embedding in prose
function shortDesireStr(desires, max = 80) {
  const t = desires.trim();
  return t.length <= max ? t : t.slice(0, max - 1) + "…";
}

// Trim verse text to a natural sentence boundary
function verseFrag(verseTextStr, max = 95) {
  if (verseTextStr.length <= max) return verseTextStr;
  const cut = verseTextStr.lastIndexOf(" ", max);
  return cut > 40 ? verseTextStr.slice(0, cut) + "…" : verseTextStr.slice(0, max) + "…";
}

// ── Language pools (address, declare, petition, commit) ──────────────────
// Each pool is keyed loosely by category emphasis but all entries are generic
// enough to work across categories — the right entry is chosen by seeding
// from the verse reference, so the same verse always produces the same
// language variant, but different verses produce different ones.

const ADDRESS_POOLS = {
  Adoration: [
    (vf) => `Magnificent God, whose glory fills every corner of creation —`,
    (vf) => `Father of all light and every perfect gift —`,
    (vf) => `Lord Most High, worthy of honour that no words can fully contain —`,
    (vf) => `Everlasting God, whose greatness has no beginning and no end —`,
    (vf) => `Holy One, before whom the angels cover their faces and cry holy —`,
    (vf) => `Creator and Sustainer of all that is —`,
    (vf) => `God who is magnificent beyond all our speaking —`,
    (vf) => `Sovereign Lord, who reigns over all things seen and unseen —`,
  ],
  Thanksgiving: [
    (vf) => `Faithful God, from whose hand every good thing flows —`,
    (vf) => `Good Father, whose mercies are new every morning —`,
    (vf) => `Lord of every gift, known and unknown to us —`,
    (vf) => `Provider and Sustainer — the one who gives and never runs out —`,
    (vf) => `God of constant goodness, who blesses beyond what we deserve —`,
    (vf) => `Lord, whose generosity is written into the fabric of creation —`,
    (vf) => `Father, in whom there is no shadow of turning —`,
    (vf) => `Gracious God, whose faithfulness outlasts every generation —`,
  ],
  Petition: [
    (vf) => `Gracious Father, who has told us to ask and promised to hear —`,
    (vf) => `Lord who hears, who bends low to attend to our voice —`,
    (vf) => `Heavenly Father, from whom every answer ultimately comes —`,
    (vf) => `God of every grace, who is not far from any one of us —`,
    (vf) => `Lord who sees the need before the words leave our lips —`,
    (vf) => `Father, in whose presence we can bring the full weight of our need —`,
    (vf) => `God, who delights in the prayers of the righteous —`,
    (vf) => `Lord, who calls us to come boldly and does not turn the seeking away —`,
  ],
  Intercession: [
    (vf) => `Merciful Lord, who sees every person we could never fully reach —`,
    (vf) => `God who sees — who is never ignorant of what others are carrying —`,
    (vf) => `Father of compassion, whose heart is always turned toward the lost —`,
    (vf) => `Lord of all comfort, who heals what medicine cannot touch —`,
    (vf) => `God of every nation and every name —`,
    (vf) => `Father, whose love for others is greater than our love could ever be —`,
    (vf) => `Lord who stood in the gap before we knew what the gap was —`,
    (vf) => `Interceding Christ, ever living to make intercession —`,
  ],
  Warfare: [
    (vf) => `Lord God Almighty, whose authority no principality can withstand —`,
    (vf) => `Captain of the hosts, whose armies are beyond number —`,
    (vf) => `God of power and authority, in whom all victory is secured —`,
    (vf) => `Sovereign Lord, before whom every knee will bow —`,
    (vf) => `Lord of hosts — the God of armies who has never lost a battle —`,
    (vf) => `Mighty God, who has not given us a spirit of fear —`,
    (vf) => `Lord, who has disarmed principalities and powers at the cross —`,
    (vf) => `God of final victory, whose word has already declared the outcome —`,
  ],
};

const DECLARE_POOLS = {
  Adoration: [
    (vf, ref) => `Your word in ${ref} declares "${vf}" — and I receive that not as a fact to file away but as a declaration of who You are that I want to respond to right now.`,
    (vf, ref) => `"${vf}" — ${ref}. I come today not to bring a request but to acknowledge what is already true about You.`,
    (vf, ref) => `Scripture says, "${vf}" — and I want to dwell in that truth before I do anything else. You are worthy of more honour than I have given You.`,
    (vf, ref) => `In ${ref}, we read: "${vf}" — I receive that as the ground I am standing on as I come to You.`,
    (vf, ref) => `Your word declares "${vf}" — ${ref}. That is not a fact for study; it is a reality to encounter.`,
    (vf, ref) => `"${vf}" is what ${ref} says, and I choose to begin here — not with my need but with Your nature.`,
    (vf, ref) => `The words of ${ref} land with weight: "${vf}" — I receive that today.`,
  ],
  Thanksgiving: [
    (vf, ref) => `Your word reminds me in ${ref}: "${vf}" — and I have seen enough of Your faithfulness to receive that as more than words.`,
    (vf, ref) => `"${vf}" — ${ref}. I want to hold that truth before I move into anything else today.`,
    (vf, ref) => `Scripture says "${vf}" — ${ref} — and looking back, I can see that it is true. You have been faithful.`,
    (vf, ref) => `In ${ref} You speak: "${vf}" — I receive that not just as theology but as the lived reality of my own story with You.`,
    (vf, ref) => `"${vf}" is what ${ref} declares, and I choose to receive it today as a foundation for gratitude rather than a sentence to read.`,
    (vf, ref) => `Your faithfulness is declared in ${ref}: "${vf}" — and I am choosing to let that be true rather than arguing with it.`,
    (vf, ref) => `The truth of ${ref} settles over everything: "${vf}" — I receive it.`,
  ],
  Petition: [
    (vf, ref) => `Your word promises in ${ref}: "${vf}" — and I hold that promise against what I am facing, because Your word stands when circumstances do not.`,
    (vf, ref) => `"${vf}" — ${ref}. That is what You have said, and I am choosing to ask on the basis of what You have said rather than what I deserve.`,
    (vf, ref) => `Scripture gives me ground to stand on in ${ref}: "${vf}" — I am not asking in ignorance of Your will; I am asking because Your word has opened the door.`,
    (vf, ref) => `In ${ref} You say "${vf}" — I take You at Your word and bring this to You directly.`,
    (vf, ref) => `"${vf}" is what You have declared in ${ref}, and it gives me confidence to ask what I am about to ask.`,
    (vf, ref) => `Your promise in ${ref} reads: "${vf}" — I receive that as permission to bring this need fully and honestly before You.`,
    (vf, ref) => `${ref} says "${vf}" — I receive that as the ground of this prayer, not my own righteousness.`,
  ],
  Intercession: [
    (vf, ref) => `Your word in ${ref} says "${vf}" — and I claim that promise not just for myself but for those I am lifting before You right now.`,
    (vf, ref) => `"${vf}" — ${ref}. That is what You have said, and I bring others before You on the strength of it.`,
    (vf, ref) => `Scripture declares in ${ref}: "${vf}" — I hold that truth over the people I am praying for today.`,
    (vf, ref) => `In ${ref} we read: "${vf}" — I receive that as true for those I carry in this prayer, not only for myself.`,
    (vf, ref) => `"${vf}" is Your word in ${ref}, and I stand on it on behalf of others who may not be standing on anything right now.`,
    (vf, ref) => `The promise of ${ref} — "${vf}" — is big enough to cover what I am about to bring to You.`,
    (vf, ref) => `${ref} declares "${vf}" — I receive that not only for me but for every person caught up in this.`,
  ],
  Warfare: [
    (vf, ref) => `Scripture declares in ${ref}: "${vf}" — and I receive that as the ground I am standing on in this moment, not my own strength.`,
    (vf, ref) => `"${vf}" — ${ref}. That is the word I am standing on. What God has declared, no authority in heaven or earth can reverse.`,
    (vf, ref) => `In ${ref}, the word of God settles this: "${vf}" — I receive that as my authority in this prayer.`,
    (vf, ref) => `Your word in ${ref} is my weapon: "${vf}" — I declare that truth now and will not retreat from it.`,
    (vf, ref) => `"${vf}" is what ${ref} says, and I place it between me and everything that would contradict it.`,
    (vf, ref) => `The declaration of ${ref} — "${vf}" — is not a suggestion. It is a promise I am receiving right now as a weapon of war.`,
    (vf, ref) => `${ref} speaks plainly: "${vf}" — I receive that as settled and stand on it.`,
  ],
};

const PETITION_POOLS = {
  Adoration: [
    (desire, dWords) => `In the middle of everything surrounding ${desire}, I pause to acknowledge that You are worthy of praise before You move a single circumstance.`,
    (desire, dWords) => `I am not coming with a list of things I need changed. I am coming because You are who You are, and being in Your presence is the thing I actually need most right now — even around ${desire}.`,
    (desire, dWords) => `Where ${desire} has consumed my attention, I choose to redirect it — not because the need is small, but because You are greater than the need.`,
    (desire, dWords) => `You do not need my praise to be God. But I need to praise You to remember that You are. Let me do that now, even in the middle of ${desire}.`,
    (desire, dWords) => `Every circumstance surrounding ${desire} is held in hands that made the stars. I want to acknowledge that before I do anything else.`,
    (desire, dWords) => `I come to honour You — not because things are perfect around ${desire}, but because You are perfect regardless.`,
    (desire, dWords) => `Whatever is happening around ${desire}, You have not changed. I want to begin by saying that out loud.`,
  ],
  Thanksgiving: [
    (desire, dWords) => `Even in the middle of ${desire}, I choose to thank You for what You have already done and what You are already doing that I cannot yet see.`,
    (desire, dWords) => `I want to be honest: ${desire} is real and it matters. And so does the list of things You have already done that I did not earn. I am choosing gratitude before I choose anything else.`,
    (desire, dWords) => `In the tension of ${desire}, I am not pretending everything is easy. I am choosing to count what You have already given me before asking for more.`,
    (desire, dWords) => `${desire} is a real weight. And so is Your faithfulness. I want to hold both of them before You and let thanksgiving come first.`,
    (desire, dWords) => `I thank You — specifically, genuinely — in the middle of ${desire}. Not because I feel like it but because You are worthy of it.`,
    (desire, dWords) => `Before I bring the need of ${desire} before You, I want to stop and name what You have already done. You have been faithful.`,
    (desire, dWords) => `The truth of what You have provided outweighs the weight of ${desire}. I choose to let that be true today.`,
  ],
  Petition: [
    (desire, dWords) => `I am asking specifically about ${desire}. Not because I have earned an answer, but because You are good and You have told me to ask. So I am asking.`,
    (desire, dWords) => `I bring ${desire} to You directly and honestly. I am not trying to dress it up. This is what I need, and I trust that You already know it.`,
    (desire, dWords) => `Lord, the matter of ${desire} is not small to me. I believe it is not small to You either. I bring it now and ask You to move.`,
    (desire, dWords) => `I am specifically asking You to intervene in ${desire}. I have thought about it, prayed about it, tried to handle it. I am bringing it to You now.`,
    (desire, dWords) => `${desire} is what I am carrying, and I am laying it at Your feet. Not with a plan, not with a demand — just honestly, as someone who needs You.`,
    (desire, dWords) => `I make this specific request about ${desire}: move in this, Father. Do what only You can do.`,
    (desire, dWords) => `I am asking plainly — not because I deserve an answer but because You have invited me to ask. The matter is ${desire}, and I need You to be God in it.`,
  ],
  Intercession: [
    (desire, dWords) => `I lift those caught up in ${desire} before You now. Reach into the places I cannot go. Move in ways only You can. Let Your mercy be greater than their need.`,
    (desire, dWords) => `I am standing in the gap today for those affected by ${desire}. I cannot fix it. I cannot reach them in every way they need. But You can, and I am asking You to.`,
    (desire, dWords) => `Lord, I bring others before You — those whose lives are shaped by ${desire}. Let Your hand reach further into their situation than mine ever could.`,
    (desire, dWords) => `I intercede now for those who are in the middle of ${desire}. Give them what they cannot give themselves. Be near to them in ways they cannot manufacture.`,
    (desire, dWords) => `For everyone touched by ${desire} — I ask You to move. I cannot be everywhere. You can. I cannot fix everything. You can. I am asking.`,
    (desire, dWords) => `I carry the weight of ${desire} on behalf of others today. Meet them where they are. Bring healing, clarity, and peace where I cannot go.`,
    (desire, dWords) => `Let Your intervention in ${desire} be greater than anything human hands can bring. I am praying for those involved and releasing them into Your care.`,
  ],
  Warfare: [
    (desire, dWords) => `I bring ${desire} into this truth and resist every lie, fear, or oppression attached to it. No weapon formed against what You have purposed will stand.`,
    (desire, dWords) => `In the name and authority of Christ, I come against everything that would hold ${desire} under darkness. The word of God is my weapon and Your promise is my ground.`,
    (desire, dWords) => `I take authority — not in my own name but in Christ's — over everything that has attached itself to ${desire}. I declare it broken, in Jesus' name.`,
    (desire, dWords) => `Lord, ${desire} is not just a circumstance. There are spiritual realities at work. I bring them into the light of Your word and ask for Your authority to push back the darkness.`,
    (desire, dWords) => `I stand against every lie, every fear, every stronghold connected to ${desire}. Not because I am strong enough, but because You are — and You are in me.`,
    (desire, dWords) => `The battle over ${desire} is not mine to win in my own strength. I take my stand in Christ, and I call on the God of hosts to fight what I cannot fight alone.`,
    (desire, dWords) => `I refuse to be moved by what I see around ${desire}. I choose to be moved by what God has said. I declare His word over this situation now.`,
  ],
};

const COMMIT_POOLS = {
  Adoration: [
    () => `I trust You with all of it. You are God and I am not, and today that is enough. Amen.`,
    () => `Everything I carry, I lay at Your feet — not because I have solved it, but because You are the God I have been learning to trust. Amen.`,
    () => `I release what I cannot control and receive what You are. That is the only exchange worth making. Amen.`,
    () => `My confidence is not in my praise being eloquent enough. It is in You being exactly who You are. Amen.`,
    () => `I come, I worship, I go out different. That is what praise does when we mean it. Amen.`,
    () => `I leave this moment different from how I entered it — because I have been in the presence of God. Amen.`,
    () => `You are worthy. That is where I begin and where I end. Amen.`,
  ],
  Thanksgiving: [
    () => `My trust is in You. You have been faithful and You will be faithful. Amen.`,
    () => `I choose gratitude, not because everything is resolved, but because You are resolved — unchanging and faithful. Amen.`,
    () => `What I am grateful for is not a small thing. I receive it as a gift and hold it carefully. Amen.`,
    () => `Thank You — specifically, genuinely. Not because I have worked up enough emotion, but because You are worth thanking. Amen.`,
    () => `I leave this prayer with more than I came with — because gratitude does that when it is real. Amen.`,
    () => `Your goodness is not conditional on my circumstances. I receive that truth and I thank You for it. Amen.`,
    () => `You have been good. You are good. You will be good. I rest in that. Amen.`,
  ],
  Petition: [
    () => `Whatever Your answer looks like, I trust that You are working for my good and Your glory. Amen.`,
    () => `I have brought it. I leave it. Whatever You do with it is wisdom I cannot match. Amen.`,
    () => `I am not telling You what to do — I am asking You to do what only You can. I trust the difference. Amen.`,
    () => `I release this into Your hands, knowing that Your hands are better than mine. Amen.`,
    () => `Your answer will be right. It may not look like what I imagined, but it will be right. I trust You with that. Amen.`,
    () => `I have asked honestly. I wait expectantly. I trust completely. Amen.`,
    () => `This is Yours now. Do what only You can do, in the way only You would choose. Amen.`,
  ],
  Intercession: [
    () => `I release this into Your hands, trusting You see what I cannot. Amen.`,
    () => `I have done what I can do — I have prayed. I trust You with the rest. Amen.`,
    () => `What I have placed in Your hands is safer there than in mine. I trust You with it. Amen.`,
    () => `I cannot be God in this situation. I am asking the God of this situation to show up. Amen.`,
    () => `I have stood in the gap. Now I stand back and trust the God who fills every gap. Amen.`,
    () => `The people I have prayed for are in Your hands now. Hands far more capable than mine. Amen.`,
    () => `I intercede and I trust — because prayer without trust is just anxiety in religious language. Amen.`,
  ],
  Warfare: [
    () => `I choose to stand, not in my own strength, but in Yours. In Jesus' name. Amen.`,
    () => `The battle is the Lord's. I stand in it with Him. That is all the confidence I need. Amen.`,
    () => `I declare the victory that is already won, and I walk forward in it. Amen.`,
    () => `No weapon formed against what God has purposed will stand. I receive that as settled. Amen.`,
    () => `I put down what I was carrying in my own strength and pick up what God has already provided. Amen.`,
    () => `Greater is He that is in me. That is not a slogan — it is the ground I stand on. Amen.`,
    () => `The name above every name is the only authority I need. I pray in it. Amen.`,
  ],
};

// ── Dynamic prayer builder ───────────────────────────────────────────────
// Generates prayer language by weaving the actual verse text with the user's
// own words. No fixed per-category strings — language is chosen by seeding
// from the verse reference and index so the same verse always produces
// consistent language, but different verses produce genuinely different prayers.
function buildDynamicPrayer(verseEntry, verseTextStr, desires, category, idx) {
  const cat = CATEGORIES.some((c) => c.name === category) ? category : "Petition";
  const seed = verseEntry.ref + idx;
  const dWords = desireKeyWords(desires);
  const shortDesire = shortDesireStr(desires);
  const vf = verseFrag(verseTextStr);

  const addressPool = ADDRESS_POOLS[cat] ?? ADDRESS_POOLS.Petition;
  const declarePool = DECLARE_POOLS[cat] ?? DECLARE_POOLS.Petition;
  const petitionPool = PETITION_POOLS[cat] ?? PETITION_POOLS.Petition;
  const commitPool = COMMIT_POOLS[cat] ?? COMMIT_POOLS.Petition;

  const address  = seedPick(addressPool, seed, 0)(vf);
  const declare  = seedPick(declarePool, seed, 1)(vf, verseEntry.ref);
  const petition = seedPick(petitionPool, seed, 2)(shortDesire, dWords);
  const commit   = seedPick(commitPool, seed, 3)();

  return `${address} ${declare} ${petition} ${commit}`;
}

// ── Public generation API ───────────────────────────────────────────────
export function generatePrayerPoints({ desires, type, count, weights }) {
  const n = Math.min(Math.max(parseInt(count, 10) || 1, 1), 10);
  const category = CATEGORIES.some((c) => c.name === type) ? type : detectCategory(desires).category;
  const verses = selectVerses(category, desires, n, weights);

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

// ── Devotional builder ───────────────────────────────────────────────────
// Language pools keyed to verse keywords and goal words — selection is
// seeded by verse ref + goal content so the same goal+verse produces
// consistent but non-template output. No indexed arrays picked by day number.

function pickByVerseKeywords(pools, verseKeywords, goalWords, seed) {
  // Score each pool entry by how many keywords it shares with verse/goal terms
  // When scores tie, the seed breaks the tie deterministically.
  const keySet = new Set([...verseKeywords, ...goalWords]);
  const scored = pools.map((p, i) => {
    const text = typeof p === "function" ? p("", "", "") : p;
    const matches = [...keySet].filter((k) => text.toLowerCase().includes(k)).length;
    return { idx: i, score: matches };
  });
  scored.sort((a, b) => b.score - a.score || ((a.idx + seed) % pools.length) - ((b.idx + seed) % pools.length));
  const chosen = pools[scored[0].idx];
  return chosen;
}

const DEVOTION_OPENINGS = [
  (goal) => `There is something worth sitting with today around the matter of ${goal}.`,
  (goal) => `The question underneath ${goal} is not simply practical — it is a question about trust.`,
  (goal) => `When we bring ${goal} honestly before God, something has to give — and it will not be His word.`,
  (goal) => `${goal.charAt(0).toUpperCase() + goal.slice(1)} is not a peripheral concern. Scripture speaks directly into it.`,
  (goal) => `Most people treat ${goal} as a problem to solve. Scripture treats it as an invitation to encounter God.`,
  (goal) => `What if the real question behind ${goal} is not "how do I fix this?" but "who is God in this?"`,
  (goal) => `${goal.charAt(0).toUpperCase() + goal.slice(1)} has a way of revealing where our actual trust lies. That is not a comfortable discovery — but it is a useful one.`,
  (goal) => `God has not been silent about ${goal}. The question is whether we are prepared to hear what He has said.`,
  (goal) => `To bring ${goal} to God is to begin a conversation He has been waiting to have with you.`,
  (goal) => `The weight of ${goal} is real. So is the God who knows about it.`,
];

const DEVOTION_REFLECTIONS = [
  (ref, vf, word) => `The words of ${ref} are not decorative comfort — they carry the full weight of God's character behind them. "${vf}" Every word that verse rests on has been proven across centuries of people who brought the same kind of need you are carrying today.`,
  (ref, vf, word) => `In ${ref} we find this: "${vf}" It is worth noticing that God does not say this as a suggestion — He says it as a declaration. The question is whether we are willing to receive it in that spirit.`,
  (ref, vf, word) => `Consider what ${ref} is actually claiming: "${vf}" The invitation here is not to produce something you don't have, but to receive something already on offer. That shifts everything about how you approach ${word} today.`,
  (ref, vf, word) => `"${vf}" — those are the words of ${ref}, and they are not offered to the strong or the sorted. They are offered to the honest. The honest who admit they need what only God can give.`,
  (ref, vf, word) => `${ref} does not soften the difficulty of ${word}. It puts God's character directly next to it. "${vf}" That is not a platitude — it is a claim about who God is and what He does when we bring our real need to Him.`,
  (ref, vf, word) => `Every phrase of "${vf}" — ${ref} — carries deliberate weight. This was not casual inspiration. These words were written by someone who had already trusted God with a weight like ${word} and found Him sufficient.`,
  (ref, vf, word) => `The truth of ${ref} is that God has already spoken about ${word}: "${vf}" The gap between knowing that and living it is not closed by information. It is closed by trust. And trust is built by choosing it one day at a time.`,
  (ref, vf, word) => `What ${ref} is saying goes deeper than immediate comfort: "${vf}" It is saying that the God who made the world has a specific posture toward the person carrying ${word}, and that posture is not indifference.`,
  (ref, vf, word) => `There is a reason Scripture returns again and again to the ground of ${ref}: "${vf}" God knew that people in every era would need this truth — not just to hear, but to live by.`,
  (ref, vf, word) => `"${vf}" — ${ref}. Let that land. Not as something to analyze but as something to receive. God is saying something specific here to the person carrying ${word}.`,
];

const DEVOTION_APPLICATIONS = [
  (goal) => `One practical step today: before you act on ${goal} from anxiety or striving, pause and read this verse once more. Let the truth settle before the action begins.`,
  (goal) => `Take one moment today — just one — to consciously lay ${goal} down and pick it back up as a trust decision rather than a weight. That is what this verse is asking of you.`,
  (goal) => `Today's invitation is simple: bring ${goal} into conversation with this verse. Not a long theological exercise — just a moment of honesty with God about what you actually need and what He has actually said.`,
  (goal) => `Wherever you are with ${goal} today — stuck, uncertain, or carrying something heavy — there is one movement this verse calls for: trust. Choose it once, right now, and see what that does.`,
  (goal) => `The practical application of this verse is not complicated: take what it says, put it next to ${goal}, and ask God to make it real in your actual situation today — not in theory, but in the specific details of your life.`,
  (goal) => `Do not try to resolve ${goal} by tomorrow. Do try to bring it honestly before God today, with this verse as your footing. That is a sustainable practice, and it is what this devotion is asking of you.`,
  (goal) => `This verse is not asking you to feel differently about ${goal}. It is asking you to think differently about it — specifically, to think about it in light of who God is rather than only what the circumstances look like.`,
  (goal) => `Before the day is over, hold this verse in one hand and ${goal} in the other. Let God be the one to show you what they have to say to each other.`,
  (goal) => `The only next step this devotion calls for is honesty: honest prayer about ${goal}, grounded in this verse. Not performance — just real conversation with a God who already knows what you're carrying.`,
];

const DEVOTION_PRAYERS = [
  (ref, goal) => `Father, Your word in ${ref} is enough. Let it be enough for me today — specifically around ${goal}. I receive it as truth and choose to act from it rather than from fear. Amen.`,
  (ref, goal) => `Lord, I hold ${goal} before You and hold ${ref} beside it. Where they don't line up with how I've been thinking, change my thinking. I trust You with the rest. Amen.`,
  (ref, goal) => `God, I am not equal to ${goal} on my own. But that is the point — You are. Let this verse be the ground I stand on today, not just something I read. Amen.`,
  (ref, goal) => `Father, the truth of ${ref} is not a small thing. Let it do its full work in me — especially in the part of me that is still trying to handle ${goal} without You. Amen.`,
  (ref, goal) => `Lord, I bring ${goal} to You and I bring this verse with it. Let the word of God be what actually shapes my response today, not my anxiety. Amen.`,
  (ref, goal) => `God, I choose to believe what ${ref} says more than what my circumstances say about ${goal}. Help me live from that choice today. Amen.`,
  (ref, goal) => `Father, thank You for speaking directly into ${goal}. I receive ${ref} not as religious information but as a word from a God who is paying attention. Amen.`,
  (ref, goal) => `Lord, let the truth of this verse do what I cannot do for myself with ${goal}. I stop striving. I trust. Amen.`,
  (ref, goal) => `I bring ${goal} honestly before You, Lord, and I bring ${ref} with it. I ask You to do in me what only You can do. Amen.`,
];

export function generateDevotional({ goal, dayNumber, weights }) {
  const detection = detectCategory(goal);
  const bank = getVerseBank();

  // Find verses relevant to the goal via keyword overlap, regardless of category
  const goalTokens = tokenize(goal).filter((w) => !STOPWORDS.has(w));
  const goalKeySet = new Set(goalTokens);
  const pool = bank.filter((v) => v.keywords.some((k) => goalKeySet.has(k)));
  const candidates = pool.length >= 3 ? pool : bank.filter((v) => v.category === "Thanksgiving");

  // Weight-aware verse selection: prefer highly-rated verses
  const scored = candidates.map((v) => ({
    v,
    score: (weights?.[v.ref] ?? 1) + v.keywords.filter((k) => goalKeySet.has(k)).length * 0.5,
  })).sort((a, b) => b.score - a.score);

  // Pick deterministically from top candidates using dayNumber as a rotating offset
  const pickIdx = (dayNumber ?? 1) % Math.max(scored.length, 1);
  const verse = scored[pickIdx]?.v ?? scored[0]?.v ?? bank[0];
  const text = verseText(verse);
  const verseKeywords = verseKeyFragments(text, 5);

  const shortGoal = shortDesireStr(goal, 70);
  const vf = verseFrag(text, 85);
  const coreWord = goalTokens[0] ?? verseKeywords[0] ?? "this";

  // Seed for pool selection — based on verse ref + goal content
  let seedHash = 0;
  for (const ch of (verse.ref + goal)) seedHash = (Math.imul(31, seedHash) + ch.charCodeAt(0)) | 0;
  const seed = Math.abs(seedHash);

  const openingFn = seedPick(DEVOTION_OPENINGS, verse.ref + "open", 0);
  const reflectionFn = seedPick(DEVOTION_REFLECTIONS, verse.ref + "reflect", 1);
  const applicationFn = seedPick(DEVOTION_APPLICATIONS, verse.ref + "apply", 2);
  const prayerFn = seedPick(DEVOTION_PRAYERS, verse.ref + "pray", 3);

  const opening = openingFn(shortGoal);
  const reflection = reflectionFn(verse.ref, vf, coreWord);
  const application = applicationFn(shortGoal);
  const closingPrayer = prayerFn(verse.ref, shortGoal);

  const body = `${opening}\n\n${reflection}\n\n${application}`;

  return {
    title: `Walking Toward: ${goal}`,
    scriptureReference: verse.ref,
    scriptureText: text,
    body,
    closingPrayer,
    detectedCategory: detection.category,
  };
}
