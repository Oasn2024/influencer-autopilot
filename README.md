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

A GitHub Actions schedule (`.github/workflows/autopilot-cron.yml`) calls `/api/cron/run` every 5 minutes, secured with `CRON_SECRET`; Vercel's Hobby plan only allows a daily cron, which stays in `vercel.json` as a backstop. On Vercel Pro you can move the 5-minute schedule into `vercel.json` instead. Each run:

1. **Publishes what's due.** Due `post_targets` are claimed with `FOR UPDATE SKIP LOCKED`, so overlapping runs never double-post. Each target refreshes its token if it's about to expire, checks the platform's limits, then publishes. Rate limits and outages retry with backoff (1, 4, 16, 64 min); an expired token marks the account *expired* and shows a Reconnect button.
2. **Fills empty slots.** For every user with autopilot on, AI drafts posts for free posting times in the next N days (3 per run), rotating through their topics in their brand voice, with a tailored version per platform. Drafts wait for approval unless the user turns approval off.

Supported publishing today: X, LinkedIn, Threads, Facebook Pages and Instagram business accounts. X and LinkedIn post text (media links are appended); Instagram needs an image or video, so autopilot skips it and posts to it happen from Compose.

## Media uploads

With a Vercel Blob store connected, creators upload photos and videos straight from their device ("Upload from device" in the composer). The browser uploads directly to Blob with a short-lived token from `/api/uploads`, limited to the signed-in user's own folder, image/video types and 200 MB. On X, images (up to 4, 5 MB each) are uploaded natively so they show as photos. Videos, and images X won't take, are added as links. This needs the `media.write` scope, so older X connections should reconnect once.

## AI Studio

The composer has an AI Studio built on the Vercel AI Gateway, so one setup covers every vendor:

- **Write**: pick Claude, GPT or Gemini, a goal and a tone, and get up to 3 options with different angles. Each has a hook, hashtags, an image idea and a version for each selected platform.
- **Repurpose**: paste a blog post, transcript or newsletter and get platform-ready posts from its best idea.
- **Image**: GPT Image or FLUX generate an image in feed, portrait, story or wide shape. It's saved to Vercel Blob and added to the post's media.
- **Engagement check**: a live score with plain tips (hook, call to action, length and hashtags per platform, media, links on Instagram). It's a heuristic, not a prediction.
- **Suggested times**: common peak hours per platform, shown in the composer and offered as one-click autopilot slots.

Only models in `src/lib/ai/models.ts` can be used. Each user gets 60 AI writes and 20 AI images per rolling 24 hours (`DAILY_LIMITS` in `src/lib/ai/studio.ts`), so a leaked API key can't run up the AI bill.

## Analytics

Every cron run reads engagement back for posts published in the last 30 days: every 3 hours while a post is under 2 days old, then daily (`src/lib/analytics`). The Analytics page shows totals, a per-platform breakdown, top posts, and **your best times**. Each post is compared with the typical post on the same account, so a big audience on one platform doesn't drown out the others. Once there are 8+ posts with stats, one click copies the best times into autopilot.

| Platform | What's read | Permission |
| --- | --- | --- |
| X | likes, replies, reposts + quotes, impressions | `tweet.read` (needs an X API plan that allows reads) |
| Threads | views, likes, replies, reposts + quotes | `threads_manage_insights` |
| Facebook Page | reactions, comments, shares | `pages_read_engagement` |
| Instagram | likes, comments (+ views, shares with insights) | `instagram_basic`, `instagram_manage_insights` |
| LinkedIn | not available: LinkedIn restricts reading member post stats to approved partners | |

Accounts connected before this release need reconnecting once for the new Threads and Instagram insights permissions. A failed stats read never disconnects an account; it keeps the last numbers and shows the reason on the Analytics page.

## Developer API

Create a key under **Dashboard → API**, then send `Authorization: Bearer iap_…`.

