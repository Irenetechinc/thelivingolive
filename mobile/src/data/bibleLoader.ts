import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchBibleChapter, type BibleBookMeta } from "../lib/api";
import { kjvIndex, kjvBooks } from "./bible/kjvBooks";

export type { BibleBookMeta };

const chapterCacheKey = (bookId: number, chapter: number, version: string) =>
  `bible:chapter:${version}:${bookId}:${chapter}`;

// The full KJV text ships inside the app bundle (mobile/src/data/bible/kjv/),
// so the book list and every KJV chapter are available with zero network
// access, on first launch, forever. This is the offline backbone of the
// Bible module — WEB/ASV are a network-only enhancement on top of it.
export async function loadBibleBooks(): Promise<BibleBookMeta[]> {
  return kjvIndex as BibleBookMeta[];
}

function loadLocalKjvChapter(bookId: number, chapter: number): string[] | null {
  const book = kjvBooks[bookId];
  if (!book) return null;
  const verses = book[chapter - 1];
  return verses ?? null;
}

// Each chapter is cached locally after first successful network load.
// KJV never touches the network at all — it's read straight from the
// bundled dataset above, so it always works offline.
export async function loadChapterVerses(
  bookId: number,
  chapter: number,
  version = "KJV"
): Promise<{ verses: string[]; version: string; fallback?: boolean; fallbackReason?: string }> {
  if (version === "KJV") {
    const verses = loadLocalKjvChapter(bookId, chapter);
    if (!verses) throw new Error("Unknown chapter.");
    return { verses, version: "KJV" };
  }

  // WEB/ASV require the network (proxied through our backend). If the
  // device is offline or the request fails for any reason, fall back to
  // the always-available local KJV text rather than showing an error.
  const cacheKey = chapterCacheKey(bookId, chapter, version);
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);

    const result = await fetchBibleChapter(bookId, chapter, version);
    const payload = {
      verses: result.verses,
      version: result.version,
      fallback: result.fallback,
      fallbackReason: result.fallbackReason,
    };
    // Don't cache fallback responses — retry on next open
    if (!result.fallback) {
      await AsyncStorage.setItem(cacheKey, JSON.stringify(payload));
    }
    return payload;
  } catch {
    const verses = loadLocalKjvChapter(bookId, chapter);
    if (!verses) throw new Error("Unknown chapter.");
    return {
      verses,
      version: "KJV",
      fallback: true,
      fallbackReason: "You're offline — showing the KJV text for this passage.",
    };
  }
}
