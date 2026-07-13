# The Living Olive

A mobile app for daily spiritual life: Bible reading with highlights/notes/AI explanations, a digital hymnbook (55 hymns), and AI-generated devotionals and prayers with scheduled reminders.

## Architecture

- **`mobile/`** — Expo (React Native + TypeScript) app. Mobile-only (not a web app). Preview with Expo Go on a physical phone.
- **`server/`** — Node/Express API on port 5000. Proxies OpenAI calls and serves Bible text. Designed for Railway in production.
- **Supabase** — Auth (email OTP / magic link, no passwords) and Postgres. Row Level Security scopes every table to its owning user. Schema: `server/supabase/schema.sql`.
- **OpenAI** — `gpt-4o-mini` for verse explanations, devotional generation, and prayer generation.

## Features implemented

### Bible Module
- KJV served from the local server (fast, cached per chapter)
- **WEB** (World English Bible) and **ASV** (American Standard Version) via bible-api.com proxy — selectable from the Bible home screen
- Verse highlighting (persisted to Supabase)
- Verse and chapter notes (persisted to Supabase)
- AI verse explanation with supporting scriptures
- Version badge shown in the reader; graceful fallback to KJV if external API is down

### Hymns Module
- **55 public-domain hymns** (all pre-1929, copyright expired) with full, accurate lyrics
- Searchable by title, author, or lyric content

### Devotions Module
- User sets spiritual goal + duration (daily/weekly/monthly/yearly) + preferred time
- AI generates a full devotional with scripture reference and closing prayer
- Saved to Supabase for history
- Local reminder scheduled at preferred time (daily/weekly natively; monthly/yearly via date trigger)
- **Server also sends a push notification** immediately when a new devotional is generated

### Prayer Module
- User sets heart desires, prayer point count, prayer type (Warfare/Adoration/Intercession/Thanksgiving/Petition) + preferred time
- AI generates Bible-rooted prayer points with scripture references
- Saved to Supabase for history
- Local reminder scheduled at preferred time
- **Server also sends a push notification** immediately when new prayer points are generated

### Server-driven push notifications
- Mobile registers an Expo push token with the server on every login (stored in `push_tokens` table)
- Server endpoint `POST /api/push/register` — stores token
- Server endpoint `POST /api/push/notify-scheduled` — checks active devotion/prayer plans by preferred time and sends push notifications. Call this from a cron service (e.g. cron-job.org) every minute. Protect with `CRON_SECRET` env var + `X-Cron-Secret` header.
- On devotion/prayer generation, a push is also sent immediately to confirm delivery

### Authentication
- Email-only (OTP/magic-link), no passwords

## Required secrets

| Secret | Used by | Purpose |
|--------|---------|---------|
| `SUPABASE_URL` | server + mobile | Supabase project URL |
| `SUPABASE_ANON_KEY` | mobile | Auth from the app |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Auth verification + push token storage |
| `OPENAI_API_KEY` | server | AI features |
| `EXPO_ACCESS_TOKEN` | server (optional) | Expo push service access token |
| `CRON_SECRET` | server (optional) | Protect the scheduled-notify endpoint |

## One-time setup

1. **Run the schema** in Supabase SQL Editor: `server/supabase/schema.sql`
2. **Enable Email OTP** in Supabase Auth settings (magic-link, no password)
3. Set the four required secrets above

## Running in development

Two workflows start automatically:
- **Backend API** — Express on port 5000
- **Mobile (Expo)** — Metro + ngrok tunnel (scan QR with Expo Go on your phone)

The Expo workflow uses a hard-coded `EXPO_PUBLIC_API_URL` pointing at this repl's backend. If the repl URL changes, update the workflow command.

## Regenerating the lockfile inside Replit

Replit routes all npm traffic through an internal package proxy (`package-firewall.replit.local`). If you run `npm install` inside Replit, the generated `package-lock.json` will contain that internal hostname, which EAS Build and Railway cannot reach.

**The fix runs automatically** via the `postinstall` hook — after any `npm install` inside `mobile/` or `server/`, the script rewrites all internal URLs to `registry.npmjs.org` before you commit.

If you ever need to run it manually:
```sh
cd mobile && npm run fix-lockfile
cd server && npm run fix-lockfile
```

A pre-commit git hook will also block any commit that still contains `package-firewall.replit.local` in a lockfile.

**Important:** always regenerate lockfiles with plain `npm install` (no `--legacy-peer-deps`). EAS runs `npm ci --include=dev` without that flag, and using `--legacy-peer-deps` can produce a lockfile that is out of sync (missing packages like `react-refresh@0.18.0`).

## Building an APK/IPA with EAS

`npm run build:preview` / `build:dev` / `build:prod` / `build:ios` (in `mobile/`) wrap `eas build`.
They also neutralize a container-specific bug: EAS CLI's local packaging step can fail with
`Failed to upload the project tarball to EAS Build ... EACCES ... .cache/dotslash/...` because a
DotSlash-cached native binary gets fetched (as a side effect of RN's dev tooling) into a read-only
cache folder inside EAS's temp clone dir, which EAS's own cleanup can't delete. The `prebuild:*`
scripts and a `NODE_OPTIONS`-injected fs patch (`mobile/scripts/patch-fs-permissions.cjs`) work
around this by chmod'ing any read-only path before deletion. Always build via these npm scripts,
not by calling `eas build` directly, so the workaround is applied.

## EAS builds need their own env vars (separate from the Replit workflow)

The Replit "Mobile (Expo)" workflow exports `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
and `EXPO_PUBLIC_API_URL` for the **dev tunnel only**. Those shell exports do not exist on EAS's build
servers, so a real device install (`eas build`) will silently ship with an unconfigured Supabase client
and an empty API URL — auth, Bible sync, AI features, and push all fail on the installed app even though
the same code works fine in Expo Go here. This is a common cause of "the app crashes/doesn't work on my
phone" reports that don't reproduce in the dev tunnel.

Before running any `eas build` (dev, preview, or production), register these as EAS-hosted environment
variables so the build servers can inline them:

```sh
cd mobile
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value "<your Supabase URL>" --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<your Supabase anon key>" --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_API_URL --value "<your Railway backend URL>" --visibility plaintext
```

Repeat for `--environment development` and `--environment preview` if you build those profiles (the
preview/dev API URL can point at this repl's dev domain; production should point at Railway). Confirm
with `eas env:list --environment production` before building.

## Deploying backend to Railway

1. In Railway → **Settings → Source**, set **Root Directory** to `server`
2. Add env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, optionally `EXPO_ACCESS_TOKEN` and `CRON_SECRET`
3. Railway will detect `server/package.json` and use `npm start` (`node src/index.js`)
4. Set `EXPO_PUBLIC_API_URL` in the Expo workflow and any production build to the Railway URL

## Bible versions

- **KJV** — served from local JSON data in `server/src/data/bible/` (fast, no external dependency)
- **WEB** / **ASV** — proxied from bible-api.com (free, public domain, no API key needed)
- NIV, NLT, ESV, NABRE are copyrighted and require a paid license (e.g. API.Bible)

## User preferences

- Stack: React Native (Expo) mobile-only; Node backend for Railway; Supabase for auth/DB
- No web version
- AI provider: OpenAI
- No dummy data or demo implementations
