import type { Metadata } from "next";
import { prisma } from "@/lib/db/client";
import { ReportsTable } from "@/components/admin/reports-table";

export const metadata: Metadata = { title: "Admin · Reports" };

export default async function AdminReportsPage() {
  const reports = await prisma.report.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      reporter: { select: { username: true } },
      reported: { select: { username: true, trustScore: true, status: true } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every report filed on the platform, newest first.
        </p>
      </div>
      <ReportsTable
        reports={reports.map((r) => ({
          id: r.id,
          category: r.category,
          status: r.status,
          description: r.description,
          createdAt: r.createdAt.toISOString(),
          reporterUsername: r.reporter.username,
          reportedUsername: r.reported.username,
          reportedUserId: r.reportedId,
          reportedTrustScore: r.reported.trustScore,
          reportedStatus: r.reported.status,
          aiRiskScore: r.aiRiskScore,
        }))}
      />
    </div>
  );
}
