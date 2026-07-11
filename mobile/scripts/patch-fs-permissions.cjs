// Preload patch for `eas build`.
//
// Root cause: EAS CLI packages the project by making a throwaway shallow git
// clone under a temp dir, then deletes that temp dir when done
// (fs-extra's `remove()` -> Node's recursive `fs.rm`). Somewhere during that
// step, a DotSlash-cached native tool artifact ("React Native DevTools",
// pulled in transitively via @react-native/debugger-shell) gets written into
// a nested `.cache/dotslash/...` folder INSIDE that temp dir. DotSlash marks
// its cache entries read-only (no write bit on the containing directory) as
// a tamper-protection measure. When EAS CLI's cleanup then tries to remove
// the whole temp tree, the recursive delete hits that read-only directory
// and fails with EACCES/EPERM on rmdir — permanently failing `eas build`
// with "Failed to upload the project tarball to EAS Build".
//
// This is a filesystem-permission interaction bug between DotSlash's
// immutable cache directories and EAS CLI's plain recursive delete; it isn't
// something fixable from project config (env vars like DOTSLASH_CACHE don't
// propagate into EAS CLI's internal subprocess, and the temp dir's UUID name
// is chosen at runtime so it can't be pre-seeded).
//
// Fix: patch Node's fs removal primitives so that, before removing anything,
// we recursively chmod it writable first. This makes the delete step
// resilient to any read-only subtree, regardless of what created it.
"use strict";

const fs = require("fs");

function chmodTreeSync(target) {
  if (Buffer.isBuffer(target)) {
    target = target.toString();
  } else if (target instanceof URL) {
    target = require("url").fileURLToPath(target);
  }
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch {
    return;
  }
  try {
    fs.chmodSync(target, 0o777);
  } catch {
    // best effort
  }
  if (stat.isDirectory()) {
    let entries = [];
    try {
      entries = fs.readdirSync(target);
    } catch {
      return;
    }
    for (const entry of entries) {
      chmodTreeSync(require("path").join(target, entry));
    }
  }
}

function wrapSync(name) {
  const original = fs[name];
  if (typeof original !== "function") return;
  fs[name] = function patched(targetPath, ...rest) {
    try {
      return original.call(fs, targetPath, ...rest);
    } catch (err) {
      if (err && (err.code === "EACCES" || err.code === "EPERM")) {
        chmodTreeSync(targetPath);
        return original.call(fs, targetPath, ...rest);
      }
      throw err;
    }
  };
}

function wrapAsync(name) {
  const original = fs[name];
  if (typeof original !== "function") return;
  fs[name] = function patched(targetPath, ...rest) {
    const cb = rest[rest.length - 1];
    if (typeof cb !== "function") {
      return original.call(fs, targetPath, ...rest);
    }
    const opts = rest.slice(0, -1);
    original.call(fs, targetPath, ...opts, (err) => {
      if (err && (err.code === "EACCES" || err.code === "EPERM")) {
        chmodTreeSync(targetPath);
        original.call(fs, targetPath, ...opts, cb);
      } else {
        cb(err);
      }
    });
  };
}

wrapSync("rmSync");
wrapSync("rmdirSync");
wrapAsync("rm");
wrapAsync("rmdir");

if (fs.promises) {
  for (const name of ["rm", "rmdir"]) {
    const original = fs.promises[name];
    if (typeof original !== "function") continue;
    fs.promises[name] = async function patched(targetPath, ...rest) {
      try {
        return await original.call(fs.promises, targetPath, ...rest);
      } catch (err) {
        if (err && (err.code === "EACCES" || err.code === "EPERM")) {
          chmodTreeSync(targetPath);
          return await original.call(fs.promises, targetPath, ...rest);
        }
        throw err;
      }
    };
  }
}
