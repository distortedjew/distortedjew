import type { Metadata } from "next";
import { prisma } from "@/lib/db/client";
import { redis } from "@/lib/redis/client";
import { roomKeys } from "@/lib/rooms/keys";
import { RoomsBrowser } from "@/components/rooms/rooms-browser";

export const metadata: Metadata = { title: "Rooms" };

export default async function RoomsPage() {
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
    })),
  );

  return <RoomsBrowser rooms={withCounts} />;
}
