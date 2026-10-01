import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { createSessionForUser } from "@/lib/auth/session";
import { registerSchema } from "@/lib/validation/auth";
import { rateLimit } from "@/lib/redis/rate-limit";
import { getClientIpHash, getUserAgent } from "@/lib/request";
import { UNDERAGE_MESSAGE, blockAgeRetry, isAgeBlocked, isUnderage } from "@/lib/auth/age-gate";
import { getCaptchaProvider } from "@/lib/captcha";
import { sendVerificationEmail } from "@/lib/auth/send-verification-email";

export async function POST(req: NextRequest) {
  const ipHash = await getClientIpHash();
  const limit = await rateLimit(`register:${ipHash}`, 5, 15 * 60);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 },
    );
  }

  if (isAgeBlocked(req)) {
    return NextResponse.json({ error: UNDERAGE_MESSAGE }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { username, email, password, birthYear, captchaToken } = parsed.data;

  const captchaOk = await getCaptchaProvider().verify(captchaToken, ipHash);
  if (!captchaOk) {
    return NextResponse.json({ error: "Captcha verification failed. Please try again." }, { status: 400 });
  }

  if (isUnderage(birthYear)) {
    return blockAgeRetry(NextResponse.json({ error: UNDERAGE_MESSAGE }, { status: 403 }));
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

  // Verification is non-blocking — the account already works. Don't let a
  // slow/failed email provider affect the registration response.
  sendVerificationEmail(user.id, user.email!).catch((err) => {
    console.error("[register] failed to send verification email", err);
  });

  return NextResponse.json({
    user: { id: user.id, username: user.username, isGuest: false },
  });
}
