import { motion } from "framer-motion";
import { ChevronDown, Ellipsis } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { cn } from "@/lib/cn";
import { NAV_ITEMS, type NavItem } from "@/lib/constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { activeNavItem, COMPACT_NAV_COUNT } from "@/components/layout/nav-utils";

function NavTab({ item, active, className }: { item: NavItem; active: boolean; className?: string }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.path}
      end={item.path === "/"}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-dense font-medium whitespace-nowrap transition-colors",
        active ? "text-fg" : "text-fg-subtle hover:text-fg-muted",
        className,
      )}
    >
      <Icon className={cn("size-[15px] transition-colors", active ? "text-accent" : "")} aria-hidden strokeWidth={2} />
      {item.label}
      {active ? (
        <motion.span
          layoutId="nav-underline"
          aria-hidden
          className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent"
          transition={{ type: "tween", duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
        />
      ) : null}
    </NavLink>
  );
}

/**
 * Main navigation tabs (≥ 1024 px). All ten at ≥ 1280 px; at 1024–1279 px the last three move
 * into a "More" menu.
 */
export function DesktopNav({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const active = activeNavItem(pathname);
  const overflow = NAV_ITEMS.slice(COMPACT_NAV_COUNT);
  const overflowActive = overflow.find((item) => item.key === active?.key);

  return (
    <nav aria-label="Main" className={cn("flex min-w-0 items-center gap-0.5", className)}>
      {NAV_ITEMS.map((item, index) => (
        <NavTab
          key={item.key}
          item={item}
          active={item.key === active?.key}
          className={index >= COMPACT_NAV_COUNT ? "hidden xl:inline-flex" : undefined}
        />
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "relative inline-flex h-10 items-center gap-1.5 rounded-md px-2.5 text-dense font-medium whitespace-nowrap transition-colors xl:hidden",
            overflowActive ? "text-fg" : "text-fg-subtle hover:text-fg-muted data-[state=open]:text-fg",
          )}
        >
          {overflowActive ? (
            <>
              <overflowActive.icon className="size-[15px] text-accent" aria-hidden />
              {overflowActive.label}
            </>
          ) : (
            <>
              <Ellipsis className="size-[15px]" aria-hidden />
              More
            </>
          )}
          <ChevronDown className="size-3 opacity-60" aria-hidden />
          {overflowActive ? (
            <motion.span
              layoutId="nav-underline"
              aria-hidden
              className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent"
              transition={{ type: "tween", duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
            />
          ) : null}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {overflow.map((item) => (
            <DropdownMenuItem key={item.key} icon={item.icon} onSelect={() => navigate(item.path)}>
              <span className="block text-fg">{item.label}</span>
              <span className="block truncate text-xs text-fg-subtle">{item.description}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
