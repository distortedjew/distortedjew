import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { resolveReportSchema } from "@/lib/validation/admin";
import { applyModerationAction } from "@/lib/moderation/actions";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const session = await getCurrentUser();
  if (!session || (session.role !== "ADMIN" && session.role !== "MODERATOR")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { reportId } = await params;
  const parsed = resolveReportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (parsed.data.action !== "DISMISS") {
    await applyModerationAction({
      targetId: report.reportedId,
      issuerId: session.sub,
      type: parsed.data.action,
      reason: parsed.data.reason || `Resolved from report ${report.id} (${report.category})`,
      reportId: report.id,
      timeoutMinutes: parsed.data.timeoutMinutes,
    });
  }

  const updated = await prisma.report.update({
    where: { id: reportId },
    data: {
      status: parsed.data.action === "DISMISS" ? "DISMISSED" : "ACTIONED",
      resolvedAt: new Date(),
      resolvedById: session.sub,
    },
  });

  return NextResponse.json({ report: updated });
}
