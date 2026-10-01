import type { NextRequest, NextResponse } from "next/server";
import { MINIMUM_AGE } from "@/lib/constants";

/**
 * Neutral age screening: once someone enters a birth year under the minimum
 * age, this browser can't immediately go back and try an older year. We
 * store only the fact that the check failed, never the year itself.
 */
export const AGE_BLOCK_COOKIE = "wisp_age_check";
const BLOCK_SECONDS = 24 * 60 * 60;

export const UNDERAGE_MESSAGE = `You must be at least ${MINIMUM_AGE} years old to use Wisp.`;

export function isAgeBlocked(req: NextRequest): boolean {
  return req.cookies.get(AGE_BLOCK_COOKIE)?.value === "1";
}

export function isUnderage(birthYear: number, now: Date = new Date()): boolean {
  return now.getFullYear() - birthYear < MINIMUM_AGE;
}

export function blockAgeRetry(res: NextResponse): NextResponse {
  res.cookies.set(AGE_BLOCK_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: BLOCK_SECONDS,
  });
  return res;
}
