import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { createReportSchema } from "@/lib/validation/report";
import { rateLimit } from "@/lib/redis/rate-limit";
import { trackEvent } from "@/lib/analytics/track";

export async function POST(req: NextRequest) {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = await rateLimit(`report:${session.sub}`, 10, 60 * 10);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many reports. Try again later." }, { status: 429 });
  }

  const parsed = createReportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.reportedId === session.sub) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const report = await prisma.report.create({
    data: {
      reporterId: session.sub,
      reportedId: parsed.data.reportedId,
      category: parsed.data.category,
      description: parsed.data.description,
      matchId: parsed.data.matchId,
      roomId: parsed.data.roomId,
    },
  });

  trackEvent(session.sub, "report_created", { category: parsed.data.category });

  return NextResponse.json({ report: { id: report.id } });
}
