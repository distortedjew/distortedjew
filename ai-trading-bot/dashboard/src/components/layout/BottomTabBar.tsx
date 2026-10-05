import { Ellipsis } from "lucide-react";
import { NavLink, useLocation } from "react-router";
import { cn } from "@/lib/cn";
import { navItem } from "@/lib/constants";
import { activeNavItem, BOTTOM_TAB_KEYS } from "@/components/layout/nav-utils";

/** Phone-only (< 640 px) bottom tab bar: Overview, Markets, Positions, AI, More. */
export function BottomTabBar({ onMore }: { onMore: () => void }) {
  const { pathname } = useLocation();
  const active = activeNavItem(pathname);
  const items = BOTTOM_TAB_KEYS.map((key) => navItem(key));
  const moreActive = active !== undefined && !BOTTOM_TAB_KEYS.includes(active.key as (typeof BOTTOM_TAB_KEYS)[number]);

  const tabClass = (isActive: boolean) =>
    cn(
      "relative flex flex-1 flex-col items-center justify-center gap-1 pt-2 pb-1.5 text-[10.5px] font-medium transition-colors",
      isActive ? "text-fg" : "text-fg-subtle active:text-fg-muted",
    );

  return (
    <nav
      aria-label="Primary"
      className="surface-glass safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line sm:hidden"
    >
      <div className="flex">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === active?.key;
          return (
            <NavLink key={item.key} to={item.path} end={item.path === "/"} className={tabClass(isActive)}>
              {isActive ? <span aria-hidden className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-accent" /> : null}
              <Icon className={cn("size-5", isActive && "text-accent")} strokeWidth={isActive ? 2.1 : 1.8} aria-hidden />
              {item.shortLabel}
            </NavLink>
          );
        })}
        <button type="button" onClick={onMore} className={tabClass(moreActive)}>
          {moreActive ? <span aria-hidden className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-accent" /> : null}
          <Ellipsis className={cn("size-5", moreActive && "text-accent")} aria-hidden />
          {moreActive && active ? active.shortLabel : "More"}
        </button>
      </div>
    </nav>
  );
}
