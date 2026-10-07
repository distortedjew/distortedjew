/**
 * Trade filters ↔ URL query ↔ API parameters. The URL is the single source of truth: every filter,
 * the sort and the page offset live in the query string, so a filtered view is linkable and
 * survives a refresh. Invalid values in a hand-edited URL are ignored rather than sent to the API.
 */
import type { SortState } from "@/components/ui/DataTable";
import type { ExitReason, Side, StrategyName, TradeFilters, TradeResult, TradeSortKey } from "@/types";

export const SIDES: readonly Side[] = ["LONG", "SHORT"];
export const RESULTS: readonly TradeResult[] = ["WIN", "LOSS", "BREAKEVEN"];
export const STRATEGIES: readonly StrategyName[] = ["ai", "hybrid", "baseline"];
export const EXIT_REASONS: readonly ExitReason[] = [
  "STOP_LOSS",
  "TAKE_PROFIT",
  "SIGNAL_REVERSAL",
  "TIME_EXIT",
  "KILL_SWITCH",
];
export const SORT_KEYS: readonly TradeSortKey[] = [
  "closed_at",
  "opened_at",
  "pnl",
  "pnl_pct",
  "symbol",
  "side",
  "confidence",
  "duration",
  "exit_reason",
  "result",
  "strategy",
];

export const PAGE_SIZE = 25;
export const DEFAULT_SORT: { sort: TradeSortKey; order: "asc" | "desc" } = {
  sort: "closed_at",
  order: "desc",
};

/** What the filter controls show. `undefined` = no filter. */
export interface TradeFilterState {
  symbol?: string;
  side?: Side;
  result?: TradeResult;
  strategy?: StrategyName;
  exit?: ExitReason;
  /** Inclusive lower / upper bound of AI confidence in percent units; undefined = open. */
  minConf?: number;
  maxConf?: number;
  /** Local-agnostic calendar dates (YYYY-MM-DD, interpreted as UTC days). */
  from?: string;
  to?: string;
  q?: string;
}

export interface TradeView extends TradeFilterState {
  sort: TradeSortKey;
  order: "asc" | "desc";
  offset: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function percent(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : undefined;
}

function date(value: string | null): string | undefined {
  return value !== null && DATE.test(value) && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

/** Parse `?symbol=…&side=…` into a validated view. */
export function viewFromParams(params: URLSearchParams): TradeView {
  const q = params.get("q")?.trim();
  const offset = Number(params.get("offset"));
  return {
    symbol: params.get("symbol") || undefined,
    side: oneOf(params.get("side"), SIDES),
    result: oneOf(params.get("result"), RESULTS),
    strategy: oneOf(params.get("strategy"), STRATEGIES),
    exit: oneOf(params.get("exit"), EXIT_REASONS),
    minConf: percent(params.get("minconf")),
    maxConf: percent(params.get("maxconf")),
    from: date(params.get("from")),
    to: date(params.get("to")),
    q: q ? q.slice(0, 100) : undefined,
    sort: oneOf(params.get("sort"), SORT_KEYS) ?? DEFAULT_SORT.sort,
    order: oneOf(params.get("order"), ["asc", "desc"] as const) ?? DEFAULT_SORT.order,
    offset: Number.isInteger(offset) && offset > 0 ? offset : 0,
  };
}

const KEYS: Record<keyof TradeView, string> = {
  symbol: "symbol",
  side: "side",
  result: "result",
  strategy: "strategy",
  exit: "exit",
  minConf: "minconf",
  maxConf: "maxconf",
  from: "from",
  to: "to",
  q: "q",
  sort: "sort",
  order: "order",
  offset: "offset",
};

/**
 * Apply a change to the URL's query. Defaults are not written; changing any filter (anything but
 * the sort or the page itself) returns to the first page. Unrelated params (`trade`) are kept.
 */
export function applyViewPatch(
  params: URLSearchParams,
  patch: Partial<{ [K in keyof TradeView]: TradeView[K] | undefined }>,
): URLSearchParams {
  const out = new URLSearchParams(params);
  const keys = Object.keys(patch) as (keyof TradeView)[];
  for (const key of keys) {
    const value = patch[key];
    const name = KEYS[key];
    const isDefault =
      value === undefined ||
      value === "" ||
      (key === "offset" && value === 0) ||
      (key === "sort" && value === DEFAULT_SORT.sort) ||
      (key === "order" && value === DEFAULT_SORT.order);
    if (isDefault) out.delete(name);
    else out.set(name, String(value));
  }
  if (!keys.includes("offset")) out.delete(KEYS.offset);
  return out;
}

/** The filter fields only (no sort / page): used for the CSV export and "active filters" counts. */
export function filtersToApi(view: TradeFilterState): TradeFilters {
  const out: TradeFilters = {};
  if (view.symbol) out.symbol = view.symbol;
  if (view.side) out.side = view.side;
  if (view.result) out.result = view.result;
  if (view.strategy) out.strategy = view.strategy;
  if (view.exit) out.exit_reason = view.exit;
  if (view.minConf !== undefined && view.minConf > 0) out.min_confidence = view.minConf;
  if (view.maxConf !== undefined && view.maxConf < 100) out.max_confidence = view.maxConf;
  // The API compares against the close time: a bare end date would stop at 00:00, so close the day.
  if (view.from) out.start = view.from;
  if (view.to) out.end = `${view.to}T23:59:59`;
  if (view.q) out.q = view.q;
  return out;
}

export function viewToApi(view: TradeView, limit = PAGE_SIZE): TradeFilters {
  return { ...filtersToApi(view), sort: view.sort, order: view.order, limit, offset: view.offset };
}

/** Number of filters in effect (a confidence range counts once; sort and page never count). */
export function activeFilterCount(view: TradeFilterState): number {
  const conf = (view.minConf ?? 0) > 0 || (view.maxConf ?? 100) < 100 ? 1 : 0;
  const dates = view.from || view.to ? 1 : 0;
  return (
    [view.symbol, view.side, view.result, view.strategy, view.exit, view.q].filter(Boolean).length +
    conf +
    dates
  );
}

/** Column id → server sort key (`sort=`). Columns without an entry are not sortable. */
const SORT_KEY: Record<string, TradeSortKey> = {
  time: "closed_at",
  symbol: "symbol",
  side: "side",
  pnl: "pnl",
  pnl_pct: "pnl_pct",
  duration: "duration",
  confidence: "confidence",
  reason: "exit_reason",
};

export function sortStateFromView(sort: TradeSortKey, order: "asc" | "desc"): SortState | null {
  const id = Object.keys(SORT_KEY).find((k) => SORT_KEY[k] === sort);
  return id ? { id, desc: order === "desc" } : null;
}

export function sortStateToView(
  state: SortState | null,
): { sort: TradeSortKey; order: "asc" | "desc" } | null {
  if (!state) return null;
  const sort = SORT_KEY[state.id];
  return sort ? { sort, order: state.desc ? "desc" : "asc" } : null;
}
