// ─── God Persona Knowledge Base ──────────────────────────────────────────────
// NOT a template array. A structured knowledge graph of who God is —
// His attributes, covenant names, and scriptural narratives — from which
// the prayer composer and verse explainer BUILD unique sentences every time.
//
// Structure:
//   ATTRIBUTES  — 10 core divine attributes, each with:
//                 names[]       — how to address God in this aspect
//                 verbPhrases[] — "who [verb phrase]" descriptors
//                 implications[]— what this attribute means for the human situation
//                 scriptures[]  — specific verses that reveal this attribute
//                 relevantFor[] — prayer categories this attribute fits best
//
//   COVENANT_NAMES — YHWH Jireh, Rapha, etc. — each with context clues so the
//                    analyzer can match the right name to the right situation
//
//   NARRATIVES — 8 biblical moments of God acting, usable as brief echoes
//                inside prayer and teaching to anchor language in story
//
//   enrichments — Runtime store populated by the web/dictionary learner.
//                 New names and phrases get added here and are immediately
//                 available to the composer without a server restart.

// ── Seeded deterministic picker ───────────────────────────────────────────────
// Same seed + offset → always the same pick. Ensures the same verse + idx
// always generates the same prayer (stable for caching), while different
// combinations produce different output — without any randomness.
export function seedPick(arr, seedStr, offset = 0) {
  if (!arr || !arr.length) return undefined;
  let h = 5381;
  const s = String(seedStr);
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
  return arr[(h + offset) % arr.length];
}

