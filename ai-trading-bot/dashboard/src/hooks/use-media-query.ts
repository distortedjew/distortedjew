import { useSyncExternalStore } from "react";

/** Tailwind breakpoints in px (index.css adds xs = 480 and 3xl = 1792). */
export const BREAKPOINTS = { xs: 480, sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1536, "3xl": 1792 } as const;
export type Breakpoint = keyof typeof BREAKPOINTS;

function supported(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

/** Live `matchMedia(query).matches`. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (!supported()) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => (supported() ? window.matchMedia(query).matches : false),
    () => false,
  );
}

/** True when the viewport is at least `bp` wide (same as Tailwind's `bp:` prefix). */
export function useBreakpoint(bp: Breakpoint): boolean {
  return useMediaQuery(`(min-width: ${BREAKPOINTS[bp]}px)`);
}

/** Phones (< 640 px). */
export function useIsMobile(): boolean {
  return !useBreakpoint("sm");
}
