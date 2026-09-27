# Wisp — implementation progress

Real, working code only — nothing below is a visual-only mockup unless
explicitly labeled "UI only".

## Phase 1 — Project scaffold, DB schema, auth, landing page, WS infra ✅

- Next.js 16 (App Router) + TypeScript + Tailwind v4 scaffold, custom UI kit
  (`src/components/ui/*`) styled to a bespoke dark-first theme.
- Prisma schema (`prisma/schema.prisma`) covering the full data model: User,
  Profile, UserSettings, AuthSession, Match, Message, Connection, Block,
  Report, ModerationAction, Room, RoomParticipant, Game, GameSession,
  GameParticipant, Achievement, UserAchievement, Notification,
  AnalyticsEvent. Migrated and seeded against a real local PostgreSQL 16.
- Auth: guest sessions + username/password accounts, bcrypt hashing, JWT
  session cookie (`jose`), revocable `AuthSession` rows, age gate (18+),
  rate-limited register/login/guest endpoints.
- Custom Node server (`server/index.ts`) hosting Next.js + a `ws` WebSocket
  gateway on one port, with Next's own HMR upgrade requests correctly
  forwarded (see README "Architecture notes" — this was a real bug caught
  and fixed during build: without it, the entire client-side app failed to
  hydrate).
- Landing page, navbar, footer, terms/privacy/safety pages, login/register
  pages — all real, server-rendered, with live stats pulled from
  Postgres/Redis (not hardcoded).

## Phase 2 — Redis matchmaking + text chat + block/report ✅ (backend) / 🚧 (UI)

- `src/lib/matchmaking/engine.ts`: Redis-backed per-channel queues, scored
  compatibility matching across all 9 modes, blocklist cache, recent-match
  cooldown.
- WebSocket handlers for queue join/leave, chat message/typing/reaction,
  next/leave, mutual-connect, report, block — all wired to Postgres +
  Redis, with rule-based moderation running on every message.
- Still needed: `/discover` and `/chat` pages (client UI) wired to this via
  the WS protocol.

## Phase 3 — WebRTC video/voice 🚧

- Signaling handlers (offer/answer/ICE/media-state relay) and ICE server
  config (`src/lib/webrtc/ice-config.ts`) are done server-side.
- Still needed: client-side `RTCPeerConnection` wrapper + video/voice chat
  UI.

## Phase 4 — Interest/language/country filters ✅ (backend, integrated into engine.ts) / 🚧 (UI)

## Phase 5 — Profiles, connections, gamification 🚧

## Phase 6 — Group rooms + mini-games ✅ (backend) / 🚧 (UI)

- Room join/leave/message WS handlers + Redis membership set
  (`src/lib/rooms/`).
- Mini-game engine + 4 games (Would You Rather, Trivia, Guess the Word,
  Draw & Guess) with full state machines (`src/lib/games/`), WS handlers
  for invite/accept/action.
- Still needed: `/rooms` and `/games` pages, in-chat game UI.

## Phase 7 — Translation, AI moderation, music, icebreakers 🚧

- Moderation: always-on rule engine + optional pluggable AI provider done
  (`src/lib/moderation/`).
- Icebreakers: local provider done (`src/lib/icebreakers.ts`), sent
  automatically on match.
- Still needed: translation provider abstraction + UI, music "Now Playing"
  card.

## Phase 8 — Admin dashboard, analytics, security hardening, docs 🚧

- Analytics event pipeline done (`src/lib/analytics/track.ts`), used by
  matchmaking/chat/connect handlers already.
- `.env.example`, `docker-compose.yml`, README done.
- Still needed: `/admin/*` pages, vitest test suite, CSP headers.
