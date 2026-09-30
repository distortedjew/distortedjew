import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { SocketProvider } from "@/hooks/socket-provider";
import { Topbar } from "@/components/app-shell/topbar";
import { MobileTabbar } from "@/components/app-shell/mobile-tabbar";

// Chat, rooms and account pages are for signed-in people and change per
// user; keep them out of search results (public pages opt back in).
export const metadata: Metadata = { robots: NOINDEX };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentUser();

  if (!session) {
    return (
      <div className="relative flex min-h-screen flex-col">
        <main className="flex-1">{children}</main>
      </div>
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: {
      username: true,
      isGuest: true,
      role: true,
      level: true,
      profile: { select: { displayName: true, avatarUrl: true } },
    },
  });

  return (
    <SocketProvider enabled>
      <div className="relative flex min-h-screen flex-col">
        {user && (
          <Topbar
            user={{
              username: user.username,
              displayName: user.profile?.displayName ?? null,
              avatarUrl: user.profile?.avatarUrl ?? null,
              level: user.level,
              isGuest: user.isGuest,
              role: user.role,
            }}
          />
        )}
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
        <MobileTabbar />
      </div>
    </SocketProvider>
  );
}
