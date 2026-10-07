/**
 * Static sample data for the dev-only design showcase (/_design). Never import this from a
 * real page: real pages render API data only.
 */
import type {
  Candle,
  ChartMarker,
  Kpi,
  LinePoint,
  Notification,
  Position,
  PortfolioKpis,
  PriceLevel,
} from "@/types";

/** Deterministic pseudo-random walk (no Math.random, so renders are stable). */
export function walk(n: number, start: number, vol: number, drift = 0, seed = 7): number[] {
  let state = seed;
  const rand = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  const out: number[] = [];
  let v = start;
  for (let i = 0; i < n; i++) {
    v = v + drift + (rand() - 0.5) * vol;
    out.push(Math.round(v * 100) / 100);
  }
  return out;
}

export const SAMPLE_KPIS: PortfolioKpis = {
  equity: {
    value: 10482.31,
    previous: 10000,
    change: 482.31,
    change_pct: 4.82,
    comparison_label: "vs 24h ago",
    sparkline: walk(24, 10000, 90, 20, 3),
  },
  today_pnl: {
    value: 48.2,
    previous: -12.4,
    change: 60.6,
    change_pct: null,
    comparison_label: "vs yesterday",
    sparkline: [32, -18, 44, 12, -40, 65, 21, -9, 38, 54, -22, 17, -12.4, 48.2],
  },
  total_pnl: {
    value: 482.31,
    previous: 391.2,
    change: 91.11,
    change_pct: 23.29,
    comparison_label: "vs 24h ago",
    sparkline: walk(30, 120, 60, 12, 11),
  },
  win_rate: {
    value: 58.3,
    previous: 52.1,
    change: 6.2,
    change_pct: 11.9,
    comparison_label: "vs prior 7d",
    sparkline: walk(14, 52, 9, 0.4, 5),
  },
  profit_factor: {
    value: 1.84,
    previous: 1.92,
    change: -0.08,
    change_pct: -4.17,
    comparison_label: "vs prior 7d",
    sparkline: walk(14, 1.9, 0.25, -0.01, 9),
  },
  max_drawdown: {
    value: -6.42,
    previous: -5.1,
    change: -1.32,
    change_pct: 25.88,
    comparison_label: "vs 7d ago",
    sparkline: [-2.1, -2.1, -3.4, -3.4, -3.9, -4.6, -4.6, -5.1, -5.1, -5.1, -5.8, -6.42, -6.42],
  },
  open_positions: {
    value: 2,
    previous: 1,
    change: 1,
    change_pct: 100,
    comparison_label: "vs 24h ago",
    sparkline: [1, 1, 2, 2, 1, 0, 0, 1, 1, 2, 3, 3, 2, 2, 1, 1, 2, 2, 2, 1, 1, 2, 2, 2],
  },
  trades_today: {
    value: 7,
    previous: 9,
    change: -2,
    change_pct: -22.2,
    comparison_label: "vs yesterday",
    sparkline: [6, 9, 4, 11, 8, 5, 7, 10, 6, 8, 12, 7, 9, 7],
  },
};

export const NULL_KPI: Kpi = {
  value: null,
  previous: null,
  change: null,
  change_pct: null,
  comparison_label: "vs prior 7d",
  sparkline: [],
};

const now = Date.UTC(2026, 9, 4, 14, 32, 5);
const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString().replace(".000Z", "Z");

