import { ChevronRight } from "lucide-react";
import { NavLink, useLocation } from "react-router";
import { useTradingMode } from "@/hooks/live";
import { cn } from "@/lib/cn";
import { NAV_ITEMS } from "@/lib/constants";
import { Drawer } from "@/components/ui/Drawer";
import { ConnectedBotStatusPill } from "@/components/layout/BotStatusPill";
import { ConnectionIndicator } from "@/components/layout/ConnectionIndicator";
import { activeNavItem } from "@/components/layout/nav-utils";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { TradingModeBadge } from "@/components/layout/TradingModeBadge";

/** Full navigation sheet for < 1024 px (hamburger and the phone "More" tab). */
export function MobileNav({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { pathname } = useLocation();
  const active = activeNavItem(pathname);
  const mode = useTradingMode();

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      side="left"
      size="sm"
      title="AI TRADING BOT"
      description="Monitoring terminal"
      headerExtra={
        <div className="flex flex-wrap items-center gap-2">
          <TradingModeBadge mode={mode} />
          <ConnectedBotStatusPill />
          <ConnectionIndicator />
        </div>
      }
      bodyClassName="px-2 py-2"
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="text-xs text-fg-subtle">Appearance</span>
          <ThemeToggle />
        </div>
      }
    >
      <nav aria-label="Main">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === active?.key;
            return (
              <li key={item.key}>
                <NavLink
                  to={item.path}
                  end={item.path === "/"}
                  onClick={() => onOpenChange(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
                    isActive ? "bg-accent/10 text-fg" : "text-fg-muted hover:bg-fg/[0.05] hover:text-fg",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
                      isActive ? "bg-accent/15 text-accent ring-accent/25" : "bg-fg/[0.04] ring-line",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{item.label}</span>
                    <span className="block truncate text-xs text-fg-subtle">{item.description}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-fg-subtle/60" aria-hidden />
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </Drawer>
  );
}
