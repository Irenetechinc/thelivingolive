---
name: EAS build — switch npm → Yarn to fix Exit handler crash
description: The npm "Exit handler never called!" crash on EAS remote workers is a recurring upstream npm/Node zlib bug; switching to Yarn Classic avoids it entirely.
---

# EAS build — switch npm → Yarn to fix Exit handler crash

## The rule
When EAS build fails at "Install dependencies" with `npm error Exit handler never called!`, switch the project to **Yarn Classic** (delete `package-lock.json`, generate `yarn.lock` via `yarn install --ignore-engines`, commit both). EAS auto-detects the package manager from the lockfile present.

**Why:** This crash is a recurring upstream Node.js/npm bug (triggered during tar/zlib synchronous I/O during `npm ci`) that reappears across npm and Node versions intermittently. It is NOT caused by project misconfiguration — pinning a different Node version does not reliably fix it. Switching to Yarn sidesteps the entire npm code path responsible for the crash. Yarn 1.22.22 is pre-installed on all EAS Android build images.

**How to apply:**
1. In `mobile/`: `rm package-lock.json && yarn install --ignore-engines`
2. `git add -A && git commit`
3. EAS will now run `yarn install --frozen-lockfile` instead of `npm ci`

## Secondary: node version regression
The `"node"` field in `eas.json` per build profile must be kept — it's easy for collaborators to overwrite it in "update" commits. If the field disappears, EAS reverts to the image's default Node (22.23.1 + npm 10.9.8) which hits the crash even more reliably. Always verify `eas.json` still contains `"node": "24.13.0"` in all three profiles after pulling remote changes.

## Related: robot account + ngrok
If `EXPO_TOKEN` is set to a robot/service account and the Mobile (Expo) workflow uses `--tunnel`, expo-cli will refuse ngrok with "Cannot use ngrok with a robot user." Fix: add `unset EXPO_TOKEN &&` at the start of the workflow command so the robot token is cleared before `npx expo start`.