export const SAMPLE_POSITIONS: Position[] = [
  {
    id: "pos_3f9a1c2b7d10",
    symbol: "BTC/USDT",
    side: "LONG",
    size: 0.0412,
    notional: 3998.4,
    entry_price: 97048.5,
    current_price: 97611.2,
    stop_loss: 95890,
    take_profit: 99360,
    unrealized_pnl: 21.18,
    unrealized_pnl_pct: 0.53,
    r_multiple: 0.44,
    fees_paid: 2,
    risk_amount: 47.73,
    risk_pct: 0.46,
    opened_at: iso(134),
    duration_sec: 134 * 60,
    ai_confidence: 78,
    analysis_id: "dec_9a8b7c6d5e4f",
    strategy: "ai",
    regime: "TRENDING_BULLISH",
    order_type: "market",
    entry_reason: "EMA stack bullish on 5m/15m/1h, MACD histogram rising, volume 1.6× average.",
    mfe_pct: 0.91,
    mae_pct: -0.22,
    distance_to_sl_pct: -1.76,
    distance_to_tp_pct: 1.79,
  },
  {
    id: "pos_77c0d1e2f3a4",
    symbol: "ETH/USDT",
    side: "SHORT",
    size: 0.871,
    notional: 3005.0,
    entry_price: 3450.12,
    current_price: 3471.85,
    stop_loss: 3512.4,
    take_profit: 3356.7,
    unrealized_pnl: -20.43,
    unrealized_pnl_pct: -0.68,
    r_multiple: -0.38,
    fees_paid: 1.5,
    risk_amount: 54.25,
    risk_pct: 0.52,
    opened_at: iso(47),
    duration_sec: 47 * 60,
    ai_confidence: 71,
    analysis_id: "dec_1b2c3d4e5f60",
    strategy: "hybrid",
    regime: "RANGING",
    order_type: "limit",
    entry_reason: "Rejection at range high with bearish RSI divergence on 15m.",
    mfe_pct: 0.31,
    mae_pct: -0.74,
    distance_to_sl_pct: 1.17,
    distance_to_tp_pct: -3.32,
  },
  {
    id: "pos_a1b2c3d4e5f6",
    symbol: "SOL/USDT",
    side: "LONG",
    size: 12.4,
    notional: 2049.1,
    entry_price: 165.25,
    current_price: 165.25,
    stop_loss: 161.9,
    take_profit: 172.0,
    unrealized_pnl: -1.02,
    unrealized_pnl_pct: -0.05,
    r_multiple: -0.02,
    fees_paid: 1.02,
    risk_amount: 41.54,
    risk_pct: 0.4,
    opened_at: iso(3),
    duration_sec: 180,
    ai_confidence: 66,
    analysis_id: null,
    strategy: "baseline",
    regime: "BREAKOUT",
    order_type: "market",
    entry_reason: "Breakout above 4h range with expanding volume.",
    mfe_pct: 0.02,
    mae_pct: -0.06,
    distance_to_sl_pct: -2.03,
    distance_to_tp_pct: 4.08,
  },
];

export const SAMPLE_NOTIFICATIONS: Notification[] = [
  {
    id: 41,
    ts: iso(1),
    type: "TAKE_PROFIT_HIT",
    severity: "success",
    title: "Take profit hit · BTC/USDT",
    message: "Long closed at 99,360.00 for +$92.40 (+2.31%, +1.9R).",
    read: false,
    data: {},
  },
  {
    id: 40,
    ts: iso(18),
    type: "DAILY_LOSS_WARNING",
    severity: "warning",
    title: "Daily loss at 80 % of limit",
    message: "Today's loss is $160 of the $200 limit. New entries stop at the limit.",
    read: false,
    data: {},
  },
  {
    id: 39,
    ts: iso(65),
    type: "AI_UNAVAILABLE",
    severity: "warning",
    title: "AI unavailable — heuristic fallback",
    message: "OpenRouter timed out twice; the local heuristic analyst answered.",
    read: true,
    data: {},
  },
];

/** 60 days of equity for the sample analytics chart (unix seconds). */
export const SAMPLE_EQUITY = (() => {
  const values = walk(60, 10000, 140, 9, 21);
  const start = Math.floor(now / 1000) - 59 * 86_400;
  let peak = -Infinity;
  return values.map((equity, i) => {
    peak = Math.max(peak, equity);
    return {
      time: start + i * 86_400,
      equity,
      drawdown_pct: Math.round(((equity - peak) / peak) * 10_000) / 100,
    };
  });
})();

