import { describe, expect, it } from "vitest";
import type { PerformanceReport } from "@/types";
import {
  binTone,
  curveSpanDays,
  describeStreak,
  groupMonthly,
  heatIntensity,
  performanceMetricItems,
  shortBinLabel,
  thinRows,
  tradingStatItems,
  winLossSplit,
} from "./performance-logic";

export function makeReport(overrides: Partial<PerformanceReport> = {}): PerformanceReport {
  return {
    range: "30d",
    starting_equity: 10_000,
    ending_equity: 10_480,
    metrics: {
      total_return_pct: 4.8,
      cagr_pct: 120.5,
      sharpe: 1.42,
      sortino: 2.1,
      profit_factor: 1.8,
      expectancy: 12.4,
      expectancy_r: 0.31,
      max_drawdown_pct: -3.2,
      max_drawdown_usd: -330,
      recovery_factor: 1.45,
      avg_trade: 12.4,
      avg_trade_pct: 0.4,
      net_profit: 480,
      gross_profit: 1080,
      gross_loss: -600,
      total_fees: 40,
    },
    win_loss: {
      win_rate: 55,
      loss_rate: 45,
      avg_win: 60,
      avg_loss: -40,
      avg_win_pct: 1.5,
      avg_loss_pct: -1,
      largest_win: 150,
      largest_loss: -90,
      payoff_ratio: 1.5,
    },
    stats: {
      total_trades: 40,
      long_trades: 22,
      short_trades: 18,
      winning_trades: 22,
      losing_trades: 17,
      breakeven_trades: 1,
      long_win_rate: 59,
      short_win_rate: 50,
      avg_holding_sec: 5_400,
      longest_win_streak: 5,
      longest_loss_streak: 3,
      current_streak: 2,
      trades_per_day: 1.4,
    },
    equity_curve: [
      { time: 1_700_000_000, equity: 10_000, drawdown_pct: 0 },
      { time: 1_700_000_000 + 10 * 86_400, equity: 10_480, drawdown_pct: 0 },
    ],
    daily_pnl: [],
    monthly: [],
    distribution: [],
    by_symbol: [],
    by_exit_reason: [],
    updated_at: "2026-10-07T10:00:00Z",
    ...overrides,
  };
}

const byKey = (items: ReturnType<typeof performanceMetricItems>) =>
  Object.fromEntries(items.map((i) => [i.key, i]));

describe("performance metric items", () => {
  it("returns all nine metrics with formatted values", () => {
    const items = performanceMetricItems(makeReport());
    expect(items.map((i) => i.key)).toEqual([
      "total_return",
      "cagr",
      "sharpe",
      "sortino",
      "profit_factor",
      "expectancy",
      "max_drawdown",
      "recovery_factor",
      "avg_trade",
    ]);
    const m = byKey(items);
    expect(m.total_return.display).toMatchObject({ text: "+4.80%", tone: "up" });
    expect(m.profit_factor.display.text).toBe("1.80");
    expect(m.max_drawdown.display).toMatchObject({ text: "−3.20%", tone: "down" });
    expect(m.expectancy.display.text).toBe("+$12.40");
    for (const item of items) expect(item.info.length).toBeGreaterThan(20);
  });

  it("explains each missing value instead of printing NaN or null", () => {
    const report = makeReport({
      metrics: {
        ...makeReport().metrics,
        cagr_pct: null,
        sharpe: null,
        sortino: null,
        profit_factor: null,
        recovery_factor: null,
      },
      equity_curve: [
        { time: 0, equity: 10_000, drawdown_pct: 0 },
        { time: 2 * 86_400, equity: 10_050, drawdown_pct: 0 },
      ],
    });
    const m = byKey(performanceMetricItems(report));
    for (const key of ["cagr", "sharpe", "sortino", "profit_factor", "recovery_factor"]) {
      expect(m[key].display.text).toBe("—");
      expect(m[key].display.reason).toBeTruthy();
    }
    expect(m.cagr.display.reason).toContain("7 days");
    expect(m.cagr.display.reason).toContain("2.0 days");
    expect(m.profit_factor.display.reason).toContain("No losing trades");
    expect(m.sharpe.display.reason).toContain("5 daily returns");
  });

  it("says there are no trades when profit factor is missing and nothing closed", () => {
    const report = makeReport({
      metrics: { ...makeReport().metrics, profit_factor: null, expectancy: null, avg_trade: null },
      stats: { ...makeReport().stats, total_trades: 0 },
    });
    const m = byKey(performanceMetricItems(report));
    expect(m.profit_factor.display.reason).toContain("No closed trades");
    expect(m.expectancy.display.text).toBe("—");
  });

  it("treats a profit factor below 1 as a loss tone", () => {
    const report = makeReport({ metrics: { ...makeReport().metrics, profit_factor: 0.59 } });
    expect(byKey(performanceMetricItems(report)).profit_factor.display.tone).toBe("down");
  });
});

