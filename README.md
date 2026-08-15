# SendToWP

A WhatsApp message scheduler built with React, Material UI, Express, Baileys, and node-cron.
Sign in, pair your WhatsApp account once, then send messages immediately or schedule them
(optionally repeating daily, weekly, or monthly).

**One codebase, any host.** The server detects its environment and adapts — SQLite on a disk or
Postgres in the cloud, a file-based WhatsApp session or a database-backed one, an in-process cron
or an external trigger. Nothing needs editing to move between them.

## Features

- **Accounts** — email + password sign-up and sign-in, bcrypt-hashed passwords, JWT sessions.
- **Per-account data** — every scheduled message belongs to the account that created it.
- **Send now or schedule** — one-off or repeating (Daily / Weekly / Monthly).
- **Reliable delivery** — due messages are picked up every minute, retried with exponential
  backoff, and recovered after a restart.
- **Portable storage** — SQLite or Postgres, chosen automatically.
- **Installable** — the client is a PWA; add it to your phone's home screen.

## Getting started

```bash
npm install
cp .env.example server/.env     # Windows: copy .env.example server\.env
npm run dev
```

Then open http://localhost:5173, create an account, go to **Settings**, and scan the QR code
with WhatsApp (**Linked devices → Link a device**).

Set `JWT_SECRET` in `server/.env` first — without it the server generates a throwaway secret and
signs everyone out on every restart. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API (port 3000) + Vite dev server (port 5173) |
| `npm run build` | Builds the client into `client/dist` |
| `npm start` | Runs the API only; also serves `client/dist` when present |
| `npm test` | Auth-store round-trip + full API suite |
| `npm run test:api` | End-to-end API suite (uses throwaway storage) |
| `npm run test:authstore` | WhatsApp session serialisation test |

`npm run test:api` honours `DATABASE_URL`, so the same suite validates both backends:

```bash
npm run test:api                                        # SQLite
DATABASE_URL=postgres://... PGSSL=disable npm run test:api   # Postgres
```

## How it adapts

Nothing below is configured by hand unless you want to override it.

| | Detected when | Effect |
| --- | --- | --- |
| **SQLite** | `DATABASE_URL` unset | Data in a local file |
| **Postgres** | `DATABASE_URL` set | Data in a hosted database |
| **Persistent mode** | Anywhere with a normal process | Socket stays open, cron runs every minute |
| **Serverless mode** | `VERCEL` / `AWS_LAMBDA_FUNCTION_NAME` set | Connects on demand, sending driven by `POST /api/cron/run` |
| **File session** | Persistent mode | WhatsApp session in `whatsapp-auth/` |
| **Database session** | Serverless mode | WhatsApp session in the `WhatsAppAuth` table |

All SQL is written once with `?` placeholders and quoted `"PascalCase"` identifiers, which both
dialects accept; the Postgres driver rewrites placeholders to `$n` on the way through.

## Deploying

See **[DEPLOY.md](DEPLOY.md)**.

| Host | Works | Notes |
| --- | --- | --- |
| **VPS / Docker / GCP** | Full | One command: `scripts/gcp-bootstrap.sh`. Recommended. |
| **Render, Railway, Fly** | Full | Needs `DATABASE_URL`. On Render's free tier also needs an external pinger to prevent spin-down. |
| **Vercel** | **Degraded** | Needs `DATABASE_URL` + `CRON_SECRET`. See below. |

### About Vercel

The app runs there, but a serverless platform cannot hold a WhatsApp socket open, so sending is
driven by Vercel Cron hitting `/api/cron/run`. **Vercel Hobby limits cron to once per day**
(±59 min), so scheduled messages are only checked daily. Pro allows once per minute, which
restores normal behaviour.

Pair WhatsApp **before** deploying, from any persistent environment pointed at the same
`DATABASE_URL` — the session is stored in the database, so it travels with it:

```bash
DATABASE_URL=postgres://... AUTH_STORE=database npm start
# scan the QR at http://localhost:3000, then deploy
```

## Configuration

Everything lives in `server/.env`; see [.env.example](.env.example) for the full list.

| Variable | Default | Notes |
| --- | --- | --- |
| `JWT_SECRET` | *(generated in dev)* | Required in production, minimum 32 characters |
| `JWT_EXPIRES_IN` | `7d` | How long a sign-in lasts |
| `ALLOW_REGISTRATION` | `true` | Set to `false` to close sign-ups; the first account is always allowed |
| `DATABASE_URL` | *(unset)* | Set to use Postgres instead of SQLite |
| `DB_PATH` | `./database/sendtowp.db` | SQLite only; must be on persistent storage |
| `AUTH_STORE` | auto | `file` or `database` |
| `WHATSAPP_AUTH_PATH` | `server/whatsapp-auth` | File session location; losing it means re-pairing |
| `CRON_SECRET` | *(unset)* | Required to use `POST /api/cron/run` |
| `CLIENT_ORIGIN` | *(any)* | Comma-separated browser origins allowed to call the API |
| `RETRY_LIMIT` | `3` | Send attempts before a message stays `Failed` |
| `TRUST_PROXY` | auto | Set to `1` behind nginx / Cloudflare so rate limiting sees real IPs |

## API

All endpoints are under `/api`. Everything except the health check, `/api/auth/*`, and
`/api/cron/*` requires an `Authorization: Bearer <token>` header.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness check; reports the active mode and storage |
| `POST` | `/api/auth/register` | Create an account, returns a token |
| `POST` | `/api/auth/login` | Sign in, returns a token |
| `GET` | `/api/auth/me` | Current account |
| `GET` | `/api/auth/config` | Whether sign-ups are open |
| `POST` | `/api/messages/send` | Send a message immediately |
| `POST` | `/api/messages/schedule` | Schedule a message |
| `GET` | `/api/messages/scheduled` | List your messages (`?status=`, `?search=`) |
| `GET` | `/api/messages/stats` | Counts by status |
| `PUT` | `/api/messages/:id` | Update a scheduled message |
| `DELETE` | `/api/messages/:id` | Delete a scheduled message |
| `GET` | `/api/whatsapp/status` | Connection status |
| `GET` | `/api/whatsapp/qr` | Current pairing QR (data URL) |
| `POST` | `/api/whatsapp/reconnect` | Reconnect, or reset the session and re-pair |
| `POST` | `/api/cron/run` | Send everything due. Auth: `Bearer $CRON_SECRET` or `?secret=` |

## Install as a phone app

Open the deployed site over HTTPS and use **Install app** (Android/Chrome) or
**Share → Add to Home Screen** (iOS/Safari). It launches fullscreen with its own icon.

## Notes

- The WhatsApp connection is a **single shared session** for the whole server, not one per
  account. Accounts separate scheduled messages, not WhatsApp identities.
- Ten-digit phone numbers are automatically prefixed with `91`.
- In persistent mode, messages are held — not failed — while WhatsApp is disconnected, so a
  dropped connection cannot burn a message's retry budget.
- `whatsapp-auth/` (or the `WhatsAppAuth` table) is your WhatsApp session. Treat it like a
  password and never commit it.

## Tech stack

React 19 · Material UI 6 · Vite 6 · Express 4 · SQLite / Postgres · Baileys · node-cron · JWT · bcrypt
