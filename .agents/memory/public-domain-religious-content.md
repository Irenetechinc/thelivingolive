---
name: Public-domain Bible/hymn content sources
description: Where to source real (non-dummy) public-domain religious text for scripture/hymn apps, and licensing boundaries.
---

- The `bible-kjv` npm package (by m2kdevelopments) ships the complete KJV text as per-book/chapter JSON under `resources/<bookNum>/<chapter>.json`, plus a `books.json` index (66 books, numbered 1-66). Verse text uses inline tags (`<FI>`,`<Fi>`,`<CM>`,`<RF>...<Rf>`) that should be stripped for clean display.
- KJV is public domain and safe to embed in full. NIV, NLT, ESV, and NABRE are copyrighted — displaying their full text requires a paid licensed API (API.Bible, ESV API, or a Catholic-approved source for NABRE). Don't hardcode or scrape their text.
- For hymns, only use hymns published before 1929 (US copyright cutoff) with well-established public-domain lyrics (e.g. Amazing Grace, It Is Well, Blessed Assurance) — avoid anything by a 20th-century-plus author whose copyright may still be active (e.g. "Great Is Thy Faithfulness" is still under copyright).
