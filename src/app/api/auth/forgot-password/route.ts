import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { signResetToken } from "@/lib/auth/reset-token";
import { getEmailProvider } from "@/lib/email";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { rateLimit } from "@/lib/redis/rate-limit";
import { getClientIpHash } from "@/lib/request";
import { APP_NAME } from "@/lib/constants";

const GENERIC_RESPONSE = {
  ok: true,
  message: "If an account exists for that email, we've sent a password reset link.",
};

export async function POST(req: NextRequest) {
  const ipHash = await getClientIpHash();
  const limit = await rateLimit(`forgot-password:${ipHash}`, 5, 15 * 60);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const json = await req.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  // Always return the same generic response whether or not the email
  // matches an account, so this endpoint can't be used to enumerate users.
  const user = await prisma.user.findFirst({ where: { email: parsed.data.email } });
  if (!user || !user.passwordHash || user.isGuest) {
    return NextResponse.json(GENERIC_RESPONSE);
  }

  const token = await signResetToken(user.id, user.passwordHash);
  const resetUrl = `${process.env.APP_URL || "http://localhost:3000"}/reset-password?token=${token}`;

  await getEmailProvider().send({
    to: user.email!,
    subject: `Reset your ${APP_NAME} password`,
    text:
      `Someone requested a password reset for your ${APP_NAME} account.\n\n` +
      `Reset your password: ${resetUrl}\n\n` +
      `This link expires in 30 minutes. If you didn't request this, you can ignore this email.`,
  });

  return NextResponse.json(GENERIC_RESPONSE);
}
