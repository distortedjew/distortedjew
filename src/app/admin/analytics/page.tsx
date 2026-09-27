import type { Metadata } from "next";
import { prisma } from "@/lib/db/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Admin · Analytics" };

async function getDailyMatchCounts() {
  const days: { label: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - i);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const count = await prisma.match.count({
      where: { startedAt: { gte: start, lt: end } },
    });
    days.push({ label: start.toLocaleDateString(undefined, { weekday: "short" }), count });
  }
  return days;
}

export default async function AdminAnalyticsPage() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [eventCounts, dailyMatches, totalEvents, connectionsCreated, gamesPlayed] = await Promise.all([
    prisma.analyticsEvent.groupBy({
      by: ["name"],
      _count: { _all: true },
      where: { createdAt: { gte: sevenDaysAgo } },
      orderBy: { _count: { name: "desc" } },
      take: 10,
    }),
    getDailyMatchCounts(),
    prisma.analyticsEvent.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.analyticsEvent.count({ where: { name: "connection_created", createdAt: { gte: sevenDaysAgo } } }),
    prisma.gameSession.count({ where: { status: "COMPLETED", startedAt: { gte: sevenDaysAgo } } }),
  ]);

  const maxDaily = Math.max(1, ...dailyMatches.map((d) => d.count));
  const maxEvent = Math.max(1, ...eventCounts.map((e) => e._count._all));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">Anonymized product activity, last 7 days.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="font-display text-2xl font-semibold">{totalEvents}</div>
            <div className="mt-1 text-xs text-muted-foreground">Events tracked</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="font-display text-2xl font-semibold">{connectionsCreated}</div>
            <div className="mt-1 text-xs text-muted-foreground">Connections made</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="font-display text-2xl font-semibold">{gamesPlayed}</div>
            <div className="mt-1 text-xs text-muted-foreground">Games completed</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Matches per day</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-40 items-end gap-3">
            {dailyMatches.map((d) => (
              <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-32 w-full items-end">
                  <div
                    className="w-full rounded-t-md bg-primary"
                    style={{ height: `${Math.max(4, (d.count / maxDaily) * 100)}%` }}
                    title={`${d.count} matches`}
                  />
                </div>
                <span className="text-xs text-muted-foreground">{d.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top events</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {eventCounts.length === 0 && <p className="text-sm text-muted-foreground">No events yet.</p>}
          {eventCounts.map((e) => (
            <div key={e.name} className="flex items-center gap-3">
              <span className="w-40 shrink-0 truncate text-sm">{e.name}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(e._count._all / maxEvent) * 100}%` }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">{e._count._all}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
