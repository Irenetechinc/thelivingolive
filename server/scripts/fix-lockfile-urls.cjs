#!/usr/bin/env node
/**
 * fix-lockfile-urls.js
 *
 * Rewrites all resolved package URLs in package-lock.json from Replit's
 * internal package proxy (package-firewall.replit.local) to the public
 * npm registry (registry.npmjs.org).
 *
 * Safe on Railway and any CI: if no internal URLs are present the file
 * is left untouched. Integrity hashes are NOT changed.
 */

const fs = require('fs');
const path = require('path');

const LOCKFILE = path.join(__dirname, '..', 'package-lock.json');
const INTERNAL = 'http://package-firewall.replit.local/npm/';
const PUBLIC   = 'https://registry.npmjs.org/';

if (!fs.existsSync(LOCKFILE)) process.exit(0);

const original = fs.readFileSync(LOCKFILE, 'utf8');

if (!original.includes(INTERNAL)) {
  process.exit(0);
}

const fixed = original.split(INTERNAL).join(PUBLIC);
const count = (original.match(new RegExp(INTERNAL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

fs.writeFileSync(LOCKFILE, fixed, 'utf8');
console.log(`[fix-lockfile-urls] Replaced ${count} internal registry URL(s) with registry.npmjs.org`);
