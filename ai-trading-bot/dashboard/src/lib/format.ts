/**
 * Formatting — the only place numbers, money, percents and times become strings.
 *
 * Units (from the API contract): money is USDT (shown as $); every *_pct, confidence,
 * win_rate, *_accuracy, utilization_pct and progress value is ALREADY in percent units
 * (4.82 → "4.82%", never multiply by 100); datetimes are UTC ISO strings; chart times
 * are unix seconds. Missing values (null / undefined / NaN) render as an em dash "—".
 * Negative numbers use the typographic minus "−" (U+2212).
 */
import { toMs } from "@/lib/time";

export const DASH = "—";
export const MINUS = "−";

type Num = number | null | undefined;

export function isNum(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const formatters = new Map<string, Intl.NumberFormat>();

function numberFormat(minimumFractionDigits: number, maximumFractionDigits: number, extra?: Intl.NumberFormatOptions) {
  const key = `${minimumFractionDigits}|${maximumFractionDigits}|${extra ? JSON.stringify(extra) : ""}`;
  let nf = formatters.get(key);
  if (!nf) {
    nf = new Intl.NumberFormat("en-US", { minimumFractionDigits, maximumFractionDigits, ...extra });
    formatters.set(key, nf);
  }
  return nf;
}

/** Round to `decimals` and drop negative zero, so −0.001 → 0. */
function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) || rounded === 0 ? 0 : rounded;
}

/** "1,234.57" for |value| with fixed decimals (no sign). */
function abs(value: number, minDecimals: number, maxDecimals = minDecimals): string {
  return numberFormat(minDecimals, maxDecimals).format(Math.abs(value));
}

function sign(value: number, signed: boolean): string {
  if (value < 0) return MINUS;
  if (signed && value > 0) return "+";
  return "";
}

// ---------------------------------------------------------------- numbers

/** Plain number with thousands separators: formatNumber(1234.567) → "1,234.57". */
export function formatNumber(value: Num, decimals = 2, opts: { signed?: boolean } = {}): string {
  if (!isNum(value)) return DASH;
  const v = roundTo(value, decimals);
  return `${sign(v, Boolean(opts.signed))}${abs(v, decimals)}`;
}

/** Integer count: formatInt(1234) → "1,234". */
export function formatInt(value: Num, opts: { signed?: boolean } = {}): string {
  return formatNumber(isNum(value) ? Math.round(value) : value, 0, opts);
}

/** Compact magnitude for volume / large counts: 1234 → "1.23K", 3_400_000 → "3.4M". */
export function formatCompact(value: Num, opts: { decimals?: number; signed?: boolean } = {}): string {
  if (!isNum(value)) return DASH;
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  const a = Math.abs(value);
  for (const [size, suffix] of units) {
    if (a >= size * 0.9995) {
      const scaled = value / size;
      const decimals = opts.decimals ?? (Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2);
      const v = roundTo(scaled, decimals);
      return `${sign(v, Boolean(opts.signed))}${numberFormat(0, decimals).format(Math.abs(v))}${suffix}`;
    }
  }
  const decimals = opts.decimals ?? (a >= 100 ? 0 : a >= 1 ? 2 : 4);
  const v = roundTo(value, decimals);
  return `${sign(v, Boolean(opts.signed))}${numberFormat(0, decimals).format(Math.abs(v))}`;
}

/** Same as formatCompact — base-asset or quote volume. */
export const formatVolume = formatCompact;

/** Decimal places for a price: ≥ 10 → 2, ≥ 1 → 4, below 1 → 4 significant digits (max 8). */
export function priceDecimals(value: number): number {
  const a = Math.abs(value);
  if (a === 0 || a >= 10) return 2;
  if (a >= 1) return 4;
  return Math.min(8, Math.max(4, Math.ceil(-Math.log10(a)) + 3));
}

/**
 * Market price with adaptive decimals: 97123.456 → "97,123.46", 2.34567 → "2.3457",
 * 0.0123456 → "0.01235". Prices are quoted in USDT and shown without "$" unless `currency`.
 */
export function formatPrice(value: Num, opts: { decimals?: number; currency?: boolean } = {}): string {
  if (!isNum(value)) return DASH;
  const decimals = opts.decimals ?? priceDecimals(value);
  const v = roundTo(value, decimals);
  return `${sign(v, false)}${opts.currency ? "$" : ""}${abs(v, decimals)}`;
}

