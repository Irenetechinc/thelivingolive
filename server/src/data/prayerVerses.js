// Curated scripture bank for the rule-based prayer/devotion engine
// (server/src/lib/prayerEngine.js). Verse text itself is NOT stored here —
// it's pulled live from the local KJV data by {bookId, chapter, verseStart,
// verseEnd} so it can never drift out of sync with the actual Bible text.
//
// Book IDs match server/src/data/bible/index.json.

export const VERSE_BANK = [
  // ── Adoration ───────────────────────────────────────────────────────
  { ref: "Psalm 8:1", bookId: 19, chapter: 8, verseStart: 1, title: "The Majesty of Your Name", category: "Adoration", keywords: ["glory","name","majesty","lord","god","excellent"] },
  { ref: "Psalm 95:6", bookId: 19, chapter: 95, verseStart: 6, title: "Worship Our Maker", category: "Adoration", keywords: ["worship","bow","kneel","maker","creator"] },
  { ref: "Psalm 145:3", bookId: 19, chapter: 145, verseStart: 3, title: "Greatly to Be Praised", category: "Adoration", keywords: ["great","praise","greatness","god"] },
  { ref: "Isaiah 6:3", bookId: 23, chapter: 6, verseStart: 3, title: "Holy, Holy, Holy", category: "Adoration", keywords: ["holy","glory","earth","lord"] },
  { ref: "Revelation 4:11", bookId: 66, chapter: 4, verseStart: 11, title: "Worthy Is the Lord", category: "Adoration", keywords: ["worthy","glory","honor","power","created"] },
  { ref: "Psalm 100:4", bookId: 19, chapter: 100, verseStart: 4, title: "Enter With Praise", category: "Adoration", keywords: ["praise","thanksgiving","gates","bless","name"] },
  { ref: "1 Chronicles 29:11", bookId: 13, chapter: 29, verseStart: 11, title: "Yours Is the Kingdom", category: "Adoration", keywords: ["greatness","power","glory","victory","majesty","kingdom"] },
  { ref: "Psalm 34:3", bookId: 19, chapter: 34, verseStart: 3, title: "Magnify the Lord", category: "Adoration", keywords: ["magnify","exalt","name","together"] },

  // ── Thanksgiving ────────────────────────────────────────────────────
  { ref: "Psalm 107:1", bookId: 19, chapter: 107, verseStart: 1, title: "His Mercy Endures", category: "Thanksgiving", keywords: ["thanks","good","mercy","endure","forever"] },
  { ref: "1 Thessalonians 5:18", bookId: 52, chapter: 5, verseStart: 18, title: "In Everything Give Thanks", category: "Thanksgiving", keywords: ["thanks","everything","will","god"] },
  { ref: "Philippians 4:6", bookId: 50, chapter: 4, verseStart: 6, title: "With Thanksgiving", category: "Thanksgiving", keywords: ["anxious","careful","prayer","supplication","thanksgiving","request","worry","anxiety"] },
  { ref: "Psalm 100:4-5", bookId: 19, chapter: 100, verseStart: 4, verseEnd: 5, title: "The Lord Is Good", category: "Thanksgiving", keywords: ["good","mercy","truth","thankful","bless"] },
  { ref: "Colossians 3:15", bookId: 51, chapter: 3, verseStart: 15, title: "Be Thankful", category: "Thanksgiving", keywords: ["peace","thankful","heart","body"] },
  { ref: "Psalm 118:24", bookId: 19, chapter: 118, verseStart: 24, title: "This Is the Day", category: "Thanksgiving", keywords: ["day","rejoice","glad","made"] },
  { ref: "2 Corinthians 9:15", bookId: 47, chapter: 9, verseStart: 15, title: "His Unspeakable Gift", category: "Thanksgiving", keywords: ["gift","thanks","unspeakable"] },
  { ref: "James 1:17", bookId: 59, chapter: 1, verseStart: 17, title: "Every Good Gift", category: "Thanksgiving", keywords: ["gift","good","perfect","provision","father","job","family","health"] },

  // ── Petition ─────────────────────────────────────────────────────────
  { ref: "Matthew 7:7", bookId: 40, chapter: 7, verseStart: 7, title: "Ask, and It Shall Be Given", category: "Petition", keywords: ["ask","seek","knock","given","find"] },
  { ref: "Philippians 4:6-7", bookId: 50, chapter: 4, verseStart: 6, verseEnd: 7, title: "The Peace That Guards", category: "Petition", keywords: ["anxious","peace","request","worry","anxiety","job","health","finances","money"] },
  { ref: "James 1:5", bookId: 59, chapter: 1, verseStart: 5, title: "Ask for Wisdom", category: "Petition", keywords: ["wisdom","decision","direction","confused","school","career","job"] },
  { ref: "Psalm 37:4", bookId: 19, chapter: 37, verseStart: 4, title: "The Desires of Your Heart", category: "Petition", keywords: ["desire","heart","delight","want","dream"] },
  { ref: "1 John 5:14-15", bookId: 62, chapter: 5, verseStart: 14, verseEnd: 15, title: "Confidence in Prayer", category: "Petition", keywords: ["confidence","will","hear","ask"] },
  { ref: "Matthew 6:33", bookId: 40, chapter: 6, verseStart: 33, title: "Seek First", category: "Petition", keywords: ["seek","kingdom","provision","need","added","money","job"] },
  { ref: "Psalm 34:17", bookId: 19, chapter: 34, verseStart: 17, title: "The Lord Hears the Righteous", category: "Petition", keywords: ["cry","trouble","hear","deliver"] },
  { ref: "Hebrews 4:16", bookId: 58, chapter: 4, verseStart: 16, title: "Come Boldly", category: "Petition", keywords: ["boldly","grace","mercy","help","need","time"] },

  // ── Intercession ────────────────────────────────────────────────────
  { ref: "1 Timothy 2:1", bookId: 54, chapter: 2, verseStart: 1, title: "Prayers for All People", category: "Intercession", keywords: ["intercession","prayer","supplication","people","all"] },
  { ref: "James 5:16", bookId: 59, chapter: 5, verseStart: 16, title: "Pray for One Another", category: "Intercession", keywords: ["pray","heal","confess","one","another","sick","friend","family"] },
  { ref: "Ezekiel 22:30", bookId: 26, chapter: 22, verseStart: 30, title: "Standing in the Gap", category: "Intercession", keywords: ["gap","stand","hedge","land","nation"] },
  { ref: "Colossians 1:9", bookId: 51, chapter: 1, verseStart: 9, title: "Praying Without Ceasing for Others", category: "Intercession", keywords: ["knowledge","wisdom","understanding","filled","others","friend"] },
  { ref: "Job 42:10", bookId: 18, chapter: 42, verseStart: 10, title: "Praying for Friends", category: "Intercession", keywords: ["friend","captivity","restore","turn"] },
  { ref: "Romans 15:30", bookId: 45, chapter: 15, verseStart: 30, title: "Strive Together in Prayer", category: "Intercession", keywords: ["strive","together","love","spirit"] },
  { ref: "1 Samuel 12:23", bookId: 9, chapter: 12, verseStart: 23, title: "Sin Not in Ceasing to Pray", category: "Intercession", keywords: ["cease","sin","teach","good","right"] },
  { ref: "Luke 22:32", bookId: 42, chapter: 22, verseStart: 32, title: "I Have Prayed for You", category: "Intercession", keywords: ["faith","fail","strengthen","brethren","family"] },

  // ── Warfare ─────────────────────────────────────────────────────────
  { ref: "Ephesians 6:11-12", bookId: 49, chapter: 6, verseStart: 11, verseEnd: 12, title: "The Whole Armor of God", category: "Warfare", keywords: ["armor","wiles","devil","spiritual","wickedness","fight","battle","struggle"] },
  { ref: "James 4:7", bookId: 59, chapter: 4, verseStart: 7, title: "Resist the Devil", category: "Warfare", keywords: ["resist","devil","submit","flee","temptation"] },
  { ref: "2 Corinthians 10:4", bookId: 47, chapter: 10, verseStart: 4, title: "Weapons of Our Warfare", category: "Warfare", keywords: ["weapon","carnal","strongholds","mighty","battle"] },
  { ref: "1 Peter 5:8", bookId: 60, chapter: 5, verseStart: 8, title: "Your Adversary the Devil", category: "Warfare", keywords: ["adversary","devil","lion","devour","sober","vigilant"] },
  { ref: "Isaiah 54:17", bookId: 23, chapter: 54, verseStart: 17, title: "No Weapon Shall Prosper", category: "Warfare", keywords: ["weapon","prosper","tongue","condemn","attack","enemy"] },
  { ref: "Romans 8:37", bookId: 45, chapter: 8, verseStart: 37, title: "More Than Conquerors", category: "Warfare", keywords: ["conqueror","victory","love","overwhelm"] },
  { ref: "1 John 4:4", bookId: 62, chapter: 4, verseStart: 4, title: "Greater Is He", category: "Warfare", keywords: ["greater","overcome","world","fear","anxiety"] },
  { ref: "Zechariah 4:6", bookId: 38, chapter: 4, verseStart: 6, title: "Not by Might", category: "Warfare", keywords: ["might","power","spirit","impossible","overwhelmed"] },
];