// ── Core attribute knowledge ──────────────────────────────────────────────────
export const ATTRIBUTES = {
  holy: {
    names: [
      "the Holy One",
      "the Most Holy",
      "El Kadosh",
      "the Holy One of Israel",
      "the God who is set apart above all creation",
    ],
    verbPhrases: [
      "who is completely set apart from everything broken and corrupt",
      "before whom the seraphim cover their faces and cry holy, holy, holy",
      "in whose presence no darkness can remain",
      "whose moral perfection is the only standard that has never bent",
      "who burns with a purity that sets the terms for every approach to Him",
      "before whom every pretense dissolves and only truth remains",
    ],
    implications: [
      "coming before Him is not casual — it is the most serious thing a person can do",
      "He does not overlook what is broken; He transforms it",
      "His holiness is not primarily about distance — it is about difference; He is categorically other than everything that fails",
      "to be in His presence is to be known completely, which is either terrifying or the most liberating thing in the world",
      "what He calls holy, no power in heaven or earth can declare unclean",
    ],
    scriptures: ["Isaiah 6:3", "Revelation 4:8", "1 Peter 1:16", "Psalm 99:9", "Isaiah 57:15", "Leviticus 11:44"],
    relevantFor: ["Adoration", "Intercession", "Confession"],
  },

  sovereign: {
    names: [
      "the Almighty",
      "El Shaddai",
      "YHWH Sabaoth",
      "the Lord of Hosts",
      "the God who rules over all things",
      "the sovereign Lord",
    ],
    verbPhrases: [
      "whose authority no principality in heaven or earth can withstand",
      "who rules over every circumstance without consulting anyone",
      "before whom every plan of the enemy must ultimately yield",
      "who has never been outmaneuvered, never caught off guard, never surprised",
      "whose will has never once been stopped by anything that seemed to stand against it",
      "who sits above every name that is named in this age or the age to come",
    ],
    implications: [
      "nothing that is happening right now is outside His knowledge or beyond His authority",
      "what He has decreed cannot be undone by any force, any circumstance, or any failure",
      "He is not struggling to manage this — He is the sovereign Lord of it",
      "His plan for you was established before you were born and has not been revoked",
      "the most powerful opposition in the universe is less than a whisper against His word",
    ],
    scriptures: ["Job 42:2", "Daniel 4:35", "Isaiah 46:10", "Psalm 115:3", "Ephesians 1:11", "Proverbs 19:21"],
    relevantFor: ["Warfare", "Petition", "Thanksgiving", "Surrender"],
  },

  eternal: {
    names: [
      "the Eternal",
      "the Ancient of Days",
      "the great I AM",
      "the Alpha and Omega",
      "the one who was and is and is to come",
      "El Olam",
    ],
    verbPhrases: [
      "who exists entirely outside of time and is never in a hurry",
      "who sees your past, present, and future simultaneously from where He stands",
      "who has not changed since before the universe was spoken into being",
      "whose promises do not expire, whose covenant does not erode, whose word does not age",
      "who was already present in this situation before you arrived at it",
      "in whom yesterday and tomorrow are both fully now",
    ],
    implications: [
      "what He has promised is not subject to a deadline — it arrives at exactly the right time",
      "He is not anxious about what you are anxious about because He already holds the outcome",
      "the same God who parted the sea is your God right now — not a historical figure, a present reality",
      "His faithfulness has outlasted every generation that doubted it",
      "you are not the first person to bring this weight to Him, and He was sufficient for all of them",
    ],
    scriptures: ["Revelation 1:8", "Psalm 90:2", "Isaiah 40:28", "Hebrews 13:8", "Exodus 3:14", "Isaiah 41:4"],
    relevantFor: ["Petition", "Faith", "Thanksgiving"],
  },

  living: {
    names: [
      "the living God",
      "El Roi",
      "the God who sees",
      "the God who hears",
      "the God who acts",
      "YHWH Shammah",
    ],
    verbPhrases: [
      "who is not a historical figure but an active and present reality right now",
      "who hears every word of this prayer without distraction or absence",
      "who sees what others cannot see and is not indifferent to what He sees",
      "in whom there is no dormancy, no distance, no voicemail",
      "who responds to honest prayer because He is genuinely present to receive it",
      "whose word is living and active, not archived and retired",
    ],
    implications: [
      "you are not sending a message into silence — you are speaking to a God who is listening right now",
      "He sees the full weight of this, not just the surface of it",
      "His presence in this situation is not symbolic — it is real, active, and working",
      "Hagar found God in the wilderness when she thought she was alone; He had been there the whole time",
      "He does not need you to explain the background — He was already there when it happened",
    ],
    scriptures: ["Hebrews 4:12", "Psalm 139:1-4", "Matthew 6:6", "Acts 17:28", "Jeremiah 29:12", "Genesis 16:13"],
    relevantFor: ["All"],
  },

  merciful: {
    names: [
      "the God of all mercy",
      "El Rachum",
      "Abba Father",
      "the God of all comfort",
      "the Father of mercies",
      "the compassionate God",
    ],
    verbPhrases: [
      "whose compassion is not something He works up but something He is",
      "who does not treat us as our sins deserve",
      "who welcomes the broken before He demands the polished",
      "whose mercies are new every morning without a single exception",
      "in whom failure does not disqualify but driving need draws closer",
      "who remembers that we are dust and meets us exactly there",
    ],
    implications: [
      "you do not have to arrive put together — He receives the honest and the broken",
      "His mercies were new this morning regardless of what happened yesterday",
      "whatever has happened, it has not used up His compassion — that is not how it works",
      "the prodigal came home rehearsing a speech; the father ran before the speech was finished",
      "coming to Him in this is not presumptuous — it is exactly what He asked for",
    ],
    scriptures: ["Lamentations 3:22-23", "Psalm 103:8-14", "Luke 15:20", "2 Corinthians 1:3", "Micah 7:18", "Psalm 86:15"],
    relevantFor: ["Confession", "Healing", "Intercession"],
  },

  faithful: {
    names: [
      "the Faithful One",
      "El Emet",
      "the God who keeps His word",
      "the God who has never broken a covenant",
      "the trustworthy Lord",
    ],
    verbPhrases: [
      "who has never spoken a word He did not intend to keep",
      "whose faithfulness outlasts every generation that has doubted it",
      "who remains faithful even when we are faithless — that is the nature of covenant",
      "whose promises do not depend on our performance to remain true",
      "who said it, who means it, and who will bring it to pass",
      "in whom what He began He will also complete",
    ],
    implications: [
      "the same God who kept His word to Abraham is your God right now — and He has not changed methods",
      "what He has said about this stands, regardless of what the circumstances say",
      "He is not looking for reasons to revise what He has promised — He is looking to fulfill it",
      "your faith does not make His faithfulness true; His faithfulness is what makes your faith possible",
      "He will be faithful in this the same way He has been faithful in everything before it",
    ],
    scriptures: ["2 Timothy 2:13", "Numbers 23:19", "1 Corinthians 1:9", "Psalm 36:5", "Isaiah 25:1", "Deuteronomy 7:9"],
    relevantFor: ["Faith", "Petition", "Thanksgiving", "Intercession"],
  },

  powerful: {
    names: [
      "El Gibbor",
      "the Mighty God",
      "the God of all power",
      "the God of wonders",
      "the one in whom all authority resides",
      "the Lord of armies",
    ],
    verbPhrases: [
      "who commands the armies of heaven with a word",
      "in whom the same power that raised Christ from the dead is alive and working right now",
      "who does not struggle — He commands",
      "before whom no force, spiritual or natural, has any ultimate standing",
      "who has already disarmed principalities and powers at the cross",
      "whose strength does not deplete, whose arm does not tire",
    ],
    implications: [
      "what appears impossible to everything and everyone else is not impossible to Him",
      "the same power that split the sea is available to you — this is not mythology, it is covenant",
      "no stronghold is stronger than His word spoken against it",
      "He does not fight to see who wins — He commands and it is done",
      "when He moves, mountains move — not gradually but immediately",
    ],
    scriptures: ["Ephesians 1:19-20", "Isaiah 40:28-29", "Jeremiah 32:17", "Psalm 29:4", "Zechariah 4:6", "Matthew 19:26"],
    relevantFor: ["Warfare", "Healing", "Deliverance", "Petition"],
  },

  omniscient: {
    names: [
      "the all-knowing God",
      "El Yodea",
      "the God who understands",
      "the God who sees all things",
      "the God who knows your name and your need",
    ],
    verbPhrases: [
      "who knows your thoughts before they form into words",
      "in whom there is no gap between what is and what He knows",
      "who understands the full weight of this better than you can articulate it",
      "whose counsel is perfect because His knowledge has no boundary",
      "who knows what you need before a single word has left your lips",
      "who sees the end of this from its beginning and is not afraid of what He sees",
    ],
    implications: [
      "you do not need to explain the background — He was present for every part of it",
      "He is not learning about this as you pray — He already knows it completely",
      "His answer is not guesswork — it comes from perfect knowledge of you and your situation",
      "there is nothing in this situation that has surprised Him",
      "He knows what you actually need, which is not always what you know you need",
    ],
    scriptures: ["Matthew 6:8", "Psalm 139:1-6", "Isaiah 46:10", "Job 37:16", "1 John 3:20", "Psalm 44:21"],
    relevantFor: ["Petition", "Guidance"],
  },

  just: {
    names: [
      "the righteous Judge",
      "El Tzaddik",
      "the God of justice",
      "the one who vindicates the righteous",
      "the God before whom all accounts are open",
    ],
    verbPhrases: [
      "who cannot be bribed, deceived, or manipulated",
      "in whom justice is not an aspiration but a foundation",
      "who sees every injustice and holds every account",
      "who vindicates those who call on Him with a clean heart",
      "whose righteousness is the only measure that has never been corrupted",
      "before whom nothing done in secret remains permanently hidden",
    ],
    implications: [
      "every wrong done to you is known to Him — not forgotten, not dismissed",
      "He will not let the scales tip permanently toward injustice",
      "His justice is not slow — it is precise, and it arrives at exactly the right moment",
      "calling on the God of justice is not passive resignation; it is the most powerful legal appeal possible",
      "He vindicates — and what He vindicates, no power in heaven or earth can re-condemn",
    ],
    scriptures: ["Psalm 89:14", "Deuteronomy 32:4", "Isaiah 61:8", "Romans 3:26", "Revelation 19:2", "Psalm 9:16"],
    relevantFor: ["Intercession", "Warfare", "Petition"],
  },

  provider: {
    names: [
      "the God who provides",
      "YHWH Jireh",
      "the abundant Lord",
      "the God who satisfies",
      "the one from whose hand every good thing flows",
    ],
    verbPhrases: [
      "who sees the need before the need knows itself",
      "in whom there is no lack, no budget ceiling, no running out",
      "who provided a ram in the thicket when Abraham could see no way",
      "whose provision is not limited by what we can imagine or arrange for ourselves",
      "who clothes the lilies and feeds the sparrows and is more concerned with you than either",
      "in whom every good and perfect gift originates without exception",
    ],
    implications: [
      "the limitation is not on His side",
      "He is not waiting for you to deserve the provision — He is waiting for you to receive it",
      "what He provides often does not look like what we asked for, but it is always exactly what we needed",
      "He does not run out in the middle of what He has started",
      "the same God who kept manna coming for forty years is your God right now",
    ],
    scriptures: ["Genesis 22:14", "Matthew 6:26-33", "Philippians 4:19", "Psalm 23:1", "James 1:17", "2 Corinthians 9:8"],
    relevantFor: ["Petition", "Thanksgiving"],
  },
};

