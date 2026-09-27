import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { connectionId } = await params;

  const connection = await prisma.connection.findUnique({ where: { id: connectionId } });
  if (!connection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (connection.requesterId !== session.sub && connection.addresseeId !== session.sub) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.connection.delete({ where: { id: connectionId } });

  return NextResponse.json({ ok: true });
}