| Method | Path | |
| --- | --- | --- |
| GET | `/api/v1/accounts` | Connected accounts |
| GET | `/api/v1/posts?status=scheduled,failed&limit=50` | Posts with per-account results |
| GET | `/api/v1/autopilot` | Open posting times, target accounts, brand voice and topics (for your own agent) |
| POST | `/api/v1/posts` | `{ body, media_urls?, account_ids, overrides?, scheduled_at?, draft?, require_approval? }` |
| GET | `/api/v1/posts/{id}` | One post |
| POST | `/api/v1/posts/{id}/approve` | `{ scheduled_at? }`: put a draft or pending post on the schedule |
| POST | `/api/v1/posts/{id}/publish` | Publish now |
| DELETE | `/api/v1/posts/{id}` | Cancel |
| POST | `/api/v1/drafts` | `{ topic, platforms, notes?, model?, tone?, goal?, count? (1-3), source_text? }` → `data` (first option) and `options` |
| POST | `/api/v1/images` | `{ prompt, aspect? ("1:1", "4:5", "9:16", "16:9"), model? }` → `{ url, model }` (needs a Blob store) |

An OpenAPI 3.1 description is public at `/api/v1/openapi.json` (import it into ChatGPT GPT Actions, n8n, Make or Postman).

## Bring your own AI agent

Creators who already use an AI agent can let it run their content instead of (or alongside) the app's own AI.
Setup steps for each tool are on **Dashboard → AI agents**.

- **MCP server** at `/api/mcp` (Streamable HTTP, stateless, JSON responses; protocol 2024-11-05 through 2025-11-25).
  Auth is an `iap_` API key in `Authorization: Bearer`. Requests carrying an `Origin` other than the app's own are refused.
  Tools live in `src/lib/agent/tools.ts`: `get_autopilot_brief`, `list_accounts`, `list_posts`, `get_post`, `create_post`,
  `approve_post`, `publish_post_now`, `cancel_post`, `get_post_stats`, `write_with_app_ai`. Posts made by an agent have source `agent`,
  and by default follow the creator's "approve each post" setting.
- **Agent mode for autopilot** (`autopilot_settings.writer = 'agent'`): the cron run skips AI writing, works out the open slots,
  and sends an `autopilot.slots_open` webhook when they change (or every 12 hours at most). The agent fills them with `create_post`.
- **Webhooks** (`webhooks` table, up to 5 per user): signed JSON POSTs for `autopilot.slots_open`, `post.pending_approval`,
  `post.published`, `post.partial`, `post.failed` and `account.expired`. Header `X-IAP-Signature: t=<unix>,v1=<hex>` is
  HMAC-SHA256 of `"<t>.<body>"` with the webhook's secret (shown once, stored encrypted). Only public `https` URLs are allowed;
  host names are resolved and private addresses refused, redirects aren't followed, and a webhook switches off after 25 failures in a row.

## Platform app setup

Each platform needs a developer app; put its keys in the env vars listed in `.env.example` and register this redirect URI:
`https://<your app>/api/connect/<provider>/callback` with provider `x`, `linkedin`, `threads`, `meta`, `youtube` or `tiktok`.
The Accounts page shows "Needs app keys" until a platform's keys are set.

YouTube and TikTok take exactly one video per post (.mp4/.mov, up to `MAX_VIDEO_MB`, default 200). The publisher downloads it
(public https hosts only, re-checked on every redirect) and uploads it: a resumable upload for YouTube (the title is the post's first line),
and chunked `FILE_UPLOAD` Direct Post for TikTok. Unaudited apps on both platforms can only post privately; TikTok falls back to
`SELF_ONLY` automatically. A YouTube upload costs 1,600 of the default 10,000 daily quota units, so about 6 uploads a day until Google raises it.

Meta (Facebook + Instagram): in the app's Facebook Login settings turn on **Client OAuth login** and **Web OAuth login** and add the
callback under **Valid OAuth Redirect URIs**. Apps created with "Facebook Login for Business" can set `META_CONFIG_ID` to a login
configuration id; the app then sends `config_id` instead of a scope list.

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
