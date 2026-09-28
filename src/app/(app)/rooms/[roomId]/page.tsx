import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { RoomExperience } from "@/components/rooms/room-experience";

export const metadata: Metadata = { title: "Room" };

export default async function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const session = await getCurrentUser();
  if (!session) redirect("/discover");

  const { roomId } = await params;
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) notFound();
  if (room.status !== "OPEN") redirect("/rooms");

  return (
    <RoomExperience
      room={{
        id: room.id,
        title: room.title,
        topic: room.topic,
        rules: room.rules,
        channel: room.channel,
        maxParticipants: room.maxParticipants,
        hostId: room.hostId,
      }}
      selfId={session.sub}
    />
  );
}
