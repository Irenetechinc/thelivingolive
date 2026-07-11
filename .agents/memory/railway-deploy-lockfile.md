---
name: Railway deploy needs public-registry lockfile
description: npm ci fails on Railway (and likely other external CI/build hosts) if package-lock.json points at Replit's internal package proxy.
---

Packages installed inside a Replit repl can end up with a `package-lock.json` whose `resolved` URLs point at `http://package-firewall.replit.local/npm/...` — Replit's internal npm registry proxy. That host is unreachable from Railway's (or any other external) build environment.

Symptom: Railway's Railpack build fails on `npm ci` with a generic, unhelpful error like `npm error Exit handler never called!` and `process "npm ci" did not complete successfully: exit code 1` — no mention of the actual DNS/network failure.

Fix: before deploying a Node backend to Railway (or any non-Replit host), regenerate the lockfile against the public registry:
```
rm -rf node_modules package-lock.json
npm install --registry=https://registry.npmjs.org/
```
Then verify with `grep -c package-firewall.replit.local package-lock.json` (should be 0) before committing/pushing.
