import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_OVERLAYS, isOverlayKey, parseOverlayList, type OverlayKey } from "./chart-model";

/**
 * Chart display preferences persisted in localStorage (shared by every chart on the page and
 * across tabs): which overlays are visible, volume, AI levels and marker labels.
 */
export interface ChartPrefs {
  overlays: OverlayKey[];
  volume: boolean;
  aiLevels: boolean;
}

const KEY = "tradebot.chart.prefs.v1";
const DEFAULTS: ChartPrefs = { overlays: [...DEFAULT_OVERLAYS], volume: true, aiLevels: true };

export function parsePrefs(raw: string | null): ChartPrefs {
  if (!raw) return DEFAULTS;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof ChartPrefs, unknown>>;
    const overlays = parseOverlayList(JSON.stringify(parsed.overlays ?? null));
    return {
      overlays: overlays ?? DEFAULTS.overlays,
      volume: typeof parsed.volume === "boolean" ? parsed.volume : DEFAULTS.volume,
      aiLevels: typeof parsed.aiLevels === "boolean" ? parsed.aiLevels : DEFAULTS.aiLevels,
    };
  } catch {
    return DEFAULTS;
  }
}

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached: ChartPrefs = DEFAULTS;

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function read(): ChartPrefs {
  const raw = storage()?.getItem(KEY) ?? null;
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parsePrefs(raw);
  }
  return cached;
}

function write(next: ChartPrefs): void {
  try {
    storage()?.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage full / disabled: keep the in-memory value
    cachedRaw = JSON.stringify(next);
    cached = next;
  }
  for (const l of [...listeners]) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useChartPrefs() {
  const prefs = useSyncExternalStore(subscribe, read, () => DEFAULTS);
  const toggleOverlay = useCallback((key: OverlayKey) => {
    if (!isOverlayKey(key)) return;
    const current = read();
    const has = current.overlays.includes(key);
    write({
      ...current,
      overlays: has ? current.overlays.filter((k) => k !== key) : [...current.overlays, key],
    });
  }, []);
  const setPref = useCallback(<K extends "volume" | "aiLevels">(key: K, value: boolean) => {
    write({ ...read(), [key]: value });
  }, []);
  const reset = useCallback(() => write(DEFAULTS), []);
  return { prefs, toggleOverlay, setPref, reset };
}
