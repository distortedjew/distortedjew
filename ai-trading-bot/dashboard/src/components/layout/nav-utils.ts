import { NAV_ITEMS, type NavItem } from "@/lib/constants";

/** The nav item for a pathname ("/" only matches Overview exactly). */
export function activeNavItem(pathname: string): NavItem | undefined {
  if (pathname === "/" || pathname === "") return NAV_ITEMS[0];
  return NAV_ITEMS.find((item) => item.path !== "/" && (pathname === item.path || pathname.startsWith(`${item.path}/`)));
}

/** Items shown inline at 1024–1279 px; the rest go to the "More" menu. */
export const COMPACT_NAV_COUNT = 7;

/** Phone bottom bar: the four most used destinations (+ "More"). */
export const BOTTOM_TAB_KEYS = ["overview", "markets", "positions", "ai"] as const;
