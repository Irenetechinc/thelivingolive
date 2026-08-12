#!/usr/bin/env node
/**
 * check-lockfiles.cjs
 *
 * Scans every package-lock.json in the repo for Replit's internal registry
 * hostname (package-firewall.replit.local). If any are found the script
 * prints the offending files and exits with code 1.
 *
 * Run directly:          node scripts/check-lockfiles.cjs
 * Pre-commit hook:       same command (see scripts/pre-commit-hook.sh)
 * Railway pre-build:     added to server/nixpacks.toml [phases.build]
 */

const fs   = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '..');
const BAD_URL = 'package-firewall.replit.local';

// Every lockfile we care about, relative to the repo root.
const LOCKFILES = [
  'server/package-lock.json',
  'mobile/package-lock.json',
];

let failed = false;

for (const rel of LOCKFILES) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) continue;          // skip if not present

  const content = fs.readFileSync(abs, 'utf8');
  if (!content.includes(BAD_URL)) continue;   // clean — skip

  // Count occurrences for a useful error message.
  const count = (content.match(new RegExp(BAD_URL.replace(/\./g, '\\.'), 'g')) || []).length;

  console.error(
    `\n❌  LOCKFILE CONTAMINATED: ${rel}\n` +
    `   Found ${count} reference(s) to "${BAD_URL}".\n` +
    `   This will break Railway and EAS builds.\n\n` +
    `   Fix:\n` +
    `     cd ${path.dirname(rel)} && npm run fix-lockfile\n` +
    `   Then stage the cleaned lockfile and retry.\n`
  );
  failed = true;
}

if (failed) {
  console.error(
    '💡  Tip: the postinstall hook fixes URLs automatically after every\n' +
    '   "npm install". If you skipped install, run fix-lockfile manually.\n'
  );
  process.exit(1);
}

console.log('✅  Lockfiles clean — no Replit-internal registry URLs found.');
