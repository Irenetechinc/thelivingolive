---
name: EAS build local tarball upload fails with dotslash EACCES
description: eas build (any version, local packaging step, on a Replit container) fails "Failed to upload the project tarball to EAS Build" with EACCES/rmdir on a .cache/dotslash path.
---

## Symptom

`eas build --platform android ...` (or ios) fails during the local
"Compressing project files" step with:

```
Failed to upload the project tarball to EAS Build
Reason: EACCES: permission denied, rmdir '.../<uuid>-shallow-clone/.cache/dotslash/64/<hash>/React Native DevTools-linux-x64'
```

## Root cause

EAS CLI packages the project by making a throwaway shallow git clone under a
temp dir, then deletes that temp dir when done (`fs-extra.remove()` ->
Node's recursive `fs.rm`). During that step, a DotSlash-cached native binary
("React Native DevTools", pulled in transitively via
`@react-native/debugger-shell`, a dependency of `@react-native/dev-middleware`
used by RN 0.86's community-cli-plugin) gets fetched into a nested
`.cache/dotslash/...` folder inside that temp dir. DotSlash marks its cache
entries read-only (no write bit on the containing hash directory) as
tamper-protection. EAS CLI's cleanup then does a plain recursive delete with
no chmod-before-remove, so it hits the read-only directory and fails.

Confirmed NOT fixable by:
- Exporting `DOTSLASH_CACHE` before running `eas build` — EAS CLI's internal
  subprocess for this step does not inherit it (redirects into the ephemeral
  clone regardless).
- Stubbing/patching the project's own `node_modules/@react-native/debugger-shell/bin/react-native-devtools`
  DotSlash pointer file — the fetch that fails is not going through the
  project's copy of this file at all.
- Upgrading eas-cli (reproduced identically on both the Replit-Nix-provided
  eas-cli 14.7.1 and `npx eas-cli@latest` 20.5.1).

## Fix that works

Force Node's fs removal primitives to chmod a path recursively-writable
before deleting, via a `NODE_OPTIONS="--require <patch>.cjs"` preload that
wraps `fs.rm`/`fs.rmdir`/`fs.rmSync`/`fs.rmdirSync`/`fs.promises.rm`/`fs.promises.rmdir`
to catch EACCES/EPERM, chmod 0o777 recursively, and retry once. This patches
the delete step regardless of what created the read-only subtree.

**Why:** the bug lives inside eas-cli's own (often read-only, e.g.
Nix-store-installed) code, so it can't be edited directly; a Node-level fs
preload patch is the only intervention point that reliably reaches the
actual failing syscall wrapper.

**How to apply:** see `mobile/scripts/patch-fs-permissions.cjs` in this repo
(Living Olive project) for the working implementation, and the `build:*`
npm scripts in `mobile/package.json` for how it's wired via `NODE_OPTIONS`.
Reuse this pattern for any other Expo/EAS project hitting the same error.
