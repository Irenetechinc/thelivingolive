// ─── Structured console logger ──────────────────────────────────────────────
// Railway (and any other host) captures whatever a process writes to
// stdout/stderr as its "logs" — there is no separate logging API to wire up.
// This just gives every subsystem a consistent, greppable prefix + timestamp
// so `railway logs` is actually useful instead of a wall of bare strings.
//
// Usage: const log = require/import { logger } from "./logger.js"; then
// logger("api").info("..."), logger("crawler").warn("..."), etc.

const LEVELS = { info: "INFO", warn: "WARN", error: "ERROR" };

function line(level, tag, args) {
  const ts = new Date().toISOString();
  return [`[${ts}] ${LEVELS[level]} [${tag}]`, ...args];
}

export function logger(tag) {
  return {
    info: (...args) => console.log(...line("info", tag, args)),
    warn: (...args) => console.warn(...line("warn", tag, args)),
    error: (...args) => console.error(...line("error", tag, args)),
  };
}
