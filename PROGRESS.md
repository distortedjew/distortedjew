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

## Phase 7 — Translation, AI moderation, music, icebreakers ✅

- Moderation: always-on rule engine + optional pluggable AI provider done
  (`src/lib/moderation/`).
- Icebreakers: local provider done (`src/lib/icebreakers.ts`), sent
  automatically on match.
- Translation: provider abstraction (`src/lib/translation/`) — a real
  LibreTranslate-compatible HTTP client, and an honest dev/mock fallback
  (a genuine small phrasebook, not a fake pass-through — anything outside
  it returns unchanged with a note explaining how to get full coverage).
  Wired into 1:1 text chat: a per-message "Translate" button, plus
  auto-translate of incoming messages when the viewer's Settings →
  auto-translate toggle is on. Verified working in a real two-browser
  session.
- Music sharing: a share dialog (song/artist/optional link — never audio
  itself, per the "don't illegally stream" requirement) renders as a
  "Now Playing" card in chat. Verified working end-to-end.

## Phase 8 — Admin dashboard, analytics, security hardening, docs ✅

- Analytics event pipeline done (`src/lib/analytics/track.ts`), used by
  matchmaking/chat/connect handlers already.
- Admin dashboard (`src/app/admin/*`, RBAC-gated by `requireAdmin`/
  `requireFullAdmin`) with overview, reports queue + resolution actions,
  user search/moderation, active-session browser, moderation-action log,
  and a landing-stats/report-category analytics page. All backed by real
  Prisma queries against the same schema the app writes to — no mock data.
- Security headers: a Content-Security-Policy plus X-Content-Type-Options,
  X-Frame-Options, Referrer-Policy, and a camera/microphone-scoped
  Permissions-Policy (`next.config.ts`). Note: `script-src` needs
  `'unsafe-inline'` — Next.js App Router ships inline `<script>` tags
  carrying RSC hydration data, and without it the app fails to hydrate
  at all (a request-scoped nonce would remove the need for this, but
  requires wiring through the custom server + App Router, out of scope
  here). `style-src 'unsafe-inline'` is a similar pragmatic tradeoff for
  Tailwind/Radix's inline positioning styles. `script-src` otherwise
  only allows same-origin + the Turnstile CAPTCHA origin, so external
  script injection is still blocked. Verified with a real two-browser
  Playwright run (age-gate → matchmaking → live message exchange) showing
  zero console/CSP errors under the new headers.
- CAPTCHA abstraction (`src/lib/captcha/`): mock always-pass dev provider
  (default) + real Cloudflare Turnstile server-side verification, same
  provider-swap pattern as moderation/translation/storage. Wired into
  registration (`TurnstileWidget` renders nothing — and the API route
  skips verification via the mock provider — when no site key/secret is
  configured, so signup keeps working end-to-end without external
  credentials).
- `.env.example`, `docker-compose.yml`, README done.
- Vitest test suite (86 tests, 14 files) covering the areas called out in
  the original spec:
  - **Auth**: password hashing round-trip (`src/lib/auth/password.test.ts`),
    session JWT sign/verify/tamper-rejection (`src/lib/auth/jwt.test.ts`).
  - **Permissions**: `requireAdmin`/`requireFullAdmin` role branching
    (`src/lib/auth/require-admin.test.ts`).
  - **WS**: handshake auth — valid/missing/malformed/banned/suspended/
    deleted-user sessions (`server/ws/auth.test.ts`).
  - **Matchmaking + block/report**: pairing, interest-mode filtering,
    block-list enforcement (both directions), post-match rematch cooldown,
    `leaveQueue` (`src/lib/matchmaking/engine.test.ts`), plus the
    block-list Redis cache in isolation (`src/lib/matchmaking/blocklist.test.ts`).
  - **API validation**: register/login/guest, report, and room-creation
    Zod schemas — valid and rejected cases (`src/lib/validation/*.test.ts`).
  - **Game state**: the trivia engine's round/reveal/scoring state
    machine, including edge cases (intruder actions, malformed payloads,
    post-reveal answers ignored) (`src/lib/games/definitions/trivia.test.ts`).
  - Also: the rule-based moderation engine's category/risk-score behavior,
    the Redis-backed rate limiter (isolation, reset-after-window), and
    WebRTC ICE server config (STUN fallback, TURN credential gating, no
    credential leakage).
  - Integration tests (matchmaking, blocklist, rate-limit, WS auth) run
    against the real local Postgres/Redis from `.env` — each test creates
    and tears down its own rows/keys, verified to leave no residue.

## Post-Phase-8 — theme, notification center, password reset ✅

- Restyled to a soft pastel palette (lavender/sky/pink/mint, `#252433`
  text) with Plus Jakarta Sans headings, per updated brand direction.
  Light is now the default theme; dark is kept as an available toggle.
- Notification center: the `Notification` table and WS push already
  existed (achievements, moderation actions) but had no way to ever be
  seen again after the fact. Added `GET`/`PATCH /api/notifications`
  and a bell in the topbar (`src/components/app-shell/notification-bell.tsx`)
  with an unread badge, dropdown, live WS updates, and mark-read/mark-all.
  Verified end-to-end against a real guest session and Postgres.
- Forgot/reset password: the one missing piece of the auth lifecycle
  for real (non-guest) accounts. Added an `EmailProvider` abstraction
  (`src/lib/email/` — mock logs to the console, real via Resend's HTTP
  API) and self-invalidating JWT reset tokens (`src/lib/auth/reset-token.ts`
  — no DB table, no cleanup job; a token stops verifying the moment the
  password it was issued against actually changes). Verified with a
  real run against the live dev server: registered an account, pulled
  the actual reset link out of the mock provider's log output, reset
  through the real form, confirmed the old password now fails and the
  new one works, and confirmed the same token can't be replayed.
- A minimal service worker (`public/sw.js`) so the app is actually
  installable (the manifest existed but nothing registered a SW) and
  has a branded offline fallback instead of the browser's default error
  page. Deliberately doesn't cache pages or API/WS traffic — Wisp is
  realtime end to end, so stale-cache strategies would cause real bugs.
- Email verification: `User.emailVerified` existed in the schema but
  nothing ever set it. Registration now sends a verification email in
  the background (non-blocking — the account still works immediately)
  using the same self-invalidating-JWT-token pattern as password reset,
  plus a resend action and verified/unverified indicator in Settings.
  Verified end-to-end against the live server, including idempotent
  re-clicks of the same link.
