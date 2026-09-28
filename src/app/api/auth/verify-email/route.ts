import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { decodeVerifyToken } from "@/lib/auth/verify-token";
import { rateLimit } from "@/lib/redis/rate-limit";
import { getClientIpHash } from "@/lib/request";

export async function POST(req: NextRequest) {
  const ipHash = await getClientIpHash();
  const limit = await rateLimit(`verify-email:${ipHash}`, 20, 15 * 60);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const json = await req.json().catch(() => null);
  const token = typeof json?.token === "string" ? json.token : null;
  if (!token) {
    return NextResponse.json({ error: "Missing verification token." }, { status: 400 });
  }

  const decoded = await decodeVerifyToken(token);
  if (!decoded) {
    return NextResponse.json({ error: "This verification link is invalid or has expired." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
  if (!user || user.email !== decoded.email) {
    return NextResponse.json({ error: "This verification link is invalid or has expired." }, { status: 400 });
  }

  // Already verified — treat a repeat click as a success, not an error.
  if (!user.emailVerified) {
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
  }

  return NextResponse.json({ ok: true });
}
