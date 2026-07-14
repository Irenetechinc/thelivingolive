// ─── Web crawler: real-world scripture discovery + verse teaching context ─────
// Two crawl passes in one run:
//
//   Pass 1 — Prayer category discovery (openbible.info topic pages):
//     Fetches public CC-BY-licensed Bible reference pages to discover which
//     scripture references the broader web associates with each prayer
//     category. Only the *reference* is stored; scripture text always comes
//     from our local KJV data, so a bad scrape can never corrupt what the
//     Bible says — only which reference gets suggested.
//
//   Pass 2 — Verse teaching context (openbible.info verse/commentary pages):
//     For each reference discovered, fetches its verse detail page to
//     extract short human-written teaching snippets (community commentary,
//     usage notes). These are stored as free-text snippets and fed into the
//     algorithmic verse-explanation engine (verseExplainEngine.js) to
//     enrich explanations with real-world theological commentary patterns
//     without storing or reproducing scripture text separately.
//
// Safety/legal notes:
//  - openbible.info verse data is CC-BY licensed; community notes are used
//    only as short quoted snippets with attribution to the source URL.
//  - Requests are rate-limited, carry an identifying User-Agent, have
//    timeouts, and are wrapped so any failure is logged as a warning — the
//    curated bank keeps working with zero crawler dependency.
//  - Every page fetch, ref accepted/rejected, and snippet stored is logged
//    so all crawler activity is visible in `railway logs`.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { logger } from "./logger.js";
import { addDiscoveredVerse } from "../data/prayerVerses.js";
import { addTeachingContext } from "./verseExplainEngine.js";

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

