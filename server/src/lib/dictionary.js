// ─── Shared Dictionary API ────────────────────────────────────────────────────
// Used by both the verse-explanation engine and the prayer/devotion engine to
// enrich generated language with real definitions and synonyms from the Free
// Dictionary API. Results are cached in-process to avoid redundant calls.

const DICT_CACHE = new Map();

const STOPWORDS = new Set([
  "the","and","for","that","with","this","have","from","your","you","are","was","will",
  "his","her","them","they","been","who","what","when","about","just","like","can",
  "not","but","all","one","him","she","its","also","than","then","into","more","which",
  "their","there","out","has","had","would","could","should","said","shall","upon",
  "unto","thee","thou","thy","hath","doth","saith","mine","thine","yea","wherefore",
]);

export async function lookupWord(word) {
  const w = (word ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (!w || w.length < 3) return null;
  if (DICT_CACHE.has(w)) return DICT_CACHE.get(w);
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`,
      {
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": "TheLivingOliveApp/1.0 (bible-sermon-engine)" },
      }
    );
    if (!res.ok) { DICT_CACHE.set(w, null); return null; }
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) { DICT_CACHE.set(w, null); return null; }
    const entry = data[0];
    const synonyms = (entry.meanings ?? [])
      .flatMap((m) => [...(m.synonyms ?? []), ...(m.definitions ?? []).flatMap((d) => d.synonyms ?? [])])
      .filter((s) => s.length > 3 && !STOPWORDS.has(s.toLowerCase()))
      .slice(0, 6);
    const definitions = (entry.meanings ?? [])
      .flatMap((m) => (m.definitions ?? []).slice(0, 2).map((d) => d.definition))
      .slice(0, 3);
    const result = { word: entry.word ?? w, synonyms, definitions };
    DICT_CACHE.set(w, result);
    return result;
  } catch {
    DICT_CACHE.set(w, null);
    return null;
  }
}

export async function enrichWords(words) {
  const results = await Promise.all(words.slice(0, 5).map(lookupWord));
  return new Map(words.map((w, i) => [w, results[i]]).filter(([, d]) => d));
}
