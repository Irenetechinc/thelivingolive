#!/usr/bin/env node
/**
 * install-hooks.cjs
 *
 * Installs the pre-commit hook from scripts/pre-commit-hook.sh into
 * .git/hooks/pre-commit. Safe to run multiple times — it always replaces
 * the existing hook with the current version.
 *
 * Called automatically by the postinstall scripts in server/package.json
 * and mobile/package.json so the hook stays up to date after every
 * "npm install".
 *
 * Run manually:   node scripts/install-hooks.cjs
 */

const fs   = require('fs');
const path = require('path');

const ROOT   = path.resolve(__dirname, '..');
const SRC    = path.join(ROOT, 'scripts', 'pre-commit-hook.sh');
const GIT    = path.join(ROOT, '.git');
const TARGET = path.join(GIT, 'hooks', 'pre-commit');

// Only install when inside an actual git repo; skip in CI/Railway where
// there is no .git directory.
if (!fs.existsSync(GIT)) {
  console.log('[install-hooks] No .git directory found — skipping hook install (CI/Railway environment).');
  process.exit(0);
}

const hooksDir = path.join(GIT, 'hooks');
if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });

fs.copyFileSync(SRC, TARGET);
fs.chmodSync(TARGET, 0o755);

console.log('[install-hooks] ✅  pre-commit hook installed at .git/hooks/pre-commit');
