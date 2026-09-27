import { prisma } from "@/lib/db/client";
import { rateLimit } from "@/lib/redis/rate-limit";
import { analyzeMessage } from "@/lib/moderation/provider";
import { joinRoom, leaveRoom, getRoomMemberIds, getRoomParticipantViews } from "@/lib/rooms/service";
import { sendTo, broadcastTo } from "../registry";
import type { ConnectionMeta } from "../registry";
import type { ClientMessage, ChatMessagePayload } from "@/types/ws";

export async function handleRoomJoin(
  meta: ConnectionMeta,
  msg: Extract<ClientMessage, { type: "room:join" }>,
) {
  const result = await joinRoom(msg.roomId, meta.userId);
  if (!result.ok) {
    sendTo(meta.userId, { type: "error", code: "ROOM_JOIN_FAILED", message: result.error });
    return;
  }

  const participants = await getRoomParticipantViews(msg.roomId);
  sendTo(meta.userId, { type: "room:joined", roomId: msg.roomId, participants });

  const me = participants.find((p) => p.userId === meta.userId);
  if (me) {
    const others = (await getRoomMemberIds(msg.roomId)).filter((id) => id !== meta.userId);
    broadcastTo(others, {
      type: "room:participant_joined",
      roomId: msg.roomId,
      participant: me,
    });
  }
}

export async function handleRoomLeave(
  meta: ConnectionMeta,
  msg: Extract<ClientMessage, { type: "room:leave" }>,
) {
  const others = (await getRoomMemberIds(msg.roomId)).filter((id) => id !== meta.userId);
  await leaveRoom(msg.roomId, meta.userId);
  broadcastTo(others, { type: "room:participant_left", roomId: msg.roomId, userId: meta.userId });
}

export async function handleRoomMessage(
  meta: ConnectionMeta,
  msg: Extract<ClientMessage, { type: "room:message" }>,
) {
  const body = (msg.body ?? "").trim().slice(0, 2000);
  if (!body) return;

  const memberIds = await getRoomMemberIds(msg.roomId);
  if (!memberIds.includes(meta.userId)) return;

  const limit = await rateLimit(`room:msg:${meta.userId}`, 15, 10);
  if (!limit.allowed) {
    sendTo(meta.userId, { type: "error", code: "RATE_LIMITED", message: "Slow down a little." });
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
      roomId: msg.roomId,
      senderId: meta.userId,
      body,
      kind: "TEXT",
      metadata: { moderation: { riskScore: moderation.riskScore, flagged: moderation.shouldFlagForReview } },
    },
  });

  const payload: ChatMessagePayload = {
    id: saved.id,
    roomId: msg.roomId,
    senderId: meta.userId,
    senderName: meta.username,
    body,
    kind: "TEXT",
    createdAt: saved.createdAt.toISOString(),
  };

  broadcastTo(memberIds, { type: "room:message", roomId: msg.roomId, message: payload });
}
