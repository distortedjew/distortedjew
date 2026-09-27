import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { createSessionForUser } from "@/lib/auth/session";
import { generateGuestUsername } from "@/lib/auth/guest-name";
import { guestSchema } from "@/lib/validation/auth";
import { rateLimit } from "@/lib/redis/rate-limit";
import { getClientIpHash, getUserAgent } from "@/lib/request";
import { MINIMUM_AGE } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const ipHash = await getClientIpHash();
  const limit = await rateLimit(`guest:${ipHash}`, 10, 15 * 60);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 },
    );
  }

  const json = await req.json().catch(() => ({}));
  const parsed = guestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please confirm your birth year to continue." },
      { status: 400 },
    );
  }

  const age = new Date().getFullYear() - parsed.data.birthYear;
  if (age < MINIMUM_AGE) {
    return NextResponse.json(
      { error: `You must be at least ${MINIMUM_AGE} years old to join Wisp.` },
      { status: 403 },
    );
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
