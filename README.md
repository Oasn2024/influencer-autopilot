# Influencer Autopilot

Create content once, then schedule and publish it to every social account an
influencer owns: Facebook, Instagram, WhatsApp, X, Pinterest, Threads,
YouTube, TikTok and LinkedIn.

This repository is the foundation: sign-in, the database schema, and
encrypted storage for connected-account credentials. Platform integrations,
scheduling and AI content generation build on top of it.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS)
- **Clerk** for sign-up / sign-in (`src/proxy.ts` protects `/dashboard` and `/api`)
- **Postgres + Drizzle ORM** (`src/db/schema.ts`, migrations in `drizzle/`)
- **Vitest** for tests, GitHub Actions for CI
- Deploys to **Vercel** with no extra configuration

## How credentials are protected

Every OAuth access and refresh token is encrypted before it reaches the
database (`src/lib/crypto/tokens.ts`):

- **AES-256-GCM** authenticated encryption, with a fresh random IV per value.
  Any tampering with stored ciphertext makes decryption fail.
- **Bound to its row.** Each ciphertext is tied to the user id, platform,
  account id and field (access or refresh). A token copied into another
  user's row, or swapped between columns, will not decrypt.
- **Never sent to the browser.** Queries for the UI and API select only
  non-secret columns. Tokens are decrypted server-side, only by
  `getAccountTokens(userId, accountId)`, which is scoped to the owner.
- **Rotatable keys.** Ciphertexts record which key encrypted them. To rotate:
  1. Generate a key: `openssl rand -base64 32`
  2. Append it: `TOKEN_ENCRYPTION_KEYS=v1:OLD,v2:NEW` and set `TOKEN_ENCRYPTION_CURRENT_KEY_ID=v2`
  3. Run `npm run tokens:rotate` until it reports 0 re-encrypted, then remove `v1`.

Keep the encryption keys only in your host's secret store (Vercel
environment variables), separate from the database. Someone holding a copy
of the database alone cannot read any token.

## Data model

| Table | Purpose |
| --- | --- |
| `users` | One row per Clerk user, created on first sign-in |
| `connected_accounts` | A linked social account with encrypted tokens, scopes and expiry |
| `posts` | Content written once (text, media, optional AI generation info, schedule) |
| `post_targets` | One row per post × account, so each platform succeeds or fails on its own (attempts, next retry, link to the live post) |
| `autopilot_settings` | Per-user weekly posting times, time zone, accounts, brand voice, topics, approval mode |
| `activity_events` | Monitoring log of everything the publisher and autopilot did |
| `api_keys` | Personal developer API keys (only a SHA-256 hash is stored) |

## How autopilot works

A Vercel Cron job calls `/api/cron/run` every 5 minutes (secured with `CRON_SECRET`). Each run:

1. **Publishes what's due.** Due `post_targets` are claimed with `FOR UPDATE SKIP LOCKED`, so overlapping runs never double-post. Each target refreshes its token if it's about to expire, checks the platform's limits, then publishes. Rate limits and outages retry with backoff (1, 4, 16, 64 min); an expired token marks the account *expired* and shows a Reconnect button.
2. **Fills empty slots.** For every user with autopilot on, AI drafts posts for free posting times in the next N days (3 per run), rotating through their topics in their brand voice, with a tailored version per platform. Drafts wait for approval unless the user turns approval off.

Supported publishing today: X, LinkedIn, Threads, Facebook Pages and Instagram business accounts. X and LinkedIn post text (media links are appended); Instagram needs an image or video, so autopilot skips it and posts to it happen from Compose.

## Developer API

Create a key under **Dashboard → API**, then send `Authorization: Bearer iap_…`.

| Method | Path | |
| --- | --- | --- |
| GET | `/api/v1/accounts` | Connected accounts |
| GET | `/api/v1/posts?status=scheduled,failed&limit=50` | Posts with per-account results |
| POST | `/api/v1/posts` | `{ body, media_urls?, account_ids, overrides?, scheduled_at?, draft? }` |
| GET | `/api/v1/posts/{id}` | One post |
| POST | `/api/v1/posts/{id}/publish` | Publish now |
| DELETE | `/api/v1/posts/{id}` | Cancel |
| POST | `/api/v1/drafts` | `{ topic, platforms, notes? }` → AI text per platform |

## Platform app setup

Each platform needs a developer app; put its keys in the env vars listed in `.env.example` and register this redirect URI:
`https://<your app>/api/connect/<provider>/callback` with provider `x`, `linkedin`, `threads` or `meta`.
The Accounts page shows "Needs app keys" until a platform's keys are set.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Clerk keys, DATABASE_URL and an encryption key
npm run db:migrate
npm run dev
```

Open http://localhost:3000, sign up, and you will land on `/dashboard`.

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm test` | Run unit tests |
| `npm run lint` / `npm run typecheck` | Static checks |
| `npm run db:generate` | Create a migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` (also runs automatically on every Vercel deploy) |
| `npm run tokens:rotate` | Re-encrypt stored tokens under the current key |

## Adding a platform

`src/lib/platforms/index.ts` lists every platform with its limits and
developer portal. To add an integration: add an OAuth provider in
`src/lib/oauth/providers.ts`, a publisher in `src/lib/publishers/`, register it
in `src/lib/publishers/index.ts`, then set `available: true`.

## Roadmap

1. More platforms: YouTube, TikTok, Pinterest, WhatsApp
2. Native media upload for X and LinkedIn, and a media library
3. Engagement metrics (likes, reach) pulled back into Monitor
4. Mobile app on the same developer API
