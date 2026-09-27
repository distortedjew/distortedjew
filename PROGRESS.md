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

## Phase 2 — Redis matchmaking + text chat + block/report ✅

- `src/lib/matchmaking/engine.ts`: Redis-backed per-channel queues, scored
  compatibility matching across all 9 modes, blocklist cache, recent-match
  cooldown.
- WebSocket handlers for queue join/leave, chat message/typing/reaction,
  next/leave, mutual-connect, report, block — all wired to Postgres +
  Redis, with rule-based moderation running on every message.
- `/discover` (guest age-gate + channel/mode/interest/language/country
  picker) and `/chat` (search → match → live chat → next/leave/report/block
  → partner-left screen) built and **verified working end-to-end** with two
  real browser sessions exchanging live messages through Postgres + Redis +
  the WebSocket gateway (not mocked).

## Phase 3 — WebRTC video/voice ✅ (implemented) / needs live-mic/camera manual verification

- `src/hooks/use-webrtc.ts`: full mesh RTCPeerConnection wrapper — offer/
  answer/ICE over the WS gateway, camera/mic toggles, connection-state
  machine (connecting/connected/reconnecting/failed), cleanup.
- `src/components/chat/call-view.tsx`: video stage with local PiP, avatar
  fallback when camera's off, voice mode with a live audio-level ring
  (`use-audio-level.ts`, real Web Audio API analyser), fullscreen, controls.
- Signaling handlers (offer/answer/ICE/media-state relay) and ICE server
  config (`src/lib/webrtc/ice-config.ts`) are done server-side.
- Verified: TEXT channel flow end-to-end in a real browser. VOICE/VIDEO
  code paths are complete but need a manual check with real camera/mic
  permissions (headless test env has no media devices to grant).

## Phase 4 — Interest/language/country filters ✅

- Matching engine + `/discover` UI both done and wired together.

## Phase 5 — Profiles, connections, gamification 🚧

- Connect flow (mutual double opt-in → `Connection` row) implemented in
  the chat WS handlers and TextChatView/CallView UI.
- Still needed: `/profile`, `/friends`, `/settings` pages, XP/achievement
  award triggers beyond games.

## Phase 6 — Group rooms + mini-games ✅

- Room join/leave/message WS handlers + Redis membership set
  (`src/lib/rooms/`), plus room-scoped WebRTC signaling (`room:webrtc_*`)
  for a full-mesh group voice/video call and host controls (mute/remove).
- `/rooms` (browse + create dialog) and `/rooms/[roomId]` (group chat +
  call grid + participant list with host controls) built and verified
  end-to-end with two real browser sessions: participant list, group text
  chat, and bidirectional group video (pixel-checked — both sides render
  live frames from each other, not just their own camera).
- Mini-game engine + 4 games (Would You Rather, Trivia, Guess the Word,
  Draw & Guess) with full state machines (`src/lib/games/`), WS handlers
  for invite/accept/action, plus a live-stroke relay (`game:draw`) for the
  drawing game with its own generous rate limit.
- In-chat `GamePanel` (invite/accept, all 4 games playable) wired into
  TextChatView, CallView, and now RoomExperience too (`/games` page is a
  showcase/entry point; games are actually played inside a chat or room).

### A real bug hunt, for the record

Getting group video working end-to-end surfaced a chain of genuine
concurrency bugs, all rooted in the same cause: React StrictMode's
dev-only double effect invocation (mount → cleanup → mount) was
triggering *real* side effects each time — a second WebSocket connect,
a second `room:join`/`room:leave`, a second SDP offer — because the
cleanups fired unconditionally. For matchmaking (`chat-experience.tsx`)
that was merely wasteful; for a WebSocket connection judged by the
server on live connection *count*, and for a room whose membership
changes are *broadcast live to other people*, a transient churn is
destructive: the server would see a real disconnect, end the user's
match, drop them from their room, and tell every other participant they
left — and their WebRTC peer connections would get torn down to match.
Fixed by deferring each side-effecting cleanup (WS close, `room:leave`)
by one tick and cancelling it if the effect immediately re-fires
(`src/hooks/socket-provider.tsx`, `src/components/rooms/room-experience.tsx`,
`src/components/chat/chat-experience.tsx`). Also fixed along the way:
offer/ICE races when a peer connection didn't exist yet or wasn't
claimed atomically (`src/hooks/use-webrtc.ts`,
`src/hooks/use-room-webrtc.ts`), a `getUserMedia` race where a peer
connection could be created and offered before local tracks were
attached, and missing explicit `.play()` calls on remote `<video>`/
`<audio>` elements. All verified by decoding actual video frames from
the remote `<video>` element's pixels in a running two-browser test, not
just checking for the absence of thrown errors.

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
