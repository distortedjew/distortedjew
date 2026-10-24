/** Pure aggregation of logs/trades.jsonl into the shape the dashboard renders. */

export interface LogEvent {
  t: string;
  event: string;
  [k: string]: unknown;
}

export function parseLog(text: string): LogEvent[] {
  const out: LogEvent[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    try {
      const e = JSON.parse(line);
      if (e && typeof e.event === "string" && typeof e.t === "string") out.push(e);
    } catch {
      // A partially written or truncated line (tail read) is expected; skip it.
    }
  }
  return out;
}

const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Collapse numbers so "top10 holders 41%" and "top10 holders 55%" group together. */
export const normalizeReason = (r: string) => r.replace(/\d+(\.\d+)?/g, "#").slice(0, 80);

export interface ClosedPosition {
  mint: string;
  symbol: string;
  entryTime: number;
  exitTime: number;
  pnlUsd: number;
  reason: string;
  fills: number;
}

export function buildState(events: LogEvent[], nowMs: number, staleSec = 120) {
  const statuses = events.filter((e) => e.event === "status");
  const lastStatus = statuses.at(-1);
  const startingBalance = num(lastStatus?.startingBalanceUsd, 0);

  // Group exit fills per position; a position is closed by any non-take-profit exit.
  const open = new Map<string, ClosedPosition>();
  const closed: ClosedPosition[] = [];
  for (const e of events) {
    if (e.event !== "exit") continue;
    const key = `${e.mint}:${e.entryTime}`;
    const cur = open.get(key) ?? {
      mint: str(e.mint),
      symbol: str(e.symbol),
      entryTime: num(e.entryTime),
      exitTime: 0,
      pnlUsd: 0,
      reason: "",
      fills: 0,
    };
    cur.pnlUsd += num(e.pnlUsd);
    cur.fills++;
    cur.exitTime = num(e.exitTime);
    cur.reason = str(e.reason);
    open.set(key, cur);
    if (!cur.reason.startsWith("take-profit")) {
      closed.push(cur);
      open.delete(key);
    }
  }
  // Positions with only partial take-profit fills so far still count their realized PnL.
  const partials = [...open.values()];

  const wins = closed.filter((p) => p.pnlUsd > 0);
  const losses = closed.filter((p) => p.pnlUsd <= 0);
  const grossWin = wins.reduce((s, p) => s + p.pnlUsd, 0);
  const grossLoss = Math.abs(losses.reduce((s, p) => s + p.pnlUsd, 0));

  const equity = statuses.map((s) => ({ t: Date.parse(s.t), v: num(s.equityUsd) }));
  let peak = -Infinity;
  let maxDd = 0;
  let maxDdPct = 0;
  for (const p of equity) {
    peak = Math.max(peak, p.v);
    const dd = peak - p.v;
    if (dd > maxDd) {
      maxDd = dd;
      maxDdPct = peak > 0 ? (dd / peak) * 100 : 0;
    }
  }

  const count = (items: string[]) => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
    return [...m].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
  };

  const skips = events.filter((e) => e.event === "skip");
  const entries = events.filter((e) => e.event === "entry");
  const lastPositions = events.findLast((e) => e.event === "positions");
  const lastEvent = events.at(-1);
  const lastTickMs = lastStatus ? Date.parse(lastStatus.t) : 0;
  const errors = events.filter((e) => e.event === "error");

  const equityNow = num(lastStatus?.equityUsd, startingBalance);
  return {
    generatedAt: nowMs,
    health: {
      live: lastTickMs > 0 && (nowMs - lastTickMs) / 1000 <= staleSec,
      lastTickAgoSec: lastTickMs ? Math.round((nowMs - lastTickMs) / 1000) : null,
      errorsLastHour: errors.filter((e) => nowMs - Date.parse(e.t) < 3_600_000).length,
      lastError: errors.length ? { t: errors.at(-1)!.t, message: str(errors.at(-1)!.message) } : null,
      lastEventAt: lastEvent?.t ?? null,
    },
    kpis: {
      startingBalanceUsd: startingBalance,
      equityUsd: equityNow,
      totalReturnPct: startingBalance ? ((equityNow - startingBalance) / startingBalance) * 100 : 0,
      realizedPnlUsd: num(lastStatus?.realizedPnlUsd),
      closedPositions: closed.length,
      winRatePct: closed.length ? (wins.length / closed.length) * 100 : null,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? null : 0,
      avgWinUsd: wins.length ? grossWin / wins.length : 0,
      avgLossUsd: losses.length ? -grossLoss / losses.length : 0,
      bestUsd: closed.length ? Math.max(...closed.map((p) => p.pnlUsd)) : 0,
      worstUsd: closed.length ? Math.min(...closed.map((p) => p.pnlUsd)) : 0,
      maxDrawdownUsd: maxDd,
      maxDrawdownPct: maxDdPct,
      scanned: num(lastStatus?.scanned),
      entries: entries.length,
      openCount: num(lastStatus?.open),
      partialRealizedUsd: partials.reduce((s, p) => s + p.pnlUsd, 0),
    },
    equity: downsample(equity, 600),
    openPositions: Array.isArray(lastPositions?.items) ? lastPositions!.items : [],
    recentTrades: closed.slice(-50).reverse(),
    exitReasons: count(closed.map((p) => normalizeReason(p.reason))),
    skipReasons: count(skips.map((e) => normalizeReason(str(e.reason)))).slice(0, 10),
    feed: events
      .filter((e) => e.event !== "positions" && e.event !== "status")
      .slice(-60)
      .reverse()
      .map((e) => ({ t: e.t, event: e.event, symbol: str(e.symbol), detail: describe(e) })),
  };
}

function describe(e: LogEvent): string {
  switch (e.event) {
    case "entry":
      return `buy $${num(e.sizeUsd).toFixed(0)} @ ${num(e.price).toPrecision(4)}`;
    case "exit":
      return `${str(e.reason)} · ${num(e.pnlUsd) >= 0 ? "+" : "-"}$${Math.abs(num(e.pnlUsd)).toFixed(2)}`;
    case "skip":
      return str(e.reason);
    case "error":
      return str(e.message);
    default:
      return "";
  }
}

function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]);
  out[out.length - 1] = arr.at(-1)!;
  return out;
}
