/**
 * Time helpers. `useNow()` is a single shared 1-second clock for relative times
 * ("2s ago", heartbeat age, countdowns): one interval for the whole app, started only
 * while something is subscribed.
 */
import { useSyncExternalStore } from "react";

const TICK_MS = 1_000;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let current = Date.now();

function tick(): void {
  current = Date.now();
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    current = Date.now();
    timer = setInterval(tick, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): number {
  return current;
}

/** Current time in ms, re-rendering the component once per second. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Parse an API timestamp (UTC ISO string), unix seconds, ms or Date into epoch ms. */
export function toMs(value: string | number | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    // Chart times are unix seconds; anything below ~year 2286 in seconds is treated as seconds.
    return value < 1e11 ? value * 1_000 : value;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** Seconds elapsed since `value` (never negative), or null. */
export function secondsSince(value: string | number | Date | null | undefined, now = Date.now()): number | null {
  const ms = toMs(value);
  return ms === null ? null : Math.max(0, (now - ms) / 1_000);
}
