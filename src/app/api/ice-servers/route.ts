import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getIceServers } from "@/lib/webrtc/ice-config";

/**
 * Used by group-room WebRTC (1:1 chat gets its ICE servers inline in the
 * queue:matched payload instead). Gated behind auth so TURN credentials
 * aren't handed out to unauthenticated requests.
 */
export async function GET() {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ iceServers: getIceServers(session.sub) });
}
