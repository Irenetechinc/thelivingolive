---
name: EAS builds don't see Replit workflow env vars
description: EXPO_PUBLIC_* vars exported by a Replit dev workflow are invisible to eas build; real device installs silently ship unconfigured unless registered as EAS env vars.
---

A Replit workflow that does `export EXPO_PUBLIC_SUPABASE_URL="$SUPABASE_URL" && npx expo start
--tunnel` only sets that variable for the interactive dev-tunnel process. `eas build` runs on
Expo's own build servers, which never see Replit's process env — so a static `app.json` (no
`app.config.js` env injection) plus no EAS-side env registration means the built app's
`EXPO_PUBLIC_*` values are `undefined`. The app still builds and installs, but Supabase
auth/queries silently target a placeholder client and any backend API calls with an empty base
URL fail — which reads to an end user as "the app doesn't work" or "crashes" on their real device,
even though the exact same code works fine in the Expo Go dev tunnel.

**Why:** This is a common, easy-to-miss gap because nothing in code or `expo-doctor` flags it —
the dev environment always works, so it looks like a device-specific or native crash when it's
actually a missing build-time config step.

**How to apply:** Before diagnosing a "works in Expo Go, broken/crashes on installed build"
report as a code bug, check whether `EXPO_PUBLIC_*` vars are registered for the EAS build profile
via `eas env:create --environment <development|preview|production> --name ... --value ...`
(verify with `eas env:list --environment ...`). Registering them in EAS, not hardcoding into
`eas.json` or committing a `.env`, is the standard production-safe way to do this.