/** Money in USD(T): "$10,482.31"; `compact` → "$10.5K"; `signed` → "+$482.31". */
export function formatUsd(
  value: Num,
  opts: { decimals?: number; compact?: boolean; signed?: boolean } = {},
): string {
  if (!isNum(value)) return DASH;
  const signed = Boolean(opts.signed);
  if (opts.compact && Math.abs(value) >= 1_000) {
    const body = formatCompact(Math.abs(value), { decimals: opts.decimals });
    return `${sign(value, signed)}$${body}`;
  }
  const decimals = opts.decimals ?? 2;
  const v = roundTo(value, decimals);
  return `${sign(v, signed)}$${abs(v, decimals)}`;
}

/** Signed P&L: "+$482.31", "−$120.50", "$0.00". */
export function formatPnl(value: Num, opts: { decimals?: number; compact?: boolean } = {}): string {
  return formatUsd(value, { ...opts, signed: true });
}

/**
 * Percent — the input is ALREADY in percent units: formatPct(4.82) → "4.82%".
 * `signed` adds "+" to positives (deltas, returns).
 */
export function formatPct(value: Num, opts: { decimals?: number; signed?: boolean } = {}): string {
  if (!isNum(value)) return DASH;
  const decimals = opts.decimals ?? 2;
  const v = roundTo(value, decimals);
  return `${sign(v, Boolean(opts.signed))}${abs(v, decimals)}%`;
}

/** formatPct with a sign: "+4.82%" / "−1.20%". */
export function formatSignedPct(value: Num, decimals = 2): string {
  return formatPct(value, { decimals, signed: true });
}

/** Plain ratio (profit factor, Sharpe, risk/reward): "1.85"; Infinity → "∞". */
export function formatRatio(value: Num, decimals = 2): string {
  if (value === Infinity) return "∞";
  return formatNumber(value, decimals);
}

/** R multiple: "+1.20R" / "−0.80R". */
export function formatR(value: Num, decimals = 2): string {
  if (!isNum(value)) return DASH;
  return `${formatNumber(value, decimals, { signed: true })}R`;
}

/** Crypto position size with adaptive precision: "0.0123 BTC", "12.5 SOL". Trailing zeros trimmed. */
export function formatSize(value: Num, asset?: string): string {
  if (!isNum(value)) return DASH;
  const a = Math.abs(value);
  const maxDecimals = a >= 1_000 ? 2 : a >= 1 ? 4 : a === 0 ? 2 : Math.min(8, Math.ceil(-Math.log10(a)) + 3);
  const v = roundTo(value, maxDecimals);
  const body = `${sign(v, false)}${numberFormat(0, maxDecimals).format(Math.abs(v))}`;
  return asset ? `${body} ${asset}` : body;
}

/** Basis points: "5 bps". */
export function formatBps(value: Num): string {
  if (!isNum(value)) return DASH;
  return `${formatNumber(value, Number.isInteger(value) ? 0 : 1)} bps`;
}

/** Latency: "245 ms", "1.24 s". */
export function formatMs(value: Num): string {
  if (!isNum(value)) return DASH;
  if (Math.abs(value) >= 1_000) return `${formatNumber(value / 1_000, 2)} s`;
  return `${formatNumber(value, value < 10 ? 1 : 0)} ms`;
}

/** Megabytes: "512 MB", "1.5 GB". */
export function formatMb(value: Num): string {
  if (!isNum(value)) return DASH;
  if (Math.abs(value) >= 1_024) return `${formatNumber(value / 1_024, 1)} GB`;
  return `${formatNumber(value, value < 10 ? 1 : 0)} MB`;
}

// ---------------------------------------------------------------- durations & times

/** Duration from seconds: "45s", "12m 5s", "2h 14m", "3d 4h". */
export function formatDuration(seconds: Num): string {
  if (!isNum(seconds)) return DASH;
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

type TimeInput = string | number | Date | null | undefined;

const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();
function dtf(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let f = dateTimeFormats.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", options);
    dateTimeFormats.set(key, f);
  }
  return f;
}

/** Local wall-clock time: "14:32:05". */
export function formatTime(value: TimeInput, opts: { seconds?: boolean } = {}): string {
  const ms = toMs(value);
  if (ms === null) return DASH;
  const withSeconds = opts.seconds ?? true;
  return dtf(withSeconds ? "time-s" : "time", {
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
    hourCycle: "h23",
  }).format(ms);
}

