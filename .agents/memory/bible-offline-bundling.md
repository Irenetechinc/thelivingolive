---
name: Bundling Bible text for true offline support
description: Why the Bible module bundles KJV text locally instead of fetching everything from the backend, and how it's wired.
---

Fetching from a backend (even with a local AsyncStorage cache-after-first-load) cannot satisfy a
requirement that a feature works with **zero internet access ever**, including first launch. If the
requirement is genuinely "must work offline," the base dataset has to ship inside the app bundle.

**Why:** A user reported "Bible failed to load" — investigation traced it partly to a stale API URL,
but the deeper issue is that any network-dependent Bible view can never guarantee offline reading,
which was an explicit requirement.

**How to apply:** For a public-domain translation (e.g. KJV) that's small enough (~4MB as JSON), copy
the same per-book JSON files used by the backend into the mobile app and require() them via a static
map (Metro/RN can't resolve dynamic require paths — you need one literal `require()` per file, even
for 66 files). Serve that translation directly from the bundle with no network call at all. Other
translations that must stay server-proxied (e.g. non-public-domain or externally-sourced versions) can
still hit the network, but should fall back to the bundled translation on any fetch failure so the
screen never shows an error when offline — it just silently substitutes the always-available version.
