import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { redis } from "@/lib/redis/client";

export const dynamic = "force-dynamic";

/**
 * Liveness/readiness probe for Docker and uptime monitors. Reports only
 * up/down per dependency — never versions, hostnames or error details.
 */
export async function GET() {
  const [db, cache] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(
      () => true,
      () => false,
    ),
    redis.ping().then(
      (r) => r === "PONG",
      () => false,
    ),
  ]);
  const ok = db && cache;
  return NextResponse.json(
    { ok, db, redis: cache },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
