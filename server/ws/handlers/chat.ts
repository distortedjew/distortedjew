import { nanoid } from "nanoid";
import { prisma } from "@/lib/db/client";
import { redis } from "@/lib/redis/client";
import { rateLimit } from "@/lib/redis/rate-limit";
import { getMatchState, endMatch } from "@/lib/matchmaking/engine";
import { analyzeMessage } from "@/lib/moderation/provider";
import { cacheBlockPair } from "@/lib/matchmaking/blocklist";
import { trackEvent } from "@/lib/analytics/track";
import { unlockAchievement } from "@/lib/gamification/xp";
import { sendTo } from "../registry";
import type { ConnectionMeta } from "../registry";
import type { ClientMessage, ChatMessagePayload } from "@/types/ws";
import { clientMessageKind, isAllowedReaction, sanitizeMessageMetadata } from "@/lib/chat/sanitize";

const MAX_MESSAGE_LENGTH = 2000;
const MESSAGES_PER_WINDOW = Number(process.env.RATE_LIMIT_MESSAGES_PER_10S ?? 15);

async function otherParty(matchId: string, selfId: string) {
  const state = await getMatchState(matchId);
  if (!state) return null;
  if (state.userAId !== selfId && state.userBId !== selfId) return null;
  const peerId = state.userAId === selfId ? state.userBId : state.userAId;
  return { state, peerId };
}

export async function handleChatMessage(
  meta: ConnectionMeta,
  msg: Extract<ClientMessage, { type: "chat:message" }>,
) {
  const body = (typeof msg.body === "string" ? msg.body : "").trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!body) return;
  const kind = clientMessageKind(msg.kind);
  const metadata = sanitizeMessageMetadata(kind, msg.metadata);

  const context = await otherParty(msg.matchId, meta.userId);
  if (!context) {
    sendTo(meta.userId, { type: "error", code: "NO_ACTIVE_MATCH", message: "This chat has ended." });
    return;
  }

  const limit = await rateLimit(`chat:msg:${meta.userId}`, MESSAGES_PER_WINDOW, 10);
  if (!limit.allowed) {
    sendTo(meta.userId, {
      type: "error",
      code: "RATE_LIMITED",
      message: "You're sending messages too fast.",
    });
    return;
  }

  const moderation = await analyzeMessage(body);
  if (moderation.shouldBlock) {
    sendTo(meta.userId, {
      type: "error",
      code: "MESSAGE_BLOCKED",
      message: "That message was blocked by our safety filters.",
    });
    return;
  }

  const saved = await prisma.message.create({
    data: {
      matchId: msg.matchId,
      senderId: meta.userId,
      body,
      kind,
      metadata: {
        ...(metadata ?? {}),
        moderation: {
          riskScore: moderation.riskScore,
          flagged: moderation.shouldFlagForReview,
        },
      },
    },
  });

  const payload: ChatMessagePayload = {
    id: saved.id,
    matchId: msg.matchId,
    senderId: meta.userId,
    senderName: meta.username,
    body,
    kind: saved.kind,
    // Only the sanitized fields; the moderation scores stay server-side.
    ...(metadata ? { metadata: { ...metadata } } : {}),
    createdAt: saved.createdAt.toISOString(),
  };

  sendTo(meta.userId, { type: "chat:message", message: payload });
  sendTo(context.peerId, { type: "chat:message", message: payload });
}

export async function handleChatTyping(
  meta: ConnectionMeta,
  msg: Extract<ClientMessage, { type: "chat:typing" }>,
) {
  const context = await otherParty(msg.matchId, meta.userId);
  if (!context) return;
  sendTo(context.peerId, {
    type: "chat:typing",
    matchId: msg.matchId,
    peerId: meta.userId,
    isTyping: msg.isTyping,
  });
}

export async function handleChatReaction(
  meta: ConnectionMeta,
  msg: Extract<ClientMessage, { type: "chat:reaction" }>,
) {
  // Free text here would skip the message filter; only the offered emoji pass.
  if (!isAllowedReaction(msg.emoji)) return;
  const context = await otherParty(msg.matchId, meta.userId);
  if (!context) return;
  sendTo(context.peerId, {
    type: "chat:reaction",
    matchId: msg.matchId,
    peerId: meta.userId,
    emoji: msg.emoji,
  });
}

