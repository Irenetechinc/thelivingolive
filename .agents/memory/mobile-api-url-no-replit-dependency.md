---
name: Mobile app API base URL should never depend on Replit
description: Why the API base URL is hardcoded as an in-code fallback rather than only set via workflow env var.
---

If a mobile app's backend URL is only ever supplied via a Replit workflow's exported env var (or an
EAS-registered env var per build profile), any build or environment that misses that step silently
points at nothing (or worse, a now-expired ephemeral Replit dev tunnel URL) and every API call fails
with a confusing error.

**Why:** The user's production backend already runs on a stable custom domain outside Replit
(Railway, behind their own domain). Relying on an environment variable as the *only* source of the API
URL reintroduced a hidden Replit dependency (the ephemeral `*.replit.dev` tunnel URL previously baked
into the workflow command) that broke as soon as that repl's dev URL rotated.

**How to apply:** When a project has a real, stable production backend domain, hardcode it as the
in-code fallback (`const API_URL = process.env.EXPO_PUBLIC_API_URL || PRODUCTION_URL`) so every build —
dev tunnel, EAS preview, EAS production — works correctly even if the env var is never set. Reserve the
env var purely as a way to override for local backend development.
