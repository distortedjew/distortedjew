/**
 * Dark / light theme (class strategy on <html>, dark by default, persisted in localStorage).
 * index.html applies the saved theme before first paint; this module keeps it in sync.
 */
import { useSyncExternalStore } from "react";

export type ThemeMode = "dark" | "light";

const STORAGE_KEY = "tradebot.theme";
const THEME_COLORS: Record<ThemeMode, string> = { dark: "#07090d", light: "#f5f7fb" };

const listeners = new Set<() => void>();

function readInitial(): ThemeMode {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

let current: ThemeMode = readInitial();

function apply(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  // Suppress color transitions for one frame so the whole UI flips at once.
  root.classList.add("theme-switching");
  root.classList.toggle("dark", mode === "dark");
  root.style.colorScheme = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[mode]);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
}

export function getTheme(): ThemeMode {
  return current;
}

export function setTheme(mode: ThemeMode): void {
  if (mode === current) return;
  current = mode;
  apply(mode);
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* private mode: theme still applies for this session */
  }
  for (const listener of [...listeners]) listener();
}

export function toggleTheme(): void {
  setTheme(current === "dark" ? "light" : "dark");
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Current theme; re-renders on change. */
export function useTheme(): {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
} {
  const theme = useSyncExternalStore(subscribe, getTheme, getTheme);
  return { theme, setTheme, toggleTheme };
}
