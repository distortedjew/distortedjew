import { NextResponse } from "next/server";
import { disconnectUser } from "@/lib/realtime/user-events";
import { nanoid } from "nanoid";
import { getCurrentUser, destroySession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

/**
 * Account deletion anonymizes rather than hard-deletes: historical
 * messages/moderation records are retained for safety/legal purposes (see
 * Privacy Policy) but are disassociated from any identifying information.
 */
export async function DELETE() {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const anonymizedUsername = `deleted_${nanoid(10)}`;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: session.sub },
      data: {
        username: anonymizedUsername,
        email: null,
        passwordHash: null,
        status: "DELETED",
      },
    }),
    prisma.profile.update({
      where: { userId: session.sub },
      data: {
        displayName: null,
        avatarUrl: null,
        bio: null,
        interests: [],
        languages: [],
        country: null,
        visibility: "PRIVATE",
      },
    }),
    prisma.authSession.updateMany({
      where: { userId: session.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await destroySession();
  await disconnectUser(session.sub, "Your account has been deleted.");

  return NextResponse.json({ ok: true });
}
