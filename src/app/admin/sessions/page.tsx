import type { Metadata } from "next";
import { prisma } from "@/lib/db/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Admin · Sessions" };

export default async function AdminSessionsPage() {
  const [activeMatches, recentMatches, openRooms] = await Promise.all([
    prisma.match.findMany({
      where: { endedAt: null },
      orderBy: { startedAt: "desc" },
      take: 25,
      include: { userA: { select: { username: true } }, userB: { select: { username: true } } },
    }),
    prisma.match.findMany({
      where: { endedAt: { not: null } },
      orderBy: { endedAt: "desc" },
      take: 25,
      include: { userA: { select: { username: true } }, userB: { select: { username: true } } },
    }),
    prisma.room.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { host: { select: { username: true } }, _count: { select: { participants: true } } },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Sessions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live and recent matches and group rooms.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active matches ({activeMatches.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {activeMatches.length === 0 && <p className="text-sm text-muted-foreground">None right now.</p>}
          {activeMatches.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-2.5 text-sm">
              <span>
                @{m.userA.username} ↔ @{m.userB.username}
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{m.channel}</Badge>
                <Badge variant="muted">{m.mode}</Badge>
                <span className="text-xs text-muted-foreground">
                  since {new Date(m.startedAt).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Open rooms ({openRooms.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {openRooms.length === 0 && <p className="text-sm text-muted-foreground">None right now.</p>}
          {openRooms.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-2.5 text-sm">
              <span>{r.title} — hosted by @{r.host.username}</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{r.channel}</Badge>
                <span className="text-xs text-muted-foreground">
                  {r._count.participants}/{r.maxParticipants}
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recently ended matches</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {recentMatches.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-2.5 text-sm">
              <span>
                @{m.userA.username} ↔ @{m.userB.username}
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="muted">{m.endReason}</Badge>
                <span className="text-xs text-muted-foreground">
                  {m.endedAt && new Date(m.endedAt).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
