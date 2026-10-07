/**
 * Pure helpers for the event stream: turning an event's free-form `data` payload into readable
 * key/value rows (never raw JSON), merging REST pages with live events, and day separators.
 */
import {
  EVENT_TYPE_META,
  EXIT_REASON_META,
  RISK_STATUS_META,
  SIDE_META,
  SIGNAL_META,
  type Meta,
} from "@/lib/constants";
import {
  DASH,
  formatDateTime,
  formatDayLabel,
  formatDuration,
  formatInt,
  formatMb,
  formatMs,
  formatNumber,
  formatPct,
  formatPnl,
  formatPrice,
  formatR,
  formatSize,
  formatUsd,
  isNum,
  toneOf,
} from "@/lib/format";
import { toMs } from "@/lib/time";
import type { Event, EventType, Tone } from "@/types";

// ---------------------------------------------------------------- data → key/value rows

export interface DataRow {
  key: string;
  label: string;
  /** One value, or a list (reasons, symbols…) rendered as bullets. */
  value: string | string[];
  tone?: Tone;
  /** Identifier-like values (ids, model names) render in mono. */
  mono?: boolean;
}

const LABELS: Record<string, string> = {
  pnl: "P&L",
  pnl_pct: "P&L %",
  realized_pnl: "Realized P&L",
  unrealized_pnl: "Unrealized P&L",
  analysis_id: "Decision",
  position_id: "Position",
  trade_id: "Trade",
  sl: "Stop loss",
  tp: "Take profit",
  rr: "Risk / reward",
  risk_reward: "Risk / reward",
  r_multiple: "R multiple",
  ai: "AI",
  id: "ID",
  url: "URL",
  api: "API",
  usd: "USD",
  pct: "%",
  mtf: "MTF",
};

