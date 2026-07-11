import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchBibleBooks, fetchBibleChapter, type BibleBookMeta } from "../lib/api";

export type { BibleBookMeta };

const BOOKS_CACHE_KEY = "bible:books";
const chapterCacheKey = (bookId: number, chapter: number) => `bible:chapter:${bookId}:${chapter}`;

let booksPromise: Promise<BibleBookMeta[]> | null = null;

// Book list rarely changes, so cache it in AsyncStorage after the first
// successful fetch and fall back to that cache if the network is slow/down.
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

// Each chapter is cached locally after first load, so re-reading a chapter
// (or reopening the app) doesn't re-download it.
export async function loadChapterVerses(bookId: number, chapter: number): Promise<string[]> {
  const cacheKey = chapterCacheKey(bookId, chapter);
  const cached = await AsyncStorage.getItem(cacheKey);
  if (cached) return JSON.parse(cached) as string[];

  const result = await fetchBibleChapter(bookId, chapter);
  await AsyncStorage.setItem(cacheKey, JSON.stringify(result.verses));
  return result.verses;
}
