# Wisp

Meet someone you've never met. Wisp is a modern social discovery platform —
random text, voice, and video chat matched by interest, language, or pure
chance, with group rooms, mini-games, and real safety tooling built in from
day one.

This is a real, working implementation (Next.js app + Node/WebSocket
gateway + PostgreSQL + Redis), not a static mockup. See `PROGRESS.md` for
what's implemented so far and what's next.

## Stack

- **Frontend**: Next.js (App Router) + TypeScript + React + Tailwind CSS v4 + Framer Motion
- **Realtime**: a custom Node HTTP server (`server/index.ts`) hosting Next.js and a `ws`-based WebSocket gateway on the same port, at `/ws`
- **Matchmaking**: Redis-backed queues, presence, rate limiting, ephemeral match/room state
- **Persistence**: PostgreSQL via Prisma
- **Auth**: first-party (no external IdP) — guest sessions + username/password accounts, JWT session cookie, bcrypt password hashing
- **WebRTC**: mesh P2P with STUN/TURN configured via env vars; signaling over the same WebSocket gateway; architected so a media server (e.g. LiveKit) could be swapped in later without a client rewrite

## Getting started

### 1. Start PostgreSQL and Redis

Two options:

**Docker Compose** (recommended if Docker is available):

```bash
docker compose up -d
```

**Local services** (if you don't have Docker): install PostgreSQL 16 and
Redis, then create a `wisp` database/role matching `.env.example`.

### 2. Configure environment

```bash
cp .env.example .env
# generate a real secret:
openssl rand -base64 32
# paste it into AUTH_SECRET in .env
```

### 3. Install dependencies and set up the database

```bash
npm install
npm run db:migrate   # applies prisma/migrations
npm run db:seed      # seeds the 4 mini-games + achievement definitions
```

### 4. Run the app

```bash
npm run dev
```

This starts the custom server (`server/index.ts`) via `tsx watch`, which
boots Next.js in dev mode **and** the WebSocket gateway on the same port
(default `http://localhost:3000`, WS at `ws://localhost:3000/ws`).

### Other commands

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run test         # vitest
npm run db:studio   # Prisma Studio (inspect the DB visually)
npm run build        # next build (production bundle)
npm run start         # run the production server (NODE_ENV=production)
```

### Tests

`npm run test` runs the Vitest suite: password hashing, session JWTs, RBAC
(`requireAdmin`/`requireFullAdmin`), Zod request-validation schemas, the
rule-based moderation engine, WebRTC ICE server configuration, the trivia
game engine's round/scoring state machine, and — as integration tests
against your local Postgres/Redis (same `.env` as `npm run dev`) —
matchmaking (pairing, interest filters, block enforcement, rematch
cooldown), the block-list cache, the Redis rate limiter, and WebSocket
handshake auth (valid/expired/banned/suspended sessions). Bring up
Postgres and Redis (`docker compose up -d` or local services) before
running it; each integration test creates and cleans up its own rows/keys.

## Deploying to production

`docker-compose.prod.yml` runs the full stack on one server: the app,
PostgreSQL, Redis, Caddy (automatic HTTPS), coturn (TURN relay for calls) and
daily database backups.

```bash
cp .env.production.example .env   # fill in DOMAIN, PUBLIC_IP, secrets
docker compose -f docker-compose.prod.yml up -d --build
```

Step-by-step walkthrough (server, DNS, firewall, admin account, backups,
updates): **[docs/DEPLOY.md](docs/DEPLOY.md)**.

## Environment variables

See `.env.example` for the full list with inline documentation. Highlights:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `AUTH_SECRET` | HMAC secret for session JWTs — **must** be set to a real random value outside of local dev |
| `STUN_SERVERS` / `TURN_SERVER` / `TURN_USERNAME` / `TURN_PASSWORD` | WebRTC ICE configuration. STUN-only works for many networks; TURN is required for reliable connectivity behind symmetric NATs/firewalls |
| `AI_PROVIDER` / `AI_API_KEY` / `AI_API_BASE_URL` | Optional AI moderation provider. Unset → the built-in rule-based moderation engine runs alone (still real, just not ML-based) |
| `TRANSLATION_PROVIDER` / `TRANSLATION_API_KEY` | Optional translation provider. Unset → dev/mock translator |
| `STORAGE_*` | S3-compatible object storage for avatars. Unset → in-memory/local dev storage adapter |
| `CAPTCHA_*` | Turnstile/hCaptcha-style bot check on signup. Unset → mock provider that always passes in dev |

Every external integration is behind an abstraction with a working
dev/mock fallback — the app is fully functional end-to-end with zero
external API keys configured.

## Architecture notes

- **Why a custom server?** Random chat needs a persistent, low-latency,
  bidirectional channel for matchmaking events, chat messages, and WebRTC
  signaling. A single Node process hosts both Next.js (HTTP) and the `ws`
  WebSocket gateway so they can share the same port and deployment unit.
  Next's own dev-mode HMR websocket is forwarded through via
  `app.getUpgradeHandler()` so hot reload keeps working alongside `/ws`.
- **Matchmaking** lives in `src/lib/matchmaking/engine.ts` — Redis-backed
  queues per channel (TEXT/VOICE/VIDEO), scored compatibility matching
  (mode, interests, language, country), blocklist and recent-rematch
  avoidance. It's written to be portable to a Redis Lua script for
  multi-instance horizontal scaling (currently serialized via an
  in-process lock, documented inline).
- **WebRTC** is mesh peer-to-peer; the server only relays signaling
  messages (offer/answer/ICE) and never touches media. ICE server config
  is resolved server-side from env vars and handed to clients at match
  time (`src/lib/webrtc/ice-config.ts`).
- **Moderation** runs an always-on rule-based engine plus an optional
  pluggable AI provider (`src/lib/moderation/`); thresholds for
  block/flag/auto-timeout live in one config file
  (`src/lib/moderation/config.ts`).
- **Mini-games** are a small pure-function engine
  (`src/lib/games/types.ts` — `createInitialState` / `applyAction` /
  `toPublicState`) so new games plug into the same WebSocket handler
  without touching matchmaking or chat code.

