import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { createSessionForUser } from "@/lib/auth/session";
import { registerSchema } from "@/lib/validation/auth";
import { rateLimit } from "@/lib/redis/rate-limit";
import { getClientIpHash, getUserAgent } from "@/lib/request";
import { MINIMUM_AGE } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const ipHash = await getClientIpHash();
  const limit = await rateLimit(`register:${ipHash}`, 5, 15 * 60);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { username, email, password, birthYear } = parsed.data;

  const age = new Date().getFullYear() - birthYear;
  if (age < MINIMUM_AGE) {
    return NextResponse.json(
      { error: `You must be at least ${MINIMUM_AGE} years old to join Wisp.` },
      { status: 403 },
    );
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Username or email is already taken." },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      username,
      email,
      passwordHash,
      isGuest: false,
      profile: { create: {} },
      settings: { create: {} },
    },
  });

  const userAgent = await getUserAgent();
  await createSessionForUser(
    { id: user.id, username: user.username, role: user.role, isGuest: false },
    { userAgent, ipHash },
  );

  return NextResponse.json({
    user: { id: user.id, username: user.username, isGuest: false },
  });
}
