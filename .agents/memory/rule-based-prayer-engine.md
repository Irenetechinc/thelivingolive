---
name: Rule-based (non-LLM) prayer/devotion engine scoping
description: What "self-evolving, no LLM/GPU" was scoped down to for The Living Olive, and why.
---

When a user asks for a "fully autonomous, self-evolving, non-LLM" content-generation
agent (e.g. prayer/devotional generation from scripture), a full implementation
implies infrastructure (web-crawling, headless browsers, vector search, genetic
algorithms) that doesn't fit safely in a single always-on web dyno (e.g. Railway's
cheapest tier).

**Decision:** scope it to a real, working, but simpler feedback loop instead of
faking the heavier claims:
- keyword-based category classification (scored, not ML)
- a curated scripture bank matched by keyword overlap + a learned per-item weight
- weight nudged by explicit user feedback (star ratings), applied in real time
- a lightweight scheduled job (in-process cron, not a separate worker) that
  promotes new keywords from highly-rated free-text input into the classifier

**Why:** this is honest about what "self-evolving" can mean without external
infra, keeps everything running in the same process as the main API (no new
deployable), and avoids building something that looks sophisticated but is
actually inert/fake. State the scoping tradeoff explicitly to the user rather
than silently under-delivering on "genetic algorithm" / "web crawling" language
in the original ask.

**How to apply:** if asked to extend this further (e.g. add real web-sourced
content augmentation), that should be a separate worker service, not bolted
onto the existing web process — flag that as a scope/infra decision needing
user sign-off before building it.
