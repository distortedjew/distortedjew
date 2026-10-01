import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/redis/rate-limit";
import { buildAccountExport } from "@/lib/account/export";

/**
 * "Download my data": everything we hold about the signed-in account, as a
 * JSON file (right of access / data portability).
 */
export async function GET() {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = await rateLimit(`account-export:${session.sub}`, 5, 60 * 60);
  if (!limit.allowed) {
    return NextResponse.json({ error: "You can download your data 5 times an hour. Try again later." }, { status: 429 });
  }

  const data = await buildAccountExport(session.sub);
  if (!data) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="wisp-data-${date}.json"`,
      "cache-control": "no-store",
    },
  });
}