// ── Covenant names ────────────────────────────────────────────────────────────
// Each has `situationSignals` — keywords that trigger selection of this name
// — and `descriptors` — short phrases that describe what this name means in action.
export const COVENANT_NAMES = {
  "YHWH Jireh": {
    meaning: "The Lord who provides",
    situationSignals: ["provision", "need", "lack", "money", "bills", "job", "work", "poverty", "hungry", "afford", "supply"],
    descriptors: [
      "who sees the need before it names itself",
      "who provided when Abraham could see nothing ahead of him",
      "in whom provision is not a question of supply but of trust",
    ],
    scripture: "Genesis 22:14",
  },
  "YHWH Rapha": {
    meaning: "The Lord who heals",
    situationSignals: ["sick", "heal", "health", "disease", "body", "pain", "doctor", "cancer", "diagnosis", "recovery", "chronic", "medicine"],
    descriptors: [
      "whose healing goes beyond the body to every part of a person",
      "who heals what medicine cannot name and restores what injury has taken",
      "in whom restoration is not unlikely — it is His covenant identity",
    ],
    scripture: "Exodus 15:26",
  },
  "YHWH Nissi": {
    meaning: "The Lord my banner of victory",
    situationSignals: ["battle", "fight", "enemy", "warfare", "attack", "overcome", "victory", "resist", "spiritual", "devil", "demonic", "stronghold"],
    descriptors: [
      "who goes before His people in every battle they have ever faced",
      "under whose banner no enemy can claim final victory",
      "whose flag over this situation was planted before you arrived at it",
    ],
    scripture: "Exodus 17:15",
  },
  "YHWH Shalom": {
    meaning: "The Lord our peace",
    situationSignals: ["anxious", "fear", "worry", "peace", "calm", "stress", "anxiety", "turmoil", "trouble", "afraid", "panic", "overwhelmed"],
    descriptors: [
      "who speaks peace into the storms that experienced people cannot navigate alone",
      "whose peace passes the understanding of everyone watching from the outside",
      "in whom the chaos of this situation is not greater than the rest He gives",
    ],
    scripture: "Judges 6:24",
  },
  "YHWH Roi": {
    meaning: "The Lord my shepherd",
    situationSignals: ["guidance", "direction", "lost", "path", "decision", "choice", "confused", "uncertain", "unsure", "where", "shepherd"],
    descriptors: [
      "who leads those who do not know the way to exactly where they need to go",
      "whose guidance is not occasional — it is His nature as shepherd",
      "who does not give up on the sheep that wanders furthest from the flock",
    ],
    scripture: "Psalm 23:1",
  },
  "YHWH Tsidkenu": {
    meaning: "The Lord our righteousness",
    situationSignals: ["forgive", "guilt", "shame", "sin", "repent", "confess", "worthy", "righteous", "condemned", "failure", "wrong"],
    descriptors: [
      "whose righteousness covers what our own never could",
      "who does not ask us to bring clean hands — He provides the cleansing",
      "in whom justification is not earned but received",
    ],
    scripture: "Jeremiah 23:6",
  },
  "YHWH Sabaoth": {
    meaning: "The Lord of armies",
    situationSignals: ["warfare", "army", "hosts", "battle", "spiritual warfare", "principality", "power", "authority", "darkness", "forces"],
    descriptors: [
      "who commands more than the eye can see and more than the enemy can count",
      "in whose army the battle has never once been uncertain from His vantage point",
      "whose armies move when He speaks, not when we feel ready",
    ],
    scripture: "1 Samuel 1:3",
  },
  "El Roi": {
    meaning: "The God who sees",
    situationSignals: ["seen", "alone", "overlooked", "invisible", "abandoned", "forgotten", "isolated", "notice", "unseen"],
    descriptors: [
      "who found Hagar alone in the wilderness and called her by name",
      "who sees the person everyone else has stopped looking for",
      "in whom being unseen is a temporary condition, not a permanent state",
    ],
    scripture: "Genesis 16:13",
  },
  "Abba": {
    meaning: "Father",
    situationSignals: ["father", "family", "child", "parent", "adoption", "belonging", "home", "relationship", "intimate", "personal"],
    descriptors: [
      "who runs toward the returning child before the speech is finished",
      "in whose household there is always enough — room and grace and love",
      "who calls us His own not as a legal designation but as a living reality",
    ],
    scripture: "Romans 8:15",
  },
  "El Elyon": {
    meaning: "The Most High God",
    situationSignals: ["highest", "above all", "supreme", "authority", "over all", "ruling", "kingdoms", "nations"],
    descriptors: [
      "who sits above every human system and every spiritual power",
      "whose position above all things is not honorary — it is actual authority",
      "in whom the final word on every situation always resides",
    ],
    scripture: "Genesis 14:18",
  },
};