/** 21 days of daily P&L for the sample bar chart (differences of a walk = noise around a drift). */
export const SAMPLE_DAILY_PNL = (() => {
  const path = walk(22, 0, 160, 6, 33);
  return path.slice(1).map((v, i) => ({
    date: new Date(now - (20 - i) * 86_400_000).toISOString().slice(0, 10),
    pnl: Math.round((v - path[i]) * 100) / 100,
  }));
})();

/** Three strategies' normalized equity for the categorical-series sample. */
export const SAMPLE_COMPARISON = (() => {
  const ai = walk(40, 100, 2.4, 0.18, 2);
  const hybrid = walk(40, 100, 1.8, 0.12, 4);
  const baseline = walk(40, 100, 2.1, 0.05, 6);
  return ai.map((v, i) => ({ step: i, ai: v, hybrid: hybrid[i], baseline: baseline[i] }));
})();

/** 160 five-minute candles, an EMA 21 overlay, trade markers and an open position's levels. */
export const SAMPLE_MARKET = (() => {
  const step = 300;
  const n = 160;
  const end = Math.floor(now / 1000 / step) * step;
  const closes = walk(n, 97_000, 140, 1.5, 41);
  const wiggle = walk(n, 0, 1, 0, 43);
  const candles: Candle[] = closes.map((close, i) => {
    const open = i === 0 ? close - 20 : closes[i - 1];
    const range = 10 + Math.abs(wiggle[i]) * 28;
    return {
      time: end - (n - 1 - i) * step,
      open,
      high: Math.round((Math.max(open, close) + range * 0.6) * 100) / 100,
      low: Math.round((Math.min(open, close) - range * 0.5) * 100) / 100,
      close,
      volume: Math.round((8 + Math.abs(wiggle[i]) * 30 + (i % 12 === 0 ? 25 : 0)) * 100) / 100,
    };
  });
  const k = 2 / 22;
  let ema = candles[0].close;
  const ema21: LinePoint[] = candles.map((c) => {
    ema = c.close * k + ema * (1 - k);
    return { time: c.time, value: Math.round(ema * 100) / 100 };
  });
  const at = (i: number) => candles[i];
  const markers: ChartMarker[] = [
    { time: at(24).time, kind: "signal_long", price: at(24).close, label: "AI 71%", trade_id: null },
    {
      time: at(42).time,
      kind: "entry_long",
      price: at(42).close,
      label: "LONG 74%",
      trade_id: "pos_sample000001",
    },
    {
      time: at(70).time,
      kind: "take_profit",
      price: at(70).high,
      label: "TP +1.92%",
      trade_id: "pos_sample000001",
    },
    {
      time: at(96).time,
      kind: "entry_short",
      price: at(96).close,
      label: "SHORT 68%",
      trade_id: "pos_sample000002",
    },
    {
      time: at(110).time,
      kind: "stop_loss",
      price: at(110).high,
      label: "SL −0.84%",
      trade_id: "pos_sample000002",
    },
    {
      time: at(132).time,
      kind: "entry_long",
      price: at(132).close,
      label: "LONG 77%",
      trade_id: "pos_sample000003",
    },
  ];
  const entry = at(132).close;
  const levels: PriceLevel[] = [
    { kind: "entry", price: entry, label: "LONG entry", position_id: "pos_sample000003", side: "LONG" },
    {
      kind: "stop_loss",
      price: Math.round(entry * 0.9965 * 100) / 100,
      label: "SL",
      position_id: "pos_sample000003",
      side: "LONG",
    },
    {
      kind: "take_profit",
      price: Math.round(entry * 1.0065 * 100) / 100,
      label: "TP",
      position_id: "pos_sample000003",
      side: "LONG",
    },
  ];
  return { candles, ema21, markers, levels };
})();
