import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { redis } from "@/lib/redis/client";
import { roomKeys } from "@/lib/rooms/keys";
import { createRoomSchema } from "@/lib/validation/room";
import { rateLimit } from "@/lib/redis/rate-limit";

export async function GET() {
  const rooms = await prisma.room.findMany({
    where: { status: "OPEN", isPrivate: false },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { host: { include: { profile: true } } },
  });

  const withCounts = await Promise.all(
    rooms.map(async (room) => ({
      id: room.id,
      title: room.title,
      topic: room.topic,
      interests: room.interests,
      channel: room.channel,
      maxParticipants: room.maxParticipants,
      participantCount: await redis.scard(roomKeys.members(room.id)),
      hostName: room.host.profile?.displayName || room.host.username,
      createdAt: room.createdAt,
    })),
  );

  return NextResponse.json({ rooms: withCounts });
}

export async function POST(req: NextRequest) {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = await rateLimit(`room-create:${session.sub}`, 5, 60 * 10);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many rooms created recently." }, { status: 429 });
  }

  const parsed = createRoomSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  const room = await prisma.room.create({
    data: {
      ...parsed.data,
      hostId: session.sub,
      inviteCode: parsed.data.isPrivate ? nanoid(10) : null,
      participants: { create: { userId: session.sub, role: "HOST" } },
    },
  });
  await redis.sadd(roomKeys.members(room.id), session.sub);
  await redis.sadd(roomKeys.userRooms(session.sub), room.id);

  return NextResponse.json({ room });
}
