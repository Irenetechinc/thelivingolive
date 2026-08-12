---
name: Never let raw HTML/error bodies reach the mobile UI
description: Pattern for guaranteeing an Express API never leaks HTML error pages into a mobile app's error messages.
---

A mobile client that does `res.text()` on any non-OK response and renders it directly will show raw
HTML markup to the user whenever the server falls through to a default framework error page — an
unmatched route, an uncaught exception, a proxy/CDN error page in front of the backend.

**Why:** Devotion/prayer generation errors were surfacing as a wall of raw HTML/CSS in the app instead
of a clean message. The individual route handlers already returned clean JSON on expected errors, but
nothing guaranteed *every* path through the server did.

**How to apply:** Two-sided fix, both sides required: (1) on the server, add a catch-all JSON 404
handler and a global JSON error-handling middleware as the very last `app.use()` calls, so literally no
response path can fall through to Express's HTML default; (2) on the client, check
`response.headers.get("content-type")` before parsing — if it isn't `application/json`, show a generic
"couldn't reach the server" message instead of the raw body, and wrap the JSON error message extraction
in a fallback too.