// Seed keyword weights per category. Values are how strongly a keyword hit
// pulls scoring toward that category during detection; feedback-driven
// promotion (see server/src/lib/scheduler.js) adds NEW keyword→category
// entries here at runtime by writing into `runtimeKeywords`, without
// touching this hand-curated seed list.
const SEED_KEYWORDS = {
  Adoration: { worship: 3, praise: 3, glory: 2, holy: 2, majesty: 2, adore: 3, wonderful: 1, great: 1 },
  Thanksgiving: { thank: 3, thanks: 3, grateful: 3, gratitude: 3, blessing: 2, blessed: 2, provided: 1, thankful: 3 },
  Petition: { need: 2, ask: 2, please: 1, want: 1, help: 1, provide: 2, wisdom: 1, healing: 1, job: 1, money: 1, finances: 2 },
  Intercession: { friend: 2, family: 2, others: 2, someone: 2, nation: 2, world: 1, church: 2, pastor: 2, sick: 2, brother: 2, sister: 2 },
  Warfare: { attack: 3, enemy: 3, temptation: 3, battle: 3, struggle: 2, addiction: 3, oppression: 3, bondage: 3, fear: 2, anxiety: 1, spiritual: 1, stronghold: 3 },
};

// Keywords learned at runtime from highly-rated requests (see scheduler.js).
// Kept separate from SEED_KEYWORDS so a bad promotion can be reset without
// losing the curated baseline, and so this stays a plain in-memory cache
// that's rebuilt from Supabase on boot rather than a second source of truth.
const runtimeKeywords = {
  Adoration: new Map(), Thanksgiving: new Map(), Petition: new Map(), Intercession: new Map(), Warfare: new Map(),
};

function buildCategoryMap(name) {
  const map = new Map(Object.entries(SEED_KEYWORDS[name] ?? {}));
  for (const [k, v] of runtimeKeywords[name]) map.set(k, (map.get(k) ?? 0) + v);
  return map;
}

export const CATEGORIES = ["Adoration", "Thanksgiving", "Petition", "Intercession", "Warfare"].map((name) => ({
  name,
  get keywords() {
    return buildCategoryMap(name);
  },
}));

export function learnKeyword(category, keyword, weight = 1) {
  if (!runtimeKeywords[category]) return;
  const current = runtimeKeywords[category].get(keyword) ?? 0;
  runtimeKeywords[category].set(keyword, current + weight);
}

export function loadLearnedKeywords(rows) {
  for (const row of rows ?? []) {
    if (runtimeKeywords[row.category]) {
      runtimeKeywords[row.category].set(row.keyword, row.weight);
    }
  }
}