/** Local date: "Oct 4" (this year) or "Oct 4, 2025". */
export function formatDate(value: TimeInput, now = Date.now()): string {
  const ms = toMs(value);
  if (ms === null) return DASH;
  const sameYear = new Date(ms).getFullYear() === new Date(now).getFullYear();
  return dtf(sameYear ? "date" : "date-y", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(ms);
}

/** Local date and time: "Oct 4, 14:32:05". */
export function formatDateTime(value: TimeInput, opts: { seconds?: boolean } = {}, now = Date.now()): string {
  const ms = toMs(value);
  if (ms === null) return DASH;
  return `${formatDate(ms, now)}, ${formatTime(ms, opts)}`;
}

/** UTC timestamp for tooltips: "2026-10-04 12:32:05 UTC". */
export function formatUtc(value: TimeInput): string {
  const ms = toMs(value);
  if (ms === null) return DASH;
  return `${new Date(ms).toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

/** Day bucket label for grouped lists: "Today", "Yesterday", "Oct 2". */
export function formatDayLabel(value: TimeInput, now = Date.now()): string {
  const ms = toMs(value);
  if (ms === null) return DASH;
  const day = new Date(ms);
  const today = new Date(now);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(day)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return formatDate(ms, now);
}

/**
 * Relative time. short: "now", "12s ago", "5m ago", "3h ago", "2d ago", then a date.
 * long: "just now", "12 seconds ago", "1 minute ago", "3 hours ago", "2 days ago".
 * Future times read "in 12s" / "in 12 seconds".
 */
export function formatRelativeTime(value: TimeInput, now = Date.now(), style: "short" | "long" = "short"): string {
  const ms = toMs(value);
  if (ms === null) return DASH;
  return formatAgo((now - ms) / 1_000, style, ms, now);
}

/** Relative time from an age in seconds (e.g. heartbeat_age_sec): "2s ago" / "2 seconds ago". */
export function formatAgo(ageSec: Num, style: "short" | "long" = "short", absoluteMs?: number, now = Date.now()): string {
  if (!isNum(ageSec)) return DASH;
  const future = ageSec < 0;
  const s = Math.abs(ageSec);
  const wrap = (text: string) => (future ? `in ${text}` : `${text} ago`);
  if (s < 1) return style === "short" ? "now" : "just now";
  const units: [number, string, string][] = [
    [60, "s", "second"],
    [60, "m", "minute"],
    [24, "h", "hour"],
    [7, "d", "day"],
  ];
  let amount = s;
  for (const [limit, short, long] of units) {
    if (amount < limit) {
      const n = Math.floor(amount);
      return wrap(style === "short" ? `${n}${short}` : `${n} ${long}${n === 1 ? "" : "s"}`);
    }
    amount /= limit;
  }
  if (absoluteMs !== undefined) return formatDate(absoluteMs, now);
  const days = Math.floor(s / 86_400);
  return wrap(style === "short" ? `${days}d` : `${days} days`);
}

/** Axis label for a unix-seconds chart time: "14:30" intraday, "Oct 4" for daily bars. */
export function formatChartTime(unixSeconds: Num, timeframe?: string): string {
  if (!isNum(unixSeconds)) return DASH;
  const ms = unixSeconds * 1_000;
  if (timeframe === "1d") return formatDate(ms);
  if (timeframe === "4h") return `${formatDate(ms)} ${formatTime(ms, { seconds: false })}`;
  return formatTime(ms, { seconds: false });
}

// ---------------------------------------------------------------- symbols & signs

/** "BTC/USDT" → { base: "BTC", quote: "USDT" }. */
export function splitSymbol(symbol: string): { base: string; quote: string } {
  const [base, quote = ""] = symbol.split("/");
  return { base, quote };
}

/** -1, 0 or 1 (0 for missing values and values that round to zero at 2 decimals). */
export function signOf(value: Num, decimals = 2): -1 | 0 | 1 {
  if (!isNum(value)) return 0;
  const v = roundTo(value, decimals);
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

/** Semantic tone for a signed value: up / down / neutral. `invert` when lower is better. */
export function toneOf(value: Num, opts: { invert?: boolean; decimals?: number } = {}): "up" | "down" | "neutral" {
  const s = signOf(value, opts.decimals ?? 2);
  if (s === 0) return "neutral";
  const positive = opts.invert ? s < 0 : s > 0;
  return positive ? "up" : "down";
}
