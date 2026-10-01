import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { markFlaggedReviewed } from "@/lib/moderation/flagged";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const session = await getCurrentUser();
  if (!session || (session.role !== "ADMIN" && session.role !== "MODERATOR")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { messageId } = await params;
  const ok = await markFlaggedReviewed(messageId, session.sub);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
