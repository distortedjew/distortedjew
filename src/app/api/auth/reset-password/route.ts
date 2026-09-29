import { NextRequest, NextResponse } from "next/server";
import { disconnectUser } from "@/lib/realtime/user-events";
import { prisma } from "@/lib/db/client";
import { decodeResetToken, matchesCurrentPassword } from "@/lib/auth/reset-token";
import { hashPassword } from "@/lib/auth/password";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { rateLimit } from "@/lib/redis/rate-limit";
import { getClientIpHash } from "@/lib/request";

export async function POST(req: NextRequest) {
  const ipHash = await getClientIpHash();
  const limit = await rateLimit(`reset-password:${ipHash}`, 10, 15 * 60);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const json = await req.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { token, password } = parsed.data;

  // The token's signature/expiry/purpose are verified here; whether it's
  // already been spent (or superseded by another password change) is
  // checked separately below via its fingerprint against the user's
  // *current* passwordHash, which requires the DB read.
  const decoded = await decodeResetToken(token);
  if (!decoded) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
  if (!user || !user.passwordHash || !matchesCurrentPassword(decoded, user.passwordHash)) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  const newHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } }),
    // Force sign-out everywhere — a leaked/expired session shouldn't
    // survive a password reset.
    prisma.authSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await disconnectUser(user.id, "Your password was changed. Log in again to keep chatting.");

  return NextResponse.json({ ok: true });
}
