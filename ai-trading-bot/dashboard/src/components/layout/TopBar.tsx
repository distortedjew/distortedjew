import { Menu } from "lucide-react";
import { useTradingMode } from "@/hooks/live";
import { useBreakpoint } from "@/hooks/use-media-query";
import { cn } from "@/lib/cn";
import { IconButton } from "@/components/ui/IconButton";
import { Separator } from "@/components/ui/Separator";
import { BrandMark } from "@/components/layout/BrandMark";
import { ConnectedBotStatusPill } from "@/components/layout/BotStatusPill";
import { ConnectionIndicator } from "@/components/layout/ConnectionIndicator";
import { DesktopNav } from "@/components/layout/DesktopNav";
import { NotificationCenter } from "@/components/layout/NotificationCenter";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { TickerStrip } from "@/components/layout/TickerStrip";
import { TradingModeBadge } from "@/components/layout/TradingModeBadge";

/**
 * Sticky glass header.
 * Row 1: brand · connection · bot status · trading mode · notifications · theme.
 * Row 2 (≥ 1024 px): navigation tabs (+ live tickers ≥ 1536 px).
 * Below 1024 px the tabs move into the hamburger sheet; the mode badge and bot status stay visible.
 */
export function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const mode = useTradingMode();
  const isTablet = useBreakpoint("sm");
  const isDesktop = useBreakpoint("lg");

  return (
    <header className="surface-glass sticky top-0 z-40 border-b border-line">
      <div className="mx-auto max-w-[1760px] px-3 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center gap-2 sm:gap-3 lg:h-[52px]">
          <IconButton icon={Menu} label="Open navigation" onClick={onOpenMenu} className="-ml-1 lg:hidden" tooltip={false} />
          <BrandMark compact={!isDesktop} />
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <ConnectionIndicator compact={!isTablet} className={cn(!isTablet && "px-1")} />
            <ConnectedBotStatusPill compact={!isTablet} />
            <TradingModeBadge mode={mode} compact={!isTablet} />
            <Separator orientation="vertical" className="mx-0.5 hidden h-5 sm:block" />
            <NotificationCenter />
            <ThemeToggle className="hidden sm:inline-flex" />
          </div>
        </div>
        {isDesktop ? (
          <div className="-mt-0.5 flex h-10 items-center justify-between gap-6">
            <DesktopNav />
            <TickerStrip className="hidden 2xl:flex" />
          </div>
        ) : null}
      </div>
    </header>
  );
}
