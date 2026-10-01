import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { createSessionForUser } from "@/lib/auth/session";
import { generateGuestUsername } from "@/lib/auth/guest-name";
import { guestSchema } from "@/lib/validation/auth";
import { rateLimit } from "@/lib/redis/rate-limit";
import { getClientIpHash, getUserAgent } from "@/lib/request";
import { UNDERAGE_MESSAGE, blockAgeRetry, isAgeBlocked, isUnderage } from "@/lib/auth/age-gate";

export async function POST(req: NextRequest) {
  const ipHash = await getClientIpHash();
  const limit = await rateLimit(`guest:${ipHash}`, 10, 15 * 60);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 },
    );
  }

  if (isAgeBlocked(req)) {
    return NextResponse.json({ error: UNDERAGE_MESSAGE }, { status: 403 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = guestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please confirm your birth year to continue." },
      { status: 400 },
    );
  }

  if (isUnderage(parsed.data.birthYear)) {
    return blockAgeRetry(NextResponse.json({ error: UNDERAGE_MESSAGE }, { status: 403 }));
  }

  let username = generateGuestUsername();
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await prisma.user.findUnique({ where: { username } });
    if (!clash) break;
    username = generateGuestUsername();
  }

  const user = await prisma.user.create({
    data: {
      username,
      isGuest: true,
      profile: { create: {} },
      settings: { create: {} },
    },
  });

  const userAgent = await getUserAgent();
  await createSessionForUser(
    { id: user.id, username: user.username, role: user.role, isGuest: true },
    { userAgent, ipHash },
  );

  return NextResponse.json({
    user: { id: user.id, username: user.username, isGuest: true },
  });
}
