import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { resolveReportSchema } from "@/lib/validation/admin";
import { applyModerationAction } from "@/lib/moderation/actions";
import { moderationDenial } from "@/lib/moderation/permissions";

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
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (parsed.data.action !== "DISMISS") {
    const target = await prisma.user.findUnique({ where: { id: report.reportedId }, select: { id: true, role: true } });
    if (!target) return NextResponse.json({ error: "The reported account no longer exists." }, { status: 404 });
    const denial = moderationDenial({ id: session.sub, role: session.role }, target, parsed.data.action);
    if (denial) return NextResponse.json({ error: denial }, { status: 403 });

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
