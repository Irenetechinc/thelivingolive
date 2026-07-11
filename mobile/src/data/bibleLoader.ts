import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchBibleBooks, fetchBibleChapter, type BibleBookMeta } from "../lib/api";

export type { BibleBookMeta };

const BOOKS_CACHE_KEY = "bible:books";
const chapterCacheKey = (bookId: number, chapter: number, version: string) =>
  `bible:chapter:${version}:${bookId}:${chapter}`;

let booksPromise: Promise<BibleBookMeta[]> | null = null;

// Book list rarely changes — cache in AsyncStorage after first fetch.
export async function loadBibleBooks(): Promise<BibleBookMeta[]> {
  if (booksPromise) return booksPromise;
  booksPromise = (async () => {
    try {
      const books = await fetchBibleBooks();
      await AsyncStorage.setItem(BOOKS_CACHE_KEY, JSON.stringify(books));
      return books;
    } catch (err) {
      const cached = await AsyncStorage.getItem(BOOKS_CACHE_KEY);
      if (cached) return JSON.parse(cached) as BibleBookMeta[];
      throw err;
    }
  })();
  return booksPromise;
}

// Each chapter is cached locally after first load.
export async function loadChapterVerses(
  bookId: number,
  chapter: number,
  version = "KJV"
): Promise<{ verses: string[]; version: string; fallback?: boolean; fallbackReason?: string }> {
  const cacheKey = chapterCacheKey(bookId, chapter, version);
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
}
