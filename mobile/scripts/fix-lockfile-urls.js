#!/usr/bin/env node
/**
 * fix-lockfile-urls.js
 *
 * Rewrites all resolved package URLs in package-lock.json AND yarn.lock from
 * Replit's internal package proxy (package-firewall.replit.local) to the
 * public npm registry (registry.npmjs.org).
 *
 * Run automatically via the "postinstall" lifecycle hook so lockfiles are
 * always safe to commit / push to EAS Build after any install inside Replit.
 *
 * Safe on EAS Build and Railway: if no internal URLs are present the file
 * is left untouched (read-only check, no write performed).
 *
 * Integrity hashes are NOT changed — Replit's proxy serves the identical
 * package tarballs as registry.npmjs.org.
 */

const fs   = require('fs');
const path = require('path');

const INTERNAL = 'package-firewall.replit.local/npm/';
const PUBLIC   = 'registry.npmjs.org/';

function fixFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const original = fs.readFileSync(filePath, 'utf8');
  if (!original.includes(INTERNAL)) return; // already clean
  const fixed = original.split(INTERNAL).join(PUBLIC);
  const count = (original.match(new RegExp(INTERNAL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  fs.writeFileSync(filePath, fixed, 'utf8');
  console.log(`[fix-lockfile-urls] ${path.basename(filePath)}: replaced ${count} internal registry URL(s)`);
}

fixFile(path.join(__dirname, '..', 'package-lock.json'));
fixFile(path.join(__dirname, '..', 'yarn.lock'));
