import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "./session";

/**
 * Server-side admin/moderator gate. The proxy (src/proxy.ts) already blocks
 * unauthenticated/unauthorized requests to /admin/*, but that is a routing
 * convenience, not the source of truth — every admin page and API route
 * re-checks here too, since client-side/route state is never trusted.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "MODERATOR")) {
    redirect("/login");
  }
  return user;
}

export async function requireFullAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    redirect("/login");
  }
  return user;
}
