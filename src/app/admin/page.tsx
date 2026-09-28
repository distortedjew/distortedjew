import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { redis } from "@/lib/redis/client";
import { mmKeys } from "@/lib/matchmaking/keys";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PartyPopper } from "lucide-react";

export const metadata: Metadata = { title: "Admin Overview" };

export default async function AdminOverviewPage() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    totalUsers,
    onlineNow,
    matchesToday,
    pendingReports,
    activeRooms,
    bannedUsers,
    recentReports,
  ] = await Promise.all([
    prisma.user.count(),
    redis.scard(mmKeys.presence()),
    prisma.match.count({ where: { startedAt: { gte: startOfDay } } }),
    prisma.report.count({ where: { status: "PENDING" } }),
    prisma.room.count({ where: { status: "OPEN" } }),
    prisma.user.count({ where: { status: "BANNED" } }),
    prisma.report.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        reporter: { select: { username: true } },
        reported: { select: { username: true } },
      },
    }),
  ]);

  const stats = [
    { label: "Total users", value: totalUsers },
    { label: "Online now", value: onlineNow },
    { label: "Matches today", value: matchesToday },
    { label: "Pending reports", value: pendingReports, alert: pendingReports > 0 },
    { label: "Open rooms", value: activeRooms },
    { label: "Banned users", value: bannedUsers },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">Live platform health and safety snapshot.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <div className={`font-display text-2xl font-semibold ${s.alert ? "text-destructive" : ""}`}>
                {s.value}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent pending reports</CardTitle>
        </CardHeader>
        <CardContent>
          {recentReports.length === 0 ? (
            <EmptyState icon={PartyPopper} message="Nothing pending. Nice." className="py-6" />
          ) : (
            <div className="flex flex-col gap-2">
              {recentReports.map((r) => (
                <Link
                  key={r.id}
                  href="/admin/reports"
                  className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3 text-sm hover:bg-accent"
                >
                  <span>
                    <strong>@{r.reported.username}</strong> reported by @{r.reporter.username}
                  </span>
                  <Badge variant="destructive">{r.category}</Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
