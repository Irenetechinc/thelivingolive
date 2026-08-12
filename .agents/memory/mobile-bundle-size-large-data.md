---
name: Don't bundle large static data in Expo/RN apps
description: Bundling multi-MB static JSON/data via require() in a React Native app inflates the Metro JS bundle and can break Expo Go tunnel/dev downloads.
---

Metro (React Native's bundler) inlines every module reachable from any `require()`/`import` into a single JS bundle file, even if the `require()` call is inside a function and only executed lazily at runtime — laziness of execution does not mean laziness of bundling. A "lazy-ish loading" pattern built from a static `Record<id, () => require(...)>` map (used to satisfy Metro's requirement that `require()` args be string literals) still pulls every referenced file into the bundle unconditionally.

Symptom hit: bundling a full KJV Bible (~4.2MB of JSON across 66 files) this way produced a ~10MB dev bundle. Over Expo Go's `--tunnel` mode (which proxies through a public ngrok-style tunnel), that download was unreliable and threw `Uncaught Error: java.io.IOException: Failed to download remote update` on Android — the manifest and small requests worked fine (curl confirmed 200s), but the large bundle transfer was what failed in practice.

**Fix:** for any dataset of non-trivial size (roughly single-digit MB or more) that doesn't need to ship inside the app binary, serve it from a backend endpoint instead and fetch on demand from the mobile app, caching results locally (e.g. AsyncStorage) so repeat reads don't re-fetch. Reserve on-device bundling for genuinely small, always-needed data.