// ── Pass 2: verse teaching context ──────────────────────────────────────────
// Fetches the openbible.info page for a specific verse reference and
// extracts community-written teaching notes. These short snippets are stored
// as teaching context and used by verseExplainEngine.js to produce richer,
// more contextually varied explanations without using LLMs.
async function fetchVerseTeachingPage(ref) {
  // openbible.info uses URL format /topics/<Book+Chapter+Verse>
  // e.g. "John 3:16" → /topics/john_3_16
  const slug = ref.toLowerCase().replace(/\s+/g, "_").replace(/:/g, "_").replace(/-/g, "_");
  const url = `https://www.openbible.info/topics/${slug}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return { html: await res.text(), url };
}

// Extract short human-written notes/snippets from the page HTML.
// These appear inside <p class="comment"> or plain paragraphs in the
// community-note section. We cap at 400 chars per snippet to avoid
// storing large blocks of text.
function extractTeachingSnippets(html) {
  const snippets = [];

  // Try <p class="comment"> blocks first
  const commentMatches = html.matchAll(/<p[^>]*class="[^"]*comment[^"]*"[^>]*>(.*?)<\/p>/gs);
  for (const m of commentMatches) {
    const text = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length > 40 && text.length < 800) snippets.push(text.slice(0, 400));
    if (snippets.length >= 5) break;
  }

  // Fall back to any <p> that looks like a teaching sentence (heuristic)
  if (snippets.length < 2) {
    const pMatches = html.matchAll(/<p[^>]*>(.*?)<\/p>/gs);
    for (const m of pMatches) {
      const text = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (
        text.length > 60 &&
        text.length < 600 &&
        /[Gg]od|[Ll]ord|[Cc]hrist|[Jj]esus|[Pp]rayer|[Ff]aith|[Ss]cripture|[Vv]erse|[Bb]ible/.test(text)
      ) {
        snippets.push(text.slice(0, 400));
        if (snippets.length >= 4) break;
      }
    }
  }

  return [...new Set(snippets)];
}

// Crawls every configured topic page once, validates every citation found
// against real local scripture data, and registers newly-discovered verses
// (in-memory immediately, persisted to Supabase for durability across
// restarts). Also runs a second pass to fetch teaching context for each
// accepted verse. All activity is logged for visibility in `railway logs`.
export async function runWebCrawl(supabase) {
  log.info("crawl started — pass 1: category discovery, pass 2: verse teaching context");
  let pagesFetched = 0;
  let refsFound = 0;
  let refsAccepted = 0;
  const toPersist = [];
  const acceptedRefs = []; // for pass 2

  for (const [category, slugs] of Object.entries(CRAWL_TARGETS)) {
    for (const slug of slugs) {
      try {
        const html = await fetchTopicPage(slug);
        pagesFetched += 1;
        const refs = extractReferences(html);
        refsFound += refs.length;
        log.info(`[pass-1] fetched openbible.info/topics/${slug} (${category}) — ${refs.length} citation(s) found`);

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
            acceptedRefs.push(parsed.ref);
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
        log.warn(`[pass-1] fetch failed for topics/${slug} (${category}): ${err.message} — skipping`);
      }
      await sleep(600);
    }
  }

  if (toPersist.length && supabase) {
    const { error } = await supabase.from("discovered_verses").upsert(toPersist, { onConflict: "ref,category" });
    if (error) log.warn("failed to persist discovered verses to Supabase:", error.message);
  }

  log.info(`[pass-1] complete — pages fetched: ${pagesFetched}, citations found: ${refsFound}, new verses accepted: ${refsAccepted}`);

  // ── Pass 2: teaching context for accepted verses ─────────────────────────
  // Sample up to 20 refs per crawl run to stay polite and within Railway
  // process time; the rest get covered on subsequent daily crawls.
  const refsForPass2 = [...new Set(acceptedRefs)].slice(0, 20);
  log.info(`[pass-2] fetching verse teaching context for ${refsForPass2.length} verse(s)`);

  let snippetsTotal = 0;
  const teachingRows = [];

  for (const ref of refsForPass2) {
    try {
      const { html, url } = await fetchVerseTeachingPage(ref);
      const snippets = extractTeachingSnippets(html);
      if (snippets.length) {
        addTeachingContext(ref, snippets);
        snippetsTotal += snippets.length;
        teachingRows.push({ verse_ref: ref, snippets, source_url: url, scraped_at: new Date().toISOString() });
        log.info(`[pass-2] ${ref} — ${snippets.length} teaching snippet(s) stored`);
      } else {
        log.info(`[pass-2] ${ref} — no teaching snippets found on page`);
      }
    } catch (err) {
      log.warn(`[pass-2] teaching fetch failed for ${ref}: ${err.message} — skipping`);
    }
    await sleep(700);
  }

  if (teachingRows.length && supabase) {
    const { error } = await supabase
      .from("verse_teaching_context")
      .upsert(teachingRows, { onConflict: "verse_ref" });
    if (error) log.warn("failed to persist teaching context to Supabase:", error.message);
    else log.info(`[pass-2] persisted teaching context for ${teachingRows.length} verse(s) to Supabase`);
  }

  log.info(
    `crawl finished — pass-1: ${pagesFetched} pages, ${refsAccepted} new verse(s) | pass-2: ${snippetsTotal} teaching snippet(s) across ${refsForPass2.length} verse(s)`
  );
  return { pagesFetched, refsFound, refsAccepted, teachingSnippets: snippetsTotal };
}

// ── Standalone: fetch teaching context for a specific verse on-demand ────────
// Called when the explanation engine encounters a verse with no cached
// teaching context. Runs in the background (non-blocking) so the explanation
// request doesn't hang.
export async function fetchTeachingContextForVerse(ref, supabase) {
  try {
    log.info(`[on-demand] fetching teaching context for ${ref}`);
    const { html, url } = await fetchVerseTeachingPage(ref);
    const snippets = extractTeachingSnippets(html);
    if (!snippets.length) return;
    addTeachingContext(ref, snippets);
    log.info(`[on-demand] ${ref} — ${snippets.length} teaching snippet(s) stored`);
    if (supabase) {
      await supabase.from("verse_teaching_context").upsert(
        { verse_ref: ref, snippets, source_url: url, scraped_at: new Date().toISOString() },
        { onConflict: "verse_ref" }
      );
    }
  } catch (err) {
    log.warn(`[on-demand] teaching fetch failed for ${ref}: ${err.message}`);
  }
}
