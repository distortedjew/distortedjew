import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { SocketProvider } from "@/hooks/socket-provider";
import { Topbar } from "@/components/app-shell/topbar";
import { MobileTabbar } from "@/components/app-shell/mobile-tabbar";
import { AmbientBackground } from "@/components/landing/ambient-background";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentUser();

  if (!session) {
    return (
      <div className="relative flex min-h-screen flex-col">
        <AmbientBackground />
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
        <AmbientBackground />
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
