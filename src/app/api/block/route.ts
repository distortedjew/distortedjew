import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { cacheBlockPair, uncacheBlockPair } from "@/lib/matchmaking/blocklist";

const blockSchema = z.object({ userId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = blockSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.userId === session.sub) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  await prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId: session.sub, blockedId: parsed.data.userId } },
    update: {},
    create: { blockerId: session.sub, blockedId: parsed.data.userId },
  });
  await cacheBlockPair(session.sub, parsed.data.userId);

  // Blocking someone also ends any existing mutual connection between them.
  await prisma.connection.deleteMany({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: session.sub, addresseeId: parsed.data.userId },
        { requesterId: parsed.data.userId, addresseeId: session.sub },
      ],
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = blockSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  await prisma.block.deleteMany({
    where: { blockerId: session.sub, blockedId: parsed.data.userId },
  });
  await uncacheBlockPair(session.sub, parsed.data.userId);

  return NextResponse.json({ ok: true });
}