describe("trading stats", () => {
  it("returns the eight statistics", () => {
    const items = tradingStatItems(makeReport());
    expect(items.map((i) => i.key)).toEqual([
      "total_trades",
      "long_trades",
      "short_trades",
      "winning_trades",
      "losing_trades",
      "avg_holding",
      "win_streak",
      "loss_streak",
    ]);
    const m = byKey(items);
    expect(m.avg_holding.display.text).toBe("1h 30m");
    expect(m.long_trades.sub).toBe("59% win rate");
    expect(m.losing_trades.sub).toBe("1 breakeven");
  });

  it("describes the current streak", () => {
    expect(describeStreak(0)).toBeUndefined();
    expect(describeStreak(1)).toBe("Current: 1 win in a row");
    expect(describeStreak(-5)).toBe("Current: 5 losses in a row");
  });

  it("shows — for holding time without trades", () => {
    const report = makeReport({ stats: { ...makeReport().stats, avg_holding_sec: null } });
    expect(byKey(tradingStatItems(report)).avg_holding.display.reason).toBeTruthy();
  });
});

describe("win / loss split", () => {
  it("computes shares and drops empty segments", () => {
    const split = winLossSplit({ winning_trades: 3, losing_trades: 1, breakeven_trades: 0, total_trades: 4 });
    expect(split.map((s) => [s.key, s.pct])).toEqual([
      ["win", 75],
      ["loss", 25],
    ]);
    expect(
      winLossSplit({ winning_trades: 0, losing_trades: 0, breakeven_trades: 0, total_trades: 0 }),
    ).toEqual([]);
  });
});

describe("monthly heatmap", () => {
  it("groups months into years with twelve cells", () => {
    const rows = groupMonthly([
      { month: "2025-12", return_pct: -1, pnl: -100, trades: 3 },
      { month: "2026-01", return_pct: 2, pnl: 200, trades: 5 },
    ]);
    expect(rows.map((r) => r.year)).toEqual(["2025", "2026"]);
    expect(rows[0].cells).toHaveLength(12);
    expect(rows[0].cells[11].data?.return_pct).toBe(-1);
    expect(rows[0].cells[0].data).toBeNull();
    expect(rows[1].cells[0].month).toBe("2026-01");
  });

  it("scales intensity with a visible floor", () => {
    expect(heatIntensity(5, 10)).toBe(0.5);
    expect(heatIntensity(-10, 10)).toBe(1);
    expect(heatIntensity(0.01, 10)).toBe(0.12);
    expect(heatIntensity(3, 0)).toBe(0);
  });
});

describe("histogram helpers", () => {
  it("labels open-ended and closed bins", () => {
    expect(shortBinLabel({ min: -1e9, max: -5 })).toBe("< −5");
    expect(shortBinLabel({ min: -1, max: -0.5 })).toBe("−1…−0.5");
    expect(shortBinLabel({ min: 5, max: 1e9 })).toBe("≥ 5");
    expect(binTone({ min: -1, max: 0 })).toBe("down");
    expect(binTone({ min: 0, max: 0.5 })).toBe("up");
  });
});

describe("table helpers", () => {
  it("thins long series and keeps the ends", () => {
    const rows = Array.from({ length: 1000 }, (_, i) => i);
    const thin = thinRows(rows, 100);
    expect(thin).toHaveLength(100);
    expect(thin[0]).toBe(0);
    expect(thin[99]).toBe(999);
    expect(thinRows([1, 2, 3], 100)).toEqual([1, 2, 3]);
  });

  it("measures the curve span", () => {
    expect(curveSpanDays([])).toBe(0);
    expect(curveSpanDays(makeReport().equity_curve)).toBe(10);
  });
});
