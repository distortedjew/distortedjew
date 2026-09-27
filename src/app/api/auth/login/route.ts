import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionForUser } from "@/lib/auth/session";
import { loginSchema } from "@/lib/validation/auth";
import { rateLimit } from "@/lib/redis/rate-limit";
import { getClientIpHash, getUserAgent } from "@/lib/request";

const MAX_ATTEMPTS = Number(process.env.RATE_LIMIT_LOGIN_ATTEMPTS_PER_15MIN ?? 10);

export async function POST(req: NextRequest) {
  const ipHash = await getClientIpHash();
  const limit = await rateLimit(`login:${ipHash}`, MAX_ATTEMPTS, 15 * 60);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { identifier, password } = parsed.data;

  const user = await prisma.user.findFirst({
    where: { OR: [{ username: identifier }, { email: identifier }] },
  });

  if (!user || !user.passwordHash) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  if (user.status === "BANNED") {
    return NextResponse.json({ error: "This account has been banned." }, { status: 403 });
  }
  if (user.status === "SUSPENDED") {
    return NextResponse.json({ error: "This account is suspended." }, { status: 403 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const userAgent = await getUserAgent();
  await createSessionForUser(
    { id: user.id, username: user.username, role: user.role, isGuest: false },
    { userAgent, ipHash },
  );

  await prisma.user.update({
    where: { id: user.id },
    data: { lastActiveAt: new Date() },
  });

  return NextResponse.json({
    user: { id: user.id, username: user.username, isGuest: false },
  });
}