/** "exit_price" → "Exit price", "pnl_pct" → "P&L %", "latency_ms" → "Latency". */
export function humanizeKey(key: string): string {
  if (LABELS[key]) return LABELS[key];
  const parts = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .split(/[_\s.-]+/)
    .filter(Boolean)
    .map((p) => p.toLowerCase());
  // Units are conveyed by the formatted value, so drop unit suffixes from the label.
  while (parts.length > 1 && ["ms", "sec", "usd", "bps", "mb"].includes(parts[parts.length - 1])) parts.pop();
  const words = parts.map((p) => LABELS[p] ?? p);
  const text = words.join(" ").replace(/\s+%/g, " %");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const PRICE_KEYS = new Set([
  "price",
  "entry",
  "exit",
  "open",
  "high",
  "low",
  "close",
  "stop_loss",
  "take_profit",
  "invalidation",
]);
const MONEY_KEYS = new Set([
  "notional",
  "equity",
  "balance",
  "cash",
  "fees",
  "fee",
  "cost",
  "current_usd",
  "limit_usd",
  "exposure",
  "daily_loss",
  "risk_amount",
]);
const PNL_KEYS = new Set(["pnl", "realized_pnl", "unrealized_pnl", "daily_pnl", "net_profit"]);
const PERCENT_KEYS = new Set(["confidence", "win_rate", "progress", "utilization_pct"]);
const ID_KEYS = /(^|_)(id|ids|model|version|component|pid)$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function enumLabel(key: string, value: string): { text: string; tone?: Tone } | null {
  const maps: Record<string, Record<string, Meta>> = {
    side: SIDE_META,
    signal: SIGNAL_META,
    exit_reason: EXIT_REASON_META,
    status: RISK_STATUS_META,
    risk_status: RISK_STATUS_META,
    type: EVENT_TYPE_META,
  };
  const meta = maps[key]?.[value];
  return meta
    ? { text: meta.label, tone: meta.tone === "neutral" || meta.tone === "muted" ? undefined : meta.tone }
    : null;
}

function formatNumberFor(key: string, value: number): { text: string; tone?: Tone } {
  const k = key.toLowerCase();
  if (PNL_KEYS.has(k)) return { text: formatPnl(value), tone: toneOf(value) };
  if (k === "pnl_pct" || k === "change_pct" || k === "return_pct") {
    return { text: formatPct(value, { signed: true }), tone: toneOf(value) };
  }
  if (k.endsWith("_pct") || PERCENT_KEYS.has(k))
    return { text: formatPct(value, { decimals: value % 1 === 0 ? 0 : 1 }) };
  if (k === "r_multiple" || k === "r") return { text: formatR(value), tone: toneOf(value) };
  if (k === "rr" || k === "risk_reward") return { text: formatNumber(value, 2) };
  if (PRICE_KEYS.has(k) || k.endsWith("_price")) return { text: formatPrice(value) };
  if (MONEY_KEYS.has(k) || k.endsWith("_usd") || k.endsWith("_usdt")) return { text: formatUsd(value) };
  if (k.endsWith("_ms")) return { text: formatMs(value) };
  if (k.endsWith("_mb")) return { text: formatMb(value) };
  if (k.endsWith("_sec") || k.endsWith("_seconds")) return { text: formatDuration(value) };
  if (k.endsWith("_minutes")) return { text: formatDuration(value * 60) };
  if (k === "size" || k === "qty" || k === "quantity") return { text: formatSize(value) };
  if (k.endsWith("_bps")) return { text: `${formatNumber(value, Number.isInteger(value) ? 0 : 1)} bps` };
  if (Number.isInteger(value)) return { text: formatInt(value) };
  return {
    text: formatNumber(value, Math.abs(value) >= 100 ? 2 : 4).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1"),
  };
}

function scalar(key: string, value: unknown): { text: string; tone?: Tone; mono?: boolean } {
  if (value === null || value === undefined || value === "") return { text: DASH };
  if (typeof value === "boolean") return { text: value ? "Yes" : "No" };
  if (typeof value === "number") return isNum(value) ? formatNumberFor(key, value) : { text: DASH };
  if (typeof value === "string") {
    const asEnum = enumLabel(key, value);
    if (asEnum) return asEnum;
    if (ISO_DATE.test(value) && toMs(value) !== null) return { text: formatDateTime(value) };
    return { text: value, mono: ID_KEYS.test(key) || /^(pos|dec|bt)_[0-9a-f]+$/.test(value) };
  }
  return { text: String(value) };
}

/**
 * Readable rows for an event's `data`. Nested objects flatten into "Parent · child" rows; arrays of
 * scalars become lists; anything unexpected still renders as text, never as a JSON blob.
 */
export function eventDataRows(data: Record<string, unknown> | null | undefined, prefix = ""): DataRow[] {
  if (!data) return [];
  const rows: DataRow[] = [];
  for (const [key, raw] of Object.entries(data)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const label = prefix
      ? `${humanizeKey(prefix.split(".").pop() ?? prefix)} · ${humanizeKey(key)}`
      : humanizeKey(key);
    if (Array.isArray(raw)) {
      if (raw.length === 0) {
        rows.push({ key: path, label, value: "None" });
        continue;
      }
      const items = raw.map((item) =>
        item !== null && typeof item === "object"
          ? Object.entries(item as Record<string, unknown>)
              .map(([k, v]) => `${humanizeKey(k)}: ${scalar(k, v).text}`)
              .join(" · ")
          : scalar(key, item).text,
      );
      rows.push({ key: path, label, value: items });
    } else if (raw !== null && typeof raw === "object") {
      rows.push(...eventDataRows(raw as Record<string, unknown>, path));
    } else {
      const { text, tone, mono } = scalar(key, raw);
      rows.push({ key: path, label, value: text, tone, mono });
    }
  }
  return rows;
}

// ---------------------------------------------------------------- merging & grouping

/** Union of event lists, deduplicated by id, newest first. */
export function mergeEventLists(...lists: (readonly Event[] | undefined)[]): Event[] {
  const byId = new Map<number, Event>();
  for (const list of lists)
    for (const event of list ?? []) if (!byId.has(event.id)) byId.set(event.id, event);
  return [...byId.values()].sort((a, b) => b.id - a.id);
}

export type StreamItem =
  { kind: "day"; key: string; label: string } | { kind: "event"; key: string; event: Event };

/** Local calendar day key ("2026-10-05") for grouping. */
export function dayKey(ts: string): string {
  const d = new Date(toMs(ts) ?? 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Insert a day separator wherever the local day changes (newest first). `previousDay` is the day of
 * the item rendered just before this list (the previous page), so a page boundary inside one day
 * doesn't repeat the header. Today's header is omitted when `omitToday` (the compact card).
 */
export function withDaySeparators(
  events: readonly Event[],
  opts: { previousDay?: string | null; now?: number; omitToday?: boolean } = {},
): StreamItem[] {
  const now = opts.now ?? Date.now();
  const today = dayKey(new Date(now).toISOString());
  const out: StreamItem[] = [];
  let current = opts.previousDay ?? null;
  for (const event of events) {
    const day = dayKey(event.ts);
    if (day !== current) {
      current = day;
      if (!(opts.omitToday && day === today && out.length === 0 && !opts.previousDay)) {
        out.push({ kind: "day", key: `day-${day}`, label: formatDayLabel(event.ts, now) });
      }
    }
    out.push({ kind: "event", key: `ev-${event.id}`, event });
  }
  return out;
}

// ---------------------------------------------------------------- type groups

export const ALL_EVENT_TYPES = Object.keys(EVENT_TYPE_META) as EventType[];

/** Quick scopes for the compact stream (each a fixed type set). */
export const EVENT_SCOPES = {
  all: { label: "All", types: [] as EventType[] },
  signals: {
    label: "Signals",
    types: ["AI_ANALYSIS", "TRADE_SIGNAL", "RISK_CHECK"] as EventType[],
  },
  trades: {
    label: "Trades",
    types: ["TRADE_EXECUTED", "TRADE_REJECTED", "TRADE_CLOSED", "STOP_LOSS", "TAKE_PROFIT"] as EventType[],
  },
  alerts: {
    label: "Alerts",
    types: ["RISK_WARNING", "API_ERROR", "SYSTEM_WARNING", "TRADE_REJECTED", "STOP_LOSS"] as EventType[],
  },
} as const;
export type EventScope = keyof typeof EVENT_SCOPES;

/**
 * The `types` filter to send: an explicit selection wins; otherwise everything, minus
 * MARKET_UPDATE when market updates are hidden. `undefined` = no filter.
 */
export function effectiveTypes(selected: readonly EventType[], hideMarket: boolean): EventType[] | undefined {
  if (selected.length > 0) {
    const out = hideMarket ? selected.filter((t) => t !== "MARKET_UPDATE") : [...selected];
    return out.length ? out : [...selected];
  }
  return hideMarket ? ALL_EVENT_TYPES.filter((t) => t !== "MARKET_UPDATE") : undefined;
}

/** Parse "AI_ANALYSIS,TRADE_SIGNAL" from the URL, dropping unknown values. */
export function parseTypes(raw: string): EventType[] {
  if (!raw) return [];
  const known = new Set<string>(ALL_EVENT_TYPES);
  return [...new Set(raw.split(",").map((s) => s.trim()))].filter((s): s is EventType => known.has(s));
}