// ── Biblical narratives of God acting ─────────────────────────────────────────
// Short echo phrases drawn from actual biblical events.
// Used to anchor prayer language in story, not abstraction.
export const NARRATIVES = [
  {
    theme: ["warfare", "deliverance", "protection"],
    echo: "He did for His servants at the Red Sea what no army could have arranged — He told them to stand still while He fought",
    scripture: "Exodus 14:14",
  },
  {
    theme: ["provision", "need", "lack"],
    echo: "He fed a million people in a desert with bread that appeared each morning — they called it 'what is it?' because they had never seen provision like His before",
    scripture: "Exodus 16:4",
  },
  {
    theme: ["healing", "restoration", "body"],
    echo: "He opened eyes that had never seen light and ears that had never heard music — not as a display but as the ordinary sign of His kingdom arriving",
    scripture: "Isaiah 35:5-6",
  },
  {
    theme: ["protection", "fire", "trial"],
    echo: "He walked into the fire with His servants and there was a fourth figure in the flames — they came out without even the smell of smoke",
    scripture: "Daniel 3:25",
  },
  {
    theme: ["resurrection", "death", "impossible"],
    echo: "He stood at a tomb that had been sealed for four days and spoke one sentence — and the man who was dead walked out",
    scripture: "John 11:43",
  },
  {
    theme: ["warfare", "victory", "enemy"],
    echo: "He routed an entire army — 185,000 soldiers — overnight without Israel lifting a single weapon",
    scripture: "2 Kings 19:35",
  },
  {
    theme: ["intercession", "advocacy", "prayer"],
    echo: "He stands at the right hand of the Father right now making intercession — not as a formality but as the eternal High Priest who has passed through suffering and knows the way through",
    scripture: "Hebrews 7:25",
  },
  {
    theme: ["peace", "storm", "fear", "anxiety"],
    echo: "He spoke three words to a storm that terrified experienced fishermen — and the wind and waves knew the voice of the one who made them",
    scripture: "Mark 4:39",
  },
];

