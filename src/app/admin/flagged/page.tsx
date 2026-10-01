import type { Metadata } from "next";
import { prisma } from "@/lib/db/client";
import { unreviewedFlaggedMessageIds } from "@/lib/moderation/flagged";
import { FlaggedList } from "@/components/admin/flagged-list";

export const metadata: Metadata = { title: "Admin · Flagged messages" };

export default async function AdminFlaggedPage() {
  const ids = await unreviewedFlaggedMessageIds();
  const messages = await prisma.message.findMany({
    where: { id: { in: ids } },
    orderBy: { createdAt: "desc" },
    include: { sender: { select: { username: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Flagged messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Borderline messages the automated filter let through. Open the sender to take action, or
          mark the message reviewed if it&apos;s fine.
        </p>
      </div>
      <FlaggedList
        messages={messages.map((m) => {
          const moderation = (m.metadata as { moderation?: { riskScore?: number } } | null)?.moderation;
          return {
            id: m.id,
            body: m.body,
            createdAt: m.createdAt.toISOString(),
            senderUsername: m.sender.username,
            riskScore: typeof moderation?.riskScore === "number" ? moderation.riskScore : null,
            where: m.roomId ? "room" : "chat",
          };
        })}
      />
    </div>
  );
}
