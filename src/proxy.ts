import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth/jwt";

const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "wisp_session";

const PROTECTED_PREFIXES = ["/admin"];
const REQUIRE_ACCOUNT_PREFIXES = ["/settings"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminRoute = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAccountRoute = REQUIRE_ACCOUNT_PREFIXES.some((p) => pathname.startsWith(p));

  if (!isAdminRoute && !isAccountRoute) {
    return NextResponse.next();
  }

  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (isAdminRoute) {
    if (!session || (session.role !== "ADMIN" && session.role !== "MODERATOR")) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  if (isAccountRoute && !session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/settings/:path*"],
};
