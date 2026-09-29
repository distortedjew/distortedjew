import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { moderateUserSchema } from "@/lib/validation/admin";
import { applyModerationAction } from "@/lib/moderation/actions";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const session = await getCurrentUser();
  if (!session || (session.role !== "ADMIN" && session.role !== "MODERATOR")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await params;
  const parsed = moderateUserSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Moderators can warn/timeout/suspend; only full admins can ban or unban.
  if ((parsed.data.type === "BAN" || parsed.data.type === "UNBAN") && session.role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can ban or unban accounts." }, { status: 403 });
  }

  const action = await applyModerationAction({
    targetId: userId,
    issuerId: session.sub,
    type: parsed.data.type,
    reason: parsed.data.reason,
    timeoutMinutes: parsed.data.timeoutMinutes,
  });

  return NextResponse.json({ action });
}
