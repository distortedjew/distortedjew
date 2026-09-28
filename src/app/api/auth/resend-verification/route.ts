import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/session";
import { sendVerificationEmail } from "@/lib/auth/send-verification-email";
import { rateLimit } from "@/lib/redis/rate-limit";
import { getClientIpHash } from "@/lib/request";

export async function POST() {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ipHash = await getClientIpHash();
  const limit = await rateLimit(`resend-verification:${session.sub}:${ipHash}`, 3, 15 * 60);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user || !user.email) {
    return NextResponse.json({ error: "No email on file for this account." }, { status: 400 });
  }
  if (user.emailVerified) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  await sendVerificationEmail(user.id, user.email);
  return NextResponse.json({ ok: true, alreadyVerified: false });
}
