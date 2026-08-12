---
name: Expo background/offline feature limits
description: What "keep working when minimized/closed/offline" can and can't mean in a managed Expo app — surface the gap to the user instead of overpromising.
---

When a user asks for a feature to "keep working even if the app is minimized or fully closed" and to
"work fully offline" (e.g. record + auto-transcribe a sermon), there are two separate, non-negotiable
limits in a managed Expo/React Native app:

1. **Backgrounded vs. killed.** JS code can keep running while the app is backgrounded/minimized if the
   relevant background mode is declared (e.g. iOS `UIBackgroundModes: ["audio"]` for audio recording).
   It cannot run at all once the OS has fully terminated the process — that's an OS-level rule that applies
   to every app on the platform, not something fixable with more Expo config.
2. **Offline recording vs. offline transcription.** Capturing audio/data locally (e.g. via `expo-file-system`)
   works with zero network. Turning that into text via speech-to-text is a different constraint: real
   on-device STT needs a bundled model that's typically hundreds of MB, which directly conflicts with a
   stated "optimize for low-memory devices" requirement elsewhere in the same app.

**Why:** silently shipping a partial version (e.g. transcription that only ever works when online) without
explaining the tradeoff reads as either a bug or an unmet promise to the user.

**How to apply:** implement the achievable version (record fully offline; keep recording through
backgrounding; queue-and-auto-transcribe once online, using `@react-native-community/netinfo` to detect
reconnection) and explicitly tell the user, in plain language, which two things are structurally impossible
(fully-closed-app persistence, fully-offline transcription) and why — don't let them assume it silently works.
