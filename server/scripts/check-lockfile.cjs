#!/usr/bin/env node
/**
 * check-lockfile.cjs  (server-scoped version)
 *
 * Runs inside Railway's build phase (root dir = server/) to confirm that
 * package-lock.json was NOT committed with Replit's internal registry URLs.
 * If contaminated, the build fails immediately with a clear error message.
 *
 * The repo-root version at scripts/check-lockfiles.cjs covers BOTH lockfiles
 * and is used by the git pre-commit hook. This file is a focused copy for
 * Railway — it only needs to check the one lockfile it can see.
 */

const fs   = require('fs');
const path = require('path');

const LOCKFILE = path.join(__dirname, '..', 'package-lock.json');
const BAD_URL  = 'package-firewall.replit.local';

if (!fs.existsSync(LOCKFILE)) {
  console.log('[check-lockfile] package-lock.json not found — skipping check.');
  process.exit(0);
}

const content = fs.readFileSync(LOCKFILE, 'utf8');
if (!content.includes(BAD_URL)) {
  console.log('✅  server/package-lock.json is clean — no Replit-internal registry URLs.');
  process.exit(0);
}

const count = (content.match(new RegExp(BAD_URL.replace(/\./g, '\\.'), 'g')) || []).length;
console.error(
  `\n❌  LOCKFILE CONTAMINATED: server/package-lock.json\n` +
  `   Found ${count} reference(s) to "${BAD_URL}".\n` +
  `   This file was committed from Replit without running the fix script.\n\n` +
  `   Fix (run locally inside the repo):\n` +
  `     cd server && npm run fix-lockfile\n` +
  `   Then commit the cleaned lockfile and redeploy.\n`
);
process.exit(1);
