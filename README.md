# SendToWP

A WhatsApp message scheduler built with React, Material UI, Express, SQLite, Baileys, and node-cron.
Sign in, pair your WhatsApp account once, then send messages immediately or schedule them
(optionally repeating daily, weekly, or monthly).

## Features

- **Accounts** — email + password sign-up and sign-in, bcrypt-hashed passwords, JWT sessions.
- **Per-account data** — every scheduled message belongs to the account that created it.
- **Send now or schedule** — one-off or repeating (Daily / Weekly / Monthly).
- **Reliable delivery** — a cron worker picks up due messages every minute, retries with
  exponential backoff, and recovers anything interrupted by a restart.
- **WhatsApp pairing** — QR code pairing with live connection status.

## Getting started

```bash
npm install
cp .env.example server/.env     # Windows: copy .env.example server\.env
npm run dev
```

> The first `npm install` also refreshes `package-lock.json`, which is stale after the auth
> dependencies were added. Commit the updated lockfile so `npm ci` works in CI and on servers.

Then open http://localhost:5173, create an account, go to **Settings**, and scan the QR code
with WhatsApp (**Linked devices → Link a device**).

Set `JWT_SECRET` in `server/.env` before you do anything else — without it the server generates a
throwaway secret and signs everyone out on every restart. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the API (port 3000) and the Vite dev server (port 5173) together |
| `npm run build` | Builds the client into `client/dist` |
| `npm start` | Runs the API only; it also serves `client/dist` when that folder exists |

For production: `npm install && npm run build && NODE_ENV=production npm start` serves the whole
app from a single origin on port 3000. Or use Docker:

```bash
cp .env.example .env    # set JWT_SECRET
docker compose up -d --build
```

## Deploying

See **[DEPLOY.md](DEPLOY.md)** for a step-by-step Google Cloud walkthrough using the Always Free
`e2-micro` tier plus Cloudflare Tunnel for HTTPS.

Short version: this backend needs an always-on process with a persistent disk, so it **cannot run
on Vercel, Render free, Koyeb free, or Fly.io free**. On a free `e2-micro` VM, one command does
everything:

```bash
curl -fsSL https://raw.githubusercontent.com/aryan4209/SendToWP/main/scripts/gcp-bootstrap.sh | sudo bash
```

## Install as a phone app

The client is a PWA. Open the deployed site over HTTPS and use **Install app** (Android/Chrome)
or **Share → Add to Home Screen** (iOS/Safari). It launches fullscreen with its own icon.

## Configuration

Every setting lives in `server/.env`; see [.env.example](.env.example) for the full list. The ones
that matter most:

| Variable | Default | Notes |
| --- | --- | --- |
| `JWT_SECRET` | *(generated in dev)* | Required in production, minimum 32 characters |
| `JWT_EXPIRES_IN` | `7d` | How long a sign-in lasts |
| `ALLOW_REGISTRATION` | `true` | Set to `false` to close sign-ups; the first account is always allowed |
| `CLIENT_ORIGIN` | *(any)* | Comma-separated browser origins allowed to call the API |
| `DB_PATH` | `./database/sendtowp.db` | Must be on persistent storage |
| `WHATSAPP_AUTH_PATH` | `server/whatsapp-auth` | Must be on persistent storage — losing it means re-pairing |
| `RETRY_LIMIT` | `3` | Send attempts before a message stays in `Failed` |
| `TRUST_PROXY` | *(unset)* | Set to `1` behind nginx / Render / Railway so rate limiting sees real IPs |

## API

All endpoints are under `/api`. Everything except the health check and `/api/auth/*` requires an
`Authorization: Bearer <token>` header.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness check |
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

## Notes

- The WhatsApp connection is a **single shared session** for the whole server, not one per
  account. Accounts separate scheduled messages, not WhatsApp identities.
- Ten-digit phone numbers are automatically prefixed with `91`. Anything else needs its own
  country code.
- Messages are held, not failed, while WhatsApp is disconnected — the scheduler skips its run
  entirely so a dropped connection cannot burn a message's retry budget.
- `server/whatsapp-auth/` holds your WhatsApp session. Treat it like a password and never commit it.

## Tech stack

React 19 · Material UI 6 · Vite 6 · Express 4 · SQLite (sqlite3) · Baileys · node-cron · JWT · bcrypt
