# The Living Olive

A mobile app for daily spiritual life: Bible reading with highlights/notes/AI
explanations, a digital hymnbook, and AI-generated devotionals and prayers with
scheduled reminders.

## Architecture

- **`mobile/`** — Expo (React Native + TypeScript) app. This is the actual product;
  it is mobile-only (not a web app), per the original spec. Preview it with the
  Expo Go app on a physical phone (see "Running the app" below).
- **`server/`** — Node/Express API. Proxies OpenAI calls (verse explanations,
  AI-generated devotions & prayers) so the OpenAI key never ships inside the
  mobile bundle. Every route requires a valid Supabase session token. Designed to
  be deployed to Railway in production, per the original spec; runs locally on
  Replit during development.
- **Supabase** — Auth (email OTP / magic link, no passwords) and Postgres
  (highlights, notes, devotion/prayer plans and generated entries — see
  `server/supabase/schema.sql`). Row Level Security scopes every table to its
  owning user.
- **OpenAI** — powers verse explanations, devotional generation, and prayer
  generation (`gpt-4o-mini`, JSON-mode responses).

## Bible text: KJV only, for now

NIV, NLT, ESV, and NABRE are copyrighted and require paid licensed APIs
(e.g. API.Bible, ESV API) to legally display their text. The app ships with the
full King James Version (public domain), bundled locally in
`mobile/src/data/bible/`. Add other versions once you have API credentials for
them — see the follow-up task for this.

## Hymns

`mobile/src/data/hymns.ts` ships ~20 well-known public-domain hymns (pre-1929,
copyright-expired) with real, accurate lyrics. This is a starter set, not the
full historical hymnbook — expanding it is a good follow-up task.

## Notifications

Devotion and prayer reminders use `expo-notifications` local scheduled
notifications (daily/weekly natively; monthly/yearly are approximated with a
one-shot date trigger). This works without any server involvement, but **only
on a physical device** — push/local notification scheduling is unreliable in
Expo Go's simulator paths. Test on your phone via Expo Go.

## Running the app

Two workflows run automatically:

- **Backend API** — Express server on port 5000 (proxied at the repl's public
  dev URL).
- **Mobile (Expo)** — Metro bundler with `--tunnel`, so it's reachable from a
  physical phone over the internet (not just the same LAN as this repl).

To test on your phone:
1. Install **Expo Go** from the App Store / Play Store.
2. Open the "Mobile (Expo)" workflow console and scan the QR code (or open the
   `exp://...exp.direct` link it prints).

## One-time setup still required

1. **Run the database schema.** In your Supabase project's SQL Editor, run
   `server/supabase/schema.sql`. This creates the `highlights`, `notes`,
   `devotion_plans`, `devotion_entries`, `prayer_plans`, and `prayer_entries`
   tables with RLS policies.
2. **Enable email OTP in Supabase.** In Supabase Auth settings, make sure
   "Email" provider is on and password-based sign-in isn't required — the app
   only uses `signInWithOtp` / `verifyOtp` (magic-code, no passwords).
3. Secrets already configured: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`.

## Deploying to Railway (production backend)

The original spec calls for Railway hosting for the backend, separate from
Supabase. When ready: push `server/` to Railway, set the same four
environment variables there, and point `EXPO_PUBLIC_API_URL` (in the mobile
build) at the Railway URL instead of the Replit dev domain.

## User preferences

- Stack: React Native (Expo) mobile app only — no web version — with a Node
  backend intended for Railway, and Supabase for auth/DB, per project spec.
- Bible versions: launch with KJV only; add NIV/NLT/ESV/NABRE later via a
  licensed API (API.Bible or similar) once the user has a license.
- AI provider: OpenAI.
- Testing: user tests on a physical device via Expo Go (Expo Go has some
  limitations vs. a full dev build, per user's note).
