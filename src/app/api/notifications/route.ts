import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

export async function GET() {
  const session = await getCurrentUser();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.sub },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.notification.count({ where: { userId: session.sub, readAt: null } }),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}

/** Body `{ id: string }` marks one notification read; an empty body marks all read. */
export async function PATCH(req: NextRequest) {
  const session = await getCurrentUser();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : undefined;

  if (id) {
    await prisma.notification.updateMany({
      where: { id, userId: session.sub, readAt: null },
      data: { readAt: new Date() },
    });
  } else {
    await prisma.notification.updateMany({
      where: { userId: session.sub, readAt: null },
      data: { readAt: new Date() },
    });
  }

  const unreadCount = await prisma.notification.count({
    where: { userId: session.sub, readAt: null },
  });

  return NextResponse.json({ ok: true, unreadCount });
}
