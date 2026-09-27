import { prisma } from "@/lib/db/client";
import { redis } from "@/lib/redis/client";
import { roomKeys } from "./keys";
import type { RoomParticipantView } from "@/types/ws";

export async function getRoomMemberIds(roomId: string): Promise<string[]> {
  return redis.smembers(roomKeys.members(roomId));
}

export async function joinRoom(roomId: string, userId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || room.status !== "OPEN") return { ok: false as const, error: "Room is closed." };

  const currentCount = await redis.scard(roomKeys.members(roomId));
  const alreadyMember = await redis.sismember(roomKeys.members(roomId), userId);

  if (!alreadyMember && currentCount >= room.maxParticipants) {
    return { ok: false as const, error: "Room is full." };
  }

  await prisma.roomParticipant.upsert({
    where: { roomId_userId: { roomId, userId } },
    update: { leftAt: null },
    create: {
      roomId,
      userId,
      role: room.hostId === userId ? "HOST" : "MEMBER",
    },
  });
  await redis.sadd(roomKeys.members(roomId), userId);
  await redis.sadd(roomKeys.userRooms(userId), roomId);

  return { ok: true as const, room };
}

export async function leaveRoom(roomId: string, userId: string) {
  await prisma.roomParticipant.updateMany({
    where: { roomId, userId, leftAt: null },
    data: { leftAt: new Date() },
  });
  await redis.srem(roomKeys.members(roomId), userId);
  await redis.srem(roomKeys.userRooms(userId), roomId);
}

export async function getRoomIdsForUser(userId: string): Promise<string[]> {
  return redis.smembers(roomKeys.userRooms(userId));
}

export async function getRoomParticipantViews(roomId: string): Promise<RoomParticipantView[]> {
  const participants = await prisma.roomParticipant.findMany({
    where: { roomId, leftAt: null },
    include: { user: { include: { profile: true } } },
  });
  return participants.map((p) => ({
    userId: p.userId,
    displayName: p.user.profile?.displayName || p.user.username,
    avatarUrl: p.user.profile?.avatarUrl ?? null,
    role: p.role,
    mutedByHost: p.mutedByHost,
  }));
}
