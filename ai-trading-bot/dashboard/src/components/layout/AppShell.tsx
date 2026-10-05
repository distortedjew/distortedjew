import { motion } from "framer-motion";
import { Suspense, useEffect, useState } from "react";
import { useLocation, useMatches, useOutlet } from "react-router";
import { useTradingMode } from "@/hooks/live";
import { motionPresets } from "@/lib/motion";
import { Toaster } from "@/components/ui/Toaster";
import { BottomTabBar } from "@/components/layout/BottomTabBar";
import { ConnectionBanner } from "@/components/layout/ConnectionBanner";
import { LiveTradingBanner } from "@/components/layout/LiveTradingBanner";
import { MobileNav } from "@/components/layout/MobileNav";
import { NotificationToaster } from "@/components/layout/NotificationToaster";
import { PageFallback } from "@/components/layout/PageFallback";
import { TopBar } from "@/components/layout/TopBar";

interface RouteHandle {
  title?: string;
}

/** document.title from the deepest route `handle.title`. */
function useRouteTitle(): void {
  const matches = useMatches();
  const title = [...matches].reverse().find((m) => (m.handle as RouteHandle | undefined)?.title)?.handle as
    | RouteHandle
    | undefined;
  const text = title?.title;
  useEffect(() => {
    document.title = text ? `${text} · AI Trading Bot` : "AI Trading Bot";
  }, [text]);
}

/** Page enter transition (fade + slight rise). Pages load lazily behind a skeleton. */
function AnimatedOutlet() {
  const location = useLocation();
  const outlet = useOutlet();
  return (
    <motion.div key={location.pathname} {...motionPresets.page}>
      <Suspense fallback={<PageFallback />}>{outlet}</Suspense>
    </motion.div>
  );
}

/** Layout for every route: banners, sticky top bar, page area, phone tab bar, toasts. */
export function AppShell() {
  const mode = useTradingMode();
  const [menuOpen, setMenuOpen] = useState(false);
  useRouteTitle();

  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[520px] bg-(image:--glow-top)" />
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-accent-solid px-3 py-2 text-sm text-accent-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      {mode === "live" ? <LiveTradingBanner /> : null}
      <TopBar onOpenMenu={() => setMenuOpen(true)} />
      <ConnectionBanner />
      <main
        id="main"
        className="relative mx-auto w-full max-w-[1760px] flex-1 px-3 pt-4 pb-24 sm:px-6 sm:pt-5 sm:pb-10 lg:px-8 lg:pt-6"
      >
        <AnimatedOutlet />
      </main>
      <BottomTabBar onMore={() => setMenuOpen(true)} />
      <MobileNav open={menuOpen} onOpenChange={setMenuOpen} />
      <NotificationToaster />
      <Toaster />
    </div>
  );
}
