---
name: No Supabase/OpenAI Replit connectors
description: searchIntegrations has no connector/connection for Supabase or OpenAI as of mid-2026 — request secrets directly.
---

`searchIntegrations({ query: "supabase" })` and `searchIntegrations({ query: "openai" })` both return empty lists — there is no first-party connector/connection for either. Skip hunting for one and go straight to `requestSecrets` (e.g. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`). Re-check with searchIntegrations occasionally in case this changes later.
