import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { FriendsList } from "@/components/friends/friends-list";

export const metadata: Metadata = { title: "Friends" };

export default async function FriendsPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/discover");

  const connections = await prisma.connection.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: session.sub }, { addresseeId: session.sub }],
    },
    include: {
      requester: { include: { profile: true } },
      addressee: { include: { profile: true } },
    },
    orderBy: { respondedAt: "desc" },
  });

  const friends = connections.map((c) => {
    const other = c.requesterId === session.sub ? c.addressee : c.requester;
    return {
      connectionId: c.id,
      userId: other.id,
      username: other.username,
      displayName: other.profile?.displayName ?? other.username,
      avatarUrl: other.profile?.avatarUrl ?? null,
      country: other.profile?.country ?? null,
      interests: other.profile?.interests ?? [],
    };
  });

  return <FriendsList friends={friends} />;
}