// ── Runtime enrichments from web/dictionary learning ─────────────────────────
// These get populated by the god persona learner cron job.
// New phrases discovered in crawled theological content and dictionary lookups
// are added here and immediately available to the composer.
const enrichments = {};
for (const key of Object.keys(ATTRIBUTES)) {
  enrichments[key] = { additionalNames: [], additionalVerbPhrases: [], additionalImplications: [] };
}

// Patterns to extract God-describing phrases from crawled theological text
const GOD_PHRASE_PATTERNS = [
  /(?:God|Lord|He|Christ|Jesus)\s+(?:who|whom|that|in whom)\s+([^.!?,;]{12,70})/gi,
  /(?:His|God's)\s+([a-z]+ness|[a-z]+ity|[a-z]+ity)\s+(?:is|was|means|shows|reveals)\s+([^.!?,;]{10,60})/gi,
];

const ATTRIBUTE_SIGNALS_FOR_ENRICHMENT = {
  holy:       ["holy", "holiness", "pure", "sacred", "sanctified", "set apart", "righteous"],
  sovereign:  ["sovereign", "sovereignty", "almighty", "rules", "reign", "authority", "power"],
  eternal:    ["eternal", "everlasting", "forever", "timeless", "ancient", "unchanging"],
  living:     ["living", "alive", "active", "present", "hears", "sees", "acts", "speaks"],
  merciful:   ["mercy", "compassion", "grace", "forgive", "lovingkindness", "gentle"],
  faithful:   ["faithful", "faithfulness", "promise", "covenant", "keeps", "reliable", "trust"],
  powerful:   ["powerful", "strength", "might", "strong", "able", "capable", "unstoppable"],
  omniscient: ["knows", "knowledge", "omniscient", "understands", "sees all", "wisdom"],
  just:       ["justice", "righteous", "judge", "fair", "vindicate", "righteous"],
  provider:   ["provide", "provision", "supply", "gives", "sufficient", "abundance"],
};

export function enrichFromContent(text) {
  if (!text || text.length < 50) return;
  for (const pattern of GOD_PHRASE_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const phrase = (match[1] || "").trim().replace(/\s+/g, " ");
      if (phrase.length < 10 || phrase.length > 80) continue;
      // Find which attribute this phrase best signals
      const lower = phrase.toLowerCase();
      for (const [attr, signals] of Object.entries(ATTRIBUTE_SIGNALS_FOR_ENRICHMENT)) {
        if (signals.some(s => lower.includes(s))) {
          const pool = enrichments[attr].additionalVerbPhrases;
          const asPhrase = phrase.startsWith("who ") || phrase.startsWith("in whom") ? phrase : `who ${phrase}`;
          if (!pool.includes(asPhrase) && pool.length < 40) pool.push(asPhrase);
          break;
        }
      }
    }
  }
}

