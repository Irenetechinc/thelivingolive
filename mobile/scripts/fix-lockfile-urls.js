#!/usr/bin/env node
/**
 * fix-lockfile-urls.js
 *
 * Rewrites all resolved package URLs in package-lock.json from Replit's
 * internal package proxy (package-firewall.replit.local) to the public
 * npm registry (registry.npmjs.org).
 *
 * Run automatically via the "postinstall" lifecycle hook so the lockfile
 * is always safe to commit after any `npm install` inside Replit.
 *
 * Safe on EAS Build and Railway: if no internal URLs are present the file
 * is left untouched (read-only check, no write performed).
 *
 * Integrity hashes are NOT changed — Replit's proxy serves the identical
 * package tarballs as registry.npmjs.org.
 */

const fs = require('fs');
const path = require('path');

const LOCKFILE = path.join(__dirname, '..', 'package-lock.json');
const INTERNAL = 'http://package-firewall.replit.local/npm/';
const PUBLIC   = 'https://registry.npmjs.org/';

if (!fs.existsSync(LOCKFILE)) process.exit(0);

const original = fs.readFileSync(LOCKFILE, 'utf8');

if (!original.includes(INTERNAL)) {
  // Nothing to do (running on EAS / Railway / CI — already clean)
  process.exit(0);
}

const fixed = original.split(INTERNAL).join(PUBLIC);
const count = (original.match(new RegExp(INTERNAL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

fs.writeFileSync(LOCKFILE, fixed, 'utf8');
console.log(`[fix-lockfile-urls] Replaced ${count} internal registry URL(s) with registry.npmjs.org`);
