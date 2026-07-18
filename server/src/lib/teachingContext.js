// ─── Shared teaching context store ────────────────────────────────────────────
// Verse-level teaching snippets collected by the web crawler and used by both
// the verse explanation engine and the prayer/devotion engine to enrich
// generated content with real-world theological commentary patterns.

let teachingContextStore = new Map();

export function addTeachingContext(verseRef, snippets) {
  if (!teachingContextStore.has(verseRef)) teachingContextStore.set(verseRef, []);
  const existing = teachingContextStore.get(verseRef);
  for (const s of snippets) {
    if (!existing.includes(s)) existing.push(s);
  }
}

export function getTeachingContext(verseRef) {
  return teachingContextStore.get(verseRef) ?? [];
}

export function loadTeachingContextFromDb(rows) {
  for (const row of rows ?? []) {
    if (!teachingContextStore.has(row.verse_ref)) teachingContextStore.set(row.verse_ref, []);
    const arr = teachingContextStore.get(row.verse_ref);
    for (const s of row.snippets ?? []) {
      if (!arr.includes(s)) arr.push(s);
    }
  }
  return teachingContextStore.size;
}