export function enrichFromDictionary(word, synonyms = [], definitions = []) {
  const lower = word.toLowerCase();
  for (const [attr, signals] of Object.entries(ATTRIBUTE_SIGNALS_FOR_ENRICHMENT)) {
    if (signals.includes(lower)) {
      const pool = enrichments[attr].additionalImplications;
      for (const def of definitions.slice(0, 2)) {
        const fragment = def.slice(0, 80).replace(/[^a-zA-Z\s,;-]/g, "");
        if (fragment.length > 20 && !pool.includes(fragment)) pool.push(fragment);
      }
      break;
    }
  }
}

// ── Composition helpers ───────────────────────────────────────────────────────

// Return the combined name pool for an attribute (base + enriched)
function attributeNames(attr) {
  return [...ATTRIBUTES[attr].names, ...(enrichments[attr]?.additionalNames ?? [])];
}

// Return the combined verbPhrase pool for an attribute (base + enriched)
function attributeVerbPhrases(attr) {
  return [...ATTRIBUTES[attr].verbPhrases, ...(enrichments[attr]?.additionalVerbPhrases ?? [])];
}

// Return the combined implication pool for an attribute (base + enriched)
function attributeImplications(attr) {
  return [...ATTRIBUTES[attr].implications, ...(enrichments[attr]?.additionalImplications ?? [])];
}

