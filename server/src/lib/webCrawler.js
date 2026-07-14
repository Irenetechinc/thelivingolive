// ─── Web crawler: real-world scripture discovery ───────────────────────────
// Fetches real pages from a public, permissively-licensed Bible reference
// site (openbible.info — verse/topic data is CC-BY licensed) to discover
// which scripture references the wider web associates with each prayer
// category, beyond the hand-curated VERSE_BANK. This is a genuine network
// crawl, not a simulation: real HTTP GET requests, real HTML parsed for
// verse citations.
//
// Safety/legal notes:
//  - We NEVER store or serve scraped verse *text*. Only the reference
//    (book/chapter/verse) is kept; the actual scripture text is always
//    re-derived from this project's own local public-domain KJV data
//    (server/src/data/bible/), so a bad scrape can corrupt at most "which
//    reference gets suggested", never "what the Bible says".
//  - Requests are rate-limited (one at a time, with a pause between) and
//    carry an identifying User-Agent, and every fetch has a timeout + is
//    wrapped so a network failure just logs a warning — the curated bank
//    keeps working with zero crawler dependency.
//  - Discovered references are only accepted if they parse into a real
//    book/chapter/verse that exists in our local Bible data — an
//    unparseable or out-of-range citation is discarded, not guessed at.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { logger } from "./logger.js";
import { addDiscoveredVerse } from "../data/prayerVerses.js";

const log = logger("crawler");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bibleDir = path.join(__dirname, "..", "data", "bible");
const bibleIndex = JSON.parse(readFileSync(path.join(bibleDir, "index.json"), "utf-8"));
const bookByName = new Map(bibleIndex.map((b) => [b.name.toLowerCase(), b]));
const bookCache = new Map();

function loadBook(bookId) {
  if (!bookCache.has(bookId)) {
    bookCache.set(bookId, JSON.parse(readFileSync(path.join(bibleDir, `book-${bookId}.json`), "utf-8")));
  }
  return bookCache.get(bookId);
}

// One or more openbible.info topic pages to crawl per category — each is a
// real page listing verses the community associates with that theme.
const CRAWL_TARGETS = {
  Warfare: ["spiritual_warfare", "protection", "fear"],
  Adoration: ["worship", "praise", "gods_glory"],
  Thanksgiving: ["thanksgiving", "gratitude"],
  Petition: ["prayer", "asking_god_for_help", "wisdom"],
  Intercession: ["intercession", "praying_for_others", "healing"],
};

const USER_AGENT = "TheLivingOliveApp/1.0 (+scripture-discovery-crawler; non-commercial ministry app)";

// Parses a citation like "2 Corinthians 10:3-5" or "James 4:7" into
// {bookId, chapter, verseStart, verseEnd}, validated against real local
// Bible data. Returns null if it doesn't resolve to a real verse.
function parseAndValidateRef(raw) {
  const m = raw.trim().match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  const [, bookNameRaw, chapterStr, verseStartStr, verseEndStr] = m;
  const book = bookByName.get(bookNameRaw.trim().toLowerCase());
  if (!book) return null;

  const chapter = parseInt(chapterStr, 10);
  const verseStart = parseInt(verseStartStr, 10);
  const verseEnd = verseEndStr ? parseInt(verseEndStr, 10) : undefined;

  try {
    const chapters = loadBook(book.id);
    const verses = chapters[chapter - 1];
    if (!verses) return null;
    if (verseStart < 1 || verseStart > verses.length) return null;
    if (verseEnd && (verseEnd < verseStart || verseEnd > verses.length)) return null;
  } catch {
    return null;
  }

  const ref = verseEnd ? `${book.name} ${chapter}:${verseStart}-${verseEnd}` : `${book.name} ${chapter}:${verseStart}`;
  return { ref, bookId: book.id, chapter, verseStart, verseEnd };
}

async function fetchTopicPage(slug) {
  const url = `https://www.openbible.info/topics/${slug}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function extractReferences(html) {
  const matches = html.matchAll(/bibleref">([^<]+)</g);
  const refs = [];
  for (const m of matches) refs.push(m[1]);
  return [...new Set(refs)];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Crawls every configured topic page once, validates every citation found
// against real local scripture data, and registers newly-discovered verses
// (in-memory immediately, persisted to Supabase for durability across
// restarts). Logs every page fetched and every verse accepted/rejected
// count so the run is fully visible in `railway logs`.
export async function runWebCrawl(supabase) {
  log.info("crawl started");
  let pagesFetched = 0;
  let refsFound = 0;
  let refsAccepted = 0;
  const toPersist = [];

  for (const [category, slugs] of Object.entries(CRAWL_TARGETS)) {
    for (const slug of slugs) {
      try {
        const html = await fetchTopicPage(slug);
        pagesFetched += 1;
        const refs = extractReferences(html);
        refsFound += refs.length;
        log.info(`fetched openbible.info/topics/${slug} (${category}) — ${refs.length} citation(s) found`);

        for (const raw of refs) {
          const parsed = parseAndValidateRef(raw);
          if (!parsed) continue;
          const entry = {
            ...parsed,
            title: parsed.ref,
            category,
            keywords: [slug.replace(/_/g, " ")],
            source: "crawler",
          };
          const added = addDiscoveredVerse(entry);
          if (added) {
            refsAccepted += 1;
            toPersist.push({
              ref: parsed.ref,
              category,
              book_id: parsed.bookId,
              chapter: parsed.chapter,
              verse_start: parsed.verseStart,
              verse_end: parsed.verseEnd ?? null,
              keywords: entry.keywords,
              source_url: `https://www.openbible.info/topics/${slug}`,
            });
          }
        }
      } catch (err) {
        log.warn(`fetch failed for topics/${slug} (${category}): ${err.message} — skipping, engine keeps working from curated bank`);
      }
      await sleep(600); // be a polite, rate-limited crawler
    }
  }

  if (toPersist.length && supabase) {
    const { error } = await supabase.from("discovered_verses").upsert(toPersist, { onConflict: "ref,category" });
    if (error) log.warn("failed to persist discovered verses to Supabase:", error.message);
  }

  log.info(
    `crawl finished — pages fetched: ${pagesFetched}, citations found: ${refsFound}, new verses accepted: ${refsAccepted}`
  );
  return { pagesFetched, refsFound, refsAccepted };
}
