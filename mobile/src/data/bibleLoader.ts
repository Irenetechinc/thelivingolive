import bibleIndex from "./bible/index.json";

export type BibleBookMeta = { id: number; name: string; chapterCount: number };

// Metro requires static string literals in require(), so every book is listed
// explicitly here. This gives us lazy-ish loading: a book's ~verses only get
// pulled into memory the first time loadBookChapters() is called for it.
const bookRequires: Record<number, () => string[][]> = {
  1: () => require("./bible/book-1.json"),
  2: () => require("./bible/book-2.json"),
  3: () => require("./bible/book-3.json"),
  4: () => require("./bible/book-4.json"),
  5: () => require("./bible/book-5.json"),
  6: () => require("./bible/book-6.json"),
  7: () => require("./bible/book-7.json"),
  8: () => require("./bible/book-8.json"),
  9: () => require("./bible/book-9.json"),
  10: () => require("./bible/book-10.json"),
  11: () => require("./bible/book-11.json"),
  12: () => require("./bible/book-12.json"),
  13: () => require("./bible/book-13.json"),
  14: () => require("./bible/book-14.json"),
  15: () => require("./bible/book-15.json"),
  16: () => require("./bible/book-16.json"),
  17: () => require("./bible/book-17.json"),
  18: () => require("./bible/book-18.json"),
  19: () => require("./bible/book-19.json"),
  20: () => require("./bible/book-20.json"),
  21: () => require("./bible/book-21.json"),
  22: () => require("./bible/book-22.json"),
  23: () => require("./bible/book-23.json"),
  24: () => require("./bible/book-24.json"),
  25: () => require("./bible/book-25.json"),
  26: () => require("./bible/book-26.json"),
  27: () => require("./bible/book-27.json"),
  28: () => require("./bible/book-28.json"),
  29: () => require("./bible/book-29.json"),
  30: () => require("./bible/book-30.json"),
  31: () => require("./bible/book-31.json"),
  32: () => require("./bible/book-32.json"),
  33: () => require("./bible/book-33.json"),
  34: () => require("./bible/book-34.json"),
  35: () => require("./bible/book-35.json"),
  36: () => require("./bible/book-36.json"),
  37: () => require("./bible/book-37.json"),
  38: () => require("./bible/book-38.json"),
  39: () => require("./bible/book-39.json"),
  40: () => require("./bible/book-40.json"),
  41: () => require("./bible/book-41.json"),
  42: () => require("./bible/book-42.json"),
  43: () => require("./bible/book-43.json"),
  44: () => require("./bible/book-44.json"),
  45: () => require("./bible/book-45.json"),
  46: () => require("./bible/book-46.json"),
  47: () => require("./bible/book-47.json"),
  48: () => require("./bible/book-48.json"),
  49: () => require("./bible/book-49.json"),
  50: () => require("./bible/book-50.json"),
  51: () => require("./bible/book-51.json"),
  52: () => require("./bible/book-52.json"),
  53: () => require("./bible/book-53.json"),
  54: () => require("./bible/book-54.json"),
  55: () => require("./bible/book-55.json"),
  56: () => require("./bible/book-56.json"),
  57: () => require("./bible/book-57.json"),
  58: () => require("./bible/book-58.json"),
  59: () => require("./bible/book-59.json"),
  60: () => require("./bible/book-60.json"),
  61: () => require("./bible/book-61.json"),
  62: () => require("./bible/book-62.json"),
  63: () => require("./bible/book-63.json"),
  64: () => require("./bible/book-64.json"),
  65: () => require("./bible/book-65.json"),
  66: () => require("./bible/book-66.json"),
};

export const bibleBooks: BibleBookMeta[] = bibleIndex as BibleBookMeta[];

export function loadBookChapters(bookId: number): string[][] {
  const loader = bookRequires[bookId];
  if (!loader) throw new Error(`Unknown book id ${bookId}`);
  return loader();
}

export function getChapterVerses(bookId: number, chapter: number): string[] {
  const chapters = loadBookChapters(bookId);
  return chapters[chapter - 1] ?? [];
}