/**
 * Build a composed address phrase for a given attribute.
 * Output: "[God's name], [who verb phrase]"
 */
export function buildAttributePhrase(attrKey, seed, offset = 0) {
  const attr = ATTRIBUTES[attrKey];
  if (!attr) return "Lord";
  const name = seedPick(attributeNames(attrKey), seed, offset);
  const verb = seedPick(attributeVerbPhrases(attrKey), seed, offset + 1);
  return `${name}, ${verb}`;
}

/**
 * Build a composed implication sentence for a given attribute.
 * Output: a statement about what this attribute of God means for the human situation.
 */
export function buildImplication(attrKey, seed, offset = 0) {
  const impl = seedPick(attributeImplications(attrKey), seed, offset);
  return impl ?? "";
}

/**
 * Pick the most relevant attribute(s) for a given category and set of situations.
 * Returns an array of attribute keys, ranked by relevance.
 */
export function getRelevantAttributes(category, situations = []) {
  const scored = Object.entries(ATTRIBUTES).map(([key, attr]) => {
    let score = 0;
    // Category match
    if (attr.relevantFor.includes(category) || attr.relevantFor.includes("All")) score += 3;
    // Situation match
    for (const sit of situations) {
      if (attr.relevantFor.some(r => r.toLowerCase() === sit.toLowerCase())) score += 1;
    }
    return { key, score };
  });
  return scored.sort((a, b) => b.score - a.score).map(x => x.key);
}

/**
 * Find the best covenant name for the given situation signals.
 * Returns the covenant name key (e.g. "YHWH Jireh") or null.
 */
export function getBestCovenantName(situations = [], requestTokens = []) {
  const tokenSet = new Set(requestTokens.map(t => t.toLowerCase()));
  let bestKey = null, bestScore = 0;
  for (const [name, data] of Object.entries(COVENANT_NAMES)) {
    let score = data.situationSignals.filter(s => tokenSet.has(s) || situations.some(sit => sit.includes(s))).length;
    if (score > bestScore) { bestScore = score; bestKey = name; }
  }
  return bestScore > 0 ? bestKey : null;
}

/**
 * Build an address phrase using the covenant name, if available.
 * Output: "[Covenant name], [descriptor]"
 */
export function buildCovenantPhrase(covenantKey, seed, offset = 0) {
  const cn = COVENANT_NAMES[covenantKey];
  if (!cn) return null;
  const desc = seedPick(cn.descriptors, seed, offset);
  return `${covenantKey}, ${desc}`;
}

/**
 * Find a narrative that fits the given themes.
 */
export function getNarrative(themes = []) {
  const lowerThemes = themes.map(t => t.toLowerCase());
  const matches = NARRATIVES.filter(n => n.theme.some(t => lowerThemes.includes(t)));
  return matches.length > 0 ? matches[Math.floor(Math.random() * matches.length)] : null;
}