export async function handleChatNext(
  meta: ConnectionMeta,
  msg: Extract<ClientMessage, { type: "chat:next" }>,
) {
  const context = await otherParty(msg.matchId, meta.userId);
  if (!context) return;
  await endMatch(msg.matchId, meta.userId, "NEXT");
  trackEvent(meta.userId, "next_pressed", { matchId: msg.matchId });
  sendTo(context.peerId, { type: "chat:partner_left", matchId: msg.matchId, reason: "next" });
  sendTo(meta.userId, { type: "chat:ended", matchId: msg.matchId });
}

export async function handleChatLeave(
  meta: ConnectionMeta,
  msg: Extract<ClientMessage, { type: "chat:leave" }>,
) {
  const context = await otherParty(msg.matchId, meta.userId);
  if (!context) return;
  await endMatch(msg.matchId, meta.userId, "DISCONNECT");
  sendTo(context.peerId, { type: "chat:partner_left", matchId: msg.matchId, reason: "disconnect" });
  sendTo(meta.userId, { type: "chat:ended", matchId: msg.matchId });
}

const CONNECT_REQUEST_TTL_SECONDS = 60 * 10;
function connectRequestKey(matchId: string, userId: string) {
  return `match:connect:${matchId}:${userId}`;
}

export async function handleConnectRequest(
  meta: ConnectionMeta,
  msg: Extract<ClientMessage, { type: "chat:connect_request" }>,
) {
  const context = await otherParty(msg.matchId, meta.userId);
  if (!context) return;

  await redis.set(connectRequestKey(msg.matchId, meta.userId), "1", "EX", CONNECT_REQUEST_TTL_SECONDS);
  const peerRequested = await redis.get(connectRequestKey(msg.matchId, context.peerId));

  if (!peerRequested) {
    sendTo(meta.userId, { type: "chat:connect_pending" });
    return;
  }

  const [a, b] = [meta.userId, context.peerId].sort();
  const connection = await prisma.connection.upsert({
    where: { requesterId_addresseeId: { requesterId: a, addresseeId: b } },
    update: { status: "ACCEPTED", respondedAt: new Date() },
    create: {
      requesterId: a,
      addresseeId: b,
      status: "ACCEPTED",
      sourceMatchId: msg.matchId,
      respondedAt: new Date(),
    },
  });

  const [meUser, peerUser] = await Promise.all([
    prisma.user.findUnique({ where: { id: meta.userId }, select: { username: true } }),
    prisma.user.findUnique({ where: { id: context.peerId }, select: { username: true } }),
  ]);

  trackEvent(meta.userId, "connection_created", { connectionId: connection.id });
  unlockAchievement(meta.userId, "first_connection").catch(() => undefined);
  unlockAchievement(context.peerId, "first_connection").catch(() => undefined);

  sendTo(meta.userId, {
    type: "chat:connect_mutual",
    connectionId: connection.id,
    peerUsername: peerUser?.username ?? "them",
  });
  sendTo(context.peerId, {
    type: "chat:connect_mutual",
    connectionId: connection.id,
    peerUsername: meUser?.username ?? "them",
  });
}

export async function handleReport(
  meta: ConnectionMeta,
  msg: Extract<ClientMessage, { type: "chat:report" }>,
) {
  const context = await otherParty(msg.matchId, meta.userId);
  if (!context) return;

  await prisma.report.create({
    data: {
      reporterId: meta.userId,
      reportedId: context.peerId,
      category: msg.category as never,
      description: typeof msg.description === "string" ? msg.description.slice(0, 1000) : undefined,
      matchId: msg.matchId,
    },
  });

  await endMatch(msg.matchId, meta.userId, "REPORTED");
  trackEvent(meta.userId, "report_created", { category: msg.category });

  sendTo(context.peerId, { type: "chat:partner_left", matchId: msg.matchId, reason: "disconnect" });
  sendTo(meta.userId, { type: "chat:ended", matchId: msg.matchId });
}

export async function handleBlock(
  meta: ConnectionMeta,
  msg: Extract<ClientMessage, { type: "chat:block" }>,
) {
  const context = await otherParty(msg.matchId, meta.userId);
  if (!context) return;

  await prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId: meta.userId, blockedId: context.peerId } },
    update: {},
    create: { blockerId: meta.userId, blockedId: context.peerId },
  });
  await cacheBlockPair(meta.userId, context.peerId);
  await endMatch(msg.matchId, meta.userId, "DISCONNECT");

  sendTo(context.peerId, { type: "chat:partner_left", matchId: msg.matchId, reason: "disconnect" });
  sendTo(meta.userId, { type: "chat:ended", matchId: msg.matchId });
}

export function generateMessageId() {
  return nanoid();
}
