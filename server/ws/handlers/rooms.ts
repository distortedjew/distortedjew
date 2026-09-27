import { prisma } from "@/lib/db/client";
import { rateLimit } from "@/lib/redis/rate-limit";
import { analyzeMessage } from "@/lib/moderation/provider";
import { joinRoom, leaveRoom, getRoomMemberIds, getRoomParticipantViews } from "@/lib/rooms/service";
import { sendTo, broadcastTo } from "../registry";
import type { ConnectionMeta } from "../registry";
import type { ClientMessage, ChatMessagePayload } from "@/types/ws";

async function isHost(roomId: string, userId: string): Promise<boolean> {
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { hostId: true } });
  return room?.hostId === userId;
}

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

  // leaveRoom() may have promoted a new host — resync everyone's role/crown
  // rather than requiring a refresh to see it.
  if (others.length > 0) {
    const refreshed = await getRoomParticipantViews(msg.roomId);
    broadcastTo(others, { type: "room:participants", roomId: msg.roomId, participants: refreshed });
  }
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

async function assertRoomMember(roomId: string, userId: string): Promise<boolean> {
  const memberIds = await getRoomMemberIds(roomId);
  return memberIds.includes(userId);
}

export async function handleRoomWebrtcOffer(
  meta: ConnectionMeta,
  msg: Extract<ClientMessage, { type: "room:webrtc_offer" }>,
) {
  if (!(await assertRoomMember(msg.roomId, meta.userId))) return;
  sendTo(msg.toUserId, {
    type: "room:webrtc_offer",
    roomId: msg.roomId,
    fromUserId: meta.userId,
    sdp: msg.sdp,
  });
}

export async function handleRoomWebrtcAnswer(
  meta: ConnectionMeta,
  msg: Extract<ClientMessage, { type: "room:webrtc_answer" }>,
) {
  if (!(await assertRoomMember(msg.roomId, meta.userId))) return;
  sendTo(msg.toUserId, {
    type: "room:webrtc_answer",
    roomId: msg.roomId,
    fromUserId: meta.userId,
    sdp: msg.sdp,
  });
}

export async function handleRoomWebrtcIce(
  meta: ConnectionMeta,
  msg: Extract<ClientMessage, { type: "room:webrtc_ice" }>,
) {
  if (!(await assertRoomMember(msg.roomId, meta.userId))) return;
  sendTo(msg.toUserId, {
    type: "room:webrtc_ice",
    roomId: msg.roomId,
    fromUserId: meta.userId,
    candidate: msg.candidate,
  });
}

export async function handleRoomMute(
  meta: ConnectionMeta,
  msg: Extract<ClientMessage, { type: "room:mute" }>,
) {
  if (!(await isHost(msg.roomId, meta.userId))) return;
  await prisma.roomParticipant.updateMany({
    where: { roomId: msg.roomId, userId: msg.targetUserId, leftAt: null },
    data: { mutedByHost: msg.muted },
  });
  const memberIds = await getRoomMemberIds(msg.roomId);
  broadcastTo(memberIds, {
    type: "room:muted",
    roomId: msg.roomId,
    targetUserId: msg.targetUserId,
    muted: msg.muted,
  });
}

export async function handleRoomRemove(
  meta: ConnectionMeta,
  msg: Extract<ClientMessage, { type: "room:remove" }>,
) {
  if (!(await isHost(msg.roomId, meta.userId)) || msg.targetUserId === meta.userId) return;
  await leaveRoom(msg.roomId, msg.targetUserId);
  const memberIds = await getRoomMemberIds(msg.roomId);
  broadcastTo([...memberIds, msg.targetUserId], {
    type: "room:removed",
    roomId: msg.roomId,
    targetUserId: msg.targetUserId,
  });
}
