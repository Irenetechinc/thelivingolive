---
name: Lockfile regeneration for EAS / off-Replit builds
description: How to fix package-lock.json when it contains Replit internal registry URLs that block EAS Build and Railway deploys.
---

# Lockfile regeneration for EAS / off-Replit builds

## The rule
Any `package-lock.json` generated inside a Replit environment will have all `"resolved"` URLs pointing to `http://package-firewall.replit.local/npm/...`. EAS Build servers (and Railway) cannot reach this host, so `npm ci` crashes immediately.

## Fix procedure
1. Delete the lockfile: `rm package-lock.json`
2. Regenerate without `--legacy-peer-deps`: `npm install --registry https://registry.npmjs.org`
   - **Do NOT use `--legacy-peer-deps`** — EAS runs `npm ci --include=dev` without it, and the peer-dep resolution differs, causing missing packages (e.g. `react-refresh@0.18.0` absent from lockfile → `npm ci` EUSAGE error).
3. Replace remaining internal URLs: `sed -i 's|http://package-firewall.replit.local/npm/|https://registry.npmjs.org/|g' package-lock.json`
4. Verify: `grep -c 'package-firewall.replit.local' package-lock.json` → must be 0
5. Verify exact EAS command locally: `npm ci --include=dev`
6. Commit and trigger `eas build`.

**Why:** Replit proxies all npm traffic through its internal firewall regardless of `--registry` flag on `npm install`. The resulting lockfile has internal URLs baked in. The `sed` rewrite is safe because package content (and thus integrity hashes) is identical on npmjs.org.

**How to apply:** Any time a lockfile is regenerated inside Replit and the project uses EAS Build or Railway. Check with `grep -c 'package-firewall.replit.local' package-lock.json` before committing.
