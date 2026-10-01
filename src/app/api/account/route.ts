import { NextResponse } from "next/server";
import { disconnectUser } from "@/lib/realtime/user-events";
import { getCurrentUser, destroySession } from "@/lib/auth/session";
import { anonymizeUser } from "@/lib/account/anonymize";

/**
 * Deletes the signed-in account: identifying data goes now; messages and
 * moderation records expire on the normal retention schedule (see
 * src/lib/retention.ts and the Privacy Policy).
 */
export async function DELETE() {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await anonymizeUser(session.sub);
  await destroySession();
  await disconnectUser(session.sub, "Your account has been deleted.");

  return NextResponse.json({ ok: true });
}
