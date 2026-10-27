/**
 * Display metadata — the ONE place that decides how every enum from the API is labelled,
 * colored and iconified, so all pages render a regime, signal, exit reason, event… identically.
 *
 *   const meta = REGIME_META[analysis.regime];   // { label, short, tone, icon, description }
 *   <Badge tone={meta.tone} icon={meta.icon}>{meta.label}</Badge>
 *   // or simply <EnumBadge kind="regime" value={analysis.regime} />
 *
 * Every map is typed `Record<Union, Meta>` against the generated contract types, so a new
 * enum value in schemas.py fails the type check until it gets a label here.
 */
import {
  Activity,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Ban,
  Bot,
  BrainCircuit,
  ChartCandlestick,
  ChartLine,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  CircleSlash,
  CircleX,
  Clock,
  Flame,
  FlaskConical,
  GitCompareArrows,
  Hourglass,
  Info,
  Layers,
  LayoutDashboard,
  LoaderCircle,
  LogIn,
  Minus,
  MoveHorizontal,
  OctagonAlert,
  Pause,
  PlugZap,
  Power,
  Radio,
  Rocket,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  SlidersHorizontal,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Waves,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import type {
  AIProvider,
  BacktestStatus,
  BotState,
  ChartMarkerKind,
  ConnectionStatus,
  EmaAlignment,
  EvalStatus,
  EventType,
  ExitReason,
  FeedKind,
  HealthState,
  NotificationType,
  OrderType,
  PerformanceRange,
  PriceLevelKind,
  Regime,
  RiskMeterStatus,
  RiskStatus,
  Severity,
  Side,
  Signal,
  StrategyName,
  Timeframe,
  Tone,
  TradeResult,
  TradingMode,
  Trend,
} from "@/types";

export interface Meta {
  label: string;
  /** Compact label for tight spaces (badges in tables, mobile). */
  short?: string;
  tone: Tone;
  icon: LucideIcon;
  description?: string;
}

// ---------------------------------------------------------------- navigation

export interface NavItem {
  key: string;
  label: string;
  /** Label for the phone bottom bar / compact nav. */
  shortLabel: string;
  path: string;
  icon: LucideIcon;
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    key: "overview",
    label: "Overview",
    shortLabel: "Overview",
    path: "/",
    icon: LayoutDashboard,
    description: "Portfolio, market and AI state at a glance",
  },
  {
    key: "markets",
    label: "Markets",
    shortLabel: "Markets",
    path: "/markets",
    icon: ChartCandlestick,
    description: "Live charts, indicators, multi-timeframe and regime",
  },
  {
    key: "positions",
    label: "Positions",
    shortLabel: "Positions",
    path: "/positions",
    icon: Layers,
    description: "Open positions with live P&L and risk",
  },
  {
    key: "trades",
    label: "Trades",
    shortLabel: "Trades",
    path: "/trades",
    icon: ArrowLeftRight,
    description: "Closed trades, filters and export",
  },
  {
    key: "ai",
    label: "AI Analysis",
    shortLabel: "AI",
    path: "/ai",
    icon: BrainCircuit,
    description: "AI decisions, reasoning, accuracy and usage",
  },
  {
    key: "performance",
    label: "Performance",
    shortLabel: "Perf.",
    path: "/performance",
    icon: ChartLine,
    description: "Equity curve, returns and trading statistics",
  },
  {
    key: "risk",
    label: "Risk",
    shortLabel: "Risk",
    path: "/risk",
    icon: ShieldCheck,
    description: "Limits, exposure, drawdown and halts",
  },
  {
    key: "backtests",
    label: "Backtests",
    shortLabel: "Backtests",
    path: "/backtests",
    icon: FlaskConical,
    description: "Run and compare strategy backtests",
  },
  {
    key: "system",
    label: "System",
    shortLabel: "System",
    path: "/system",
    icon: Server,
    description: "Component health, resources and event log",
  },
  {
    key: "settings",
    label: "Settings",
    shortLabel: "Settings",
    path: "/settings",
    icon: Settings,
    description: "Trading, risk, AI and notification settings",
  },
];

export function navItem(key: string): NavItem {
  const item = NAV_ITEMS.find((n) => n.key === key);
  if (!item) throw new Error(`Unknown nav item ${key}`);
  return item;
}

// ---------------------------------------------------------------- market

export const REGIME_META: Record<Regime, Meta> = {
  TRENDING_BULLISH: {
    label: "Trending bullish",
    short: "Bull trend",
    tone: "up",
    icon: TrendingUp,
    description: "Sustained up-move: rising EMA stack, higher highs and lows, strong ADX.",
  },
  TRENDING_BEARISH: {
    label: "Trending bearish",
    short: "Bear trend",
    tone: "down",
    icon: TrendingDown,
    description: "Sustained down-move: falling EMA stack, lower highs and lows, strong ADX.",
  },
  RANGING: {
    label: "Ranging",
    short: "Range",
    tone: "info",
    icon: MoveHorizontal,
    description: "Price oscillates inside a band; trend strength is low.",
  },
  HIGH_VOLATILITY: {
    label: "High volatility",
    short: "High vol",
    tone: "warning",
    icon: Flame,
    description: "Unusually large ranges (ATR / Bollinger width); stops get hit more often.",
  },
  LOW_VOLATILITY: {
    label: "Low volatility",
    short: "Low vol",
    tone: "muted",
    icon: Waves,
    description: "Compressed ranges; breakouts often follow.",
  },
  BREAKOUT: {
    label: "Breakout",
    short: "Breakout",
    tone: "accent",
    icon: Rocket,
    description: "Price leaving a compression range with expanding volume.",
  },
  UNKNOWN: {
    label: "Unknown",
    short: "Unknown",
    tone: "muted",
    icon: CircleHelp,
    description: "Not enough data to classify the regime yet.",
  },
};

export const SIGNAL_META: Record<Signal, Meta> = {
  LONG: { label: "Long", tone: "up", icon: ArrowUpRight, description: "Expecting price to rise." },
  SHORT: { label: "Short", tone: "down", icon: ArrowDownRight, description: "Expecting price to fall." },
  HOLD: {
    label: "Hold",
    tone: "neutral",
    icon: Pause,
    description: "No trade: stay flat or keep the position.",
  },
};

export const SIDE_META: Record<Side, Meta> = {
  LONG: { label: "Long", tone: "up", icon: ArrowUpRight },
  SHORT: { label: "Short", tone: "down", icon: ArrowDownRight },
};

export const TREND_META: Record<Trend, Meta> = {
  BULL: { label: "Bullish", short: "Bull", tone: "up", icon: TrendingUp },
  BEAR: { label: "Bearish", short: "Bear", tone: "down", icon: TrendingDown },
  NEUTRAL: { label: "Neutral", short: "Flat", tone: "neutral", icon: Minus },
};

export const EMA_ALIGNMENT_META: Record<EmaAlignment, Meta> = {
  BULLISH: { label: "Bullish stack", short: "Bullish", tone: "up", icon: TrendingUp },
  BEARISH: { label: "Bearish stack", short: "Bearish", tone: "down", icon: TrendingDown },
  MIXED: { label: "Mixed", short: "Mixed", tone: "neutral", icon: MoveHorizontal },
};

export const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

export const TIMEFRAME_LABEL: Record<Timeframe, string> = {
  "1m": "1 minute",
  "5m": "5 minutes",
  "15m": "15 minutes",
  "1h": "1 hour",
  "4h": "4 hours",
  "1d": "1 day",
};

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3_600,
  "4h": 14_400,
  "1d": 86_400,
};

export const PERFORMANCE_RANGES: { value: PerformanceRange; label: string; description: string }[] = [
  { value: "24h", label: "24H", description: "Last 24 hours" },
  { value: "7d", label: "7D", description: "Last 7 days" },
  { value: "30d", label: "30D", description: "Last 30 days" },
  { value: "90d", label: "90D", description: "Last 90 days" },
  { value: "all", label: "All", description: "All time" },
];

export const FEED_META: Record<FeedKind, Meta> = {
  binance: { label: "Binance", tone: "info", icon: Radio, description: "Live Binance market data." },
  simulated: {
    label: "Simulated",
    tone: "warning",
    icon: Activity,
    description: "Deterministic simulated market (no exchange connection).",
  },
};

export const CHART_MARKER_META: Record<
  ChartMarkerKind,
  Meta & { shape: "arrowUp" | "arrowDown" | "circle" | "square" }
> = {
  entry_long: { label: "Long entry", tone: "up", icon: ArrowUpRight, shape: "arrowUp" },
  entry_short: { label: "Short entry", tone: "down", icon: ArrowDownRight, shape: "arrowDown" },
  exit_win: { label: "Exit (win)", tone: "up", icon: CircleCheck, shape: "circle" },
  exit_loss: { label: "Exit (loss)", tone: "down", icon: CircleX, shape: "circle" },
  stop_loss: { label: "Stop loss", tone: "down", icon: ShieldX, shape: "square" },
  take_profit: { label: "Take profit", tone: "up", icon: Target, shape: "square" },
  signal_long: { label: "Long signal", tone: "ai", icon: ArrowUpRight, shape: "arrowUp" },
  signal_short: { label: "Short signal", tone: "ai", icon: ArrowDownRight, shape: "arrowDown" },
};

export const PRICE_LEVEL_META: Record<PriceLevelKind, Meta> = {
  entry: { label: "Entry", short: "Entry", tone: "accent", icon: LogIn },
  stop_loss: { label: "Stop loss", short: "SL", tone: "down", icon: ShieldX },
  take_profit: { label: "Take profit", short: "TP", tone: "up", icon: Target },
};

// ---------------------------------------------------------------- trading

export const STRATEGY_META: Record<StrategyName, Meta> = {
  ai: {
    label: "AI",
    tone: "ai",
    icon: BrainCircuit,
    description: "The AI analyst's signal is traded (subject to risk checks).",
  },
  hybrid: {
    label: "Hybrid",
    tone: "accent",
    icon: GitCompareArrows,
    description: "AI signal taken only when the technical baseline agrees on direction.",
  },
  baseline: {
    label: "Baseline",
    tone: "neutral",
    icon: ChartLine,
    description: "Classic technical rules (EMA 21/50 trend, MACD and RSI filters, ATR stops); no AI.",
  },
};

export const ORDER_TYPE_META: Record<OrderType, Meta> = {
  market: { label: "Market", tone: "neutral", icon: Activity },
  limit: { label: "Limit", tone: "neutral", icon: Hourglass },
};

export const EXIT_REASON_META: Record<ExitReason, Meta> = {
  STOP_LOSS: {
    label: "Stop loss",
    short: "SL",
    tone: "down",
    icon: ShieldX,
    description: "Price hit the stop.",
  },
  TAKE_PROFIT: {
    label: "Take profit",
    short: "TP",
    tone: "up",
    icon: Target,
    description: "Price reached the target.",
  },
  SIGNAL_REVERSAL: {
    label: "Signal reversal",
    short: "Reversal",
    tone: "info",
    icon: ArrowLeftRight,
    description: "A confident opposite signal closed the position.",
  },
  TIME_EXIT: {
    label: "Time exit",
    short: "Time",
    tone: "muted",
    icon: Timer,
    description: "Closed after the maximum holding time.",
  },
  KILL_SWITCH: {
    label: "Kill switch",
    short: "Kill",
    tone: "warning",
    icon: Power,
    description: "Closed by the daily loss limit (all positions flattened).",
  },
};

export const TRADE_RESULT_META: Record<TradeResult, Meta> = {
  WIN: { label: "Win", tone: "up", icon: TrendingUp },
  LOSS: { label: "Loss", tone: "down", icon: TrendingDown },
  BREAKEVEN: { label: "Breakeven", short: "B/E", tone: "neutral", icon: Minus },
};

export const RISK_STATUS_META: Record<RiskStatus, Meta> = {
  APPROVED: { label: "Approved", tone: "up", icon: ShieldCheck, description: "Passed every risk check." },
  REJECTED: { label: "Rejected", tone: "down", icon: ShieldX, description: "Blocked by the risk manager." },
  NOT_APPLICABLE: {
    label: "Not applicable",
    short: "N/A",
    tone: "muted",
    icon: Minus,
    description: "Nothing to decide (HOLD signal or already positioned).",
  },
};

export const EVAL_STATUS_META: Record<EvalStatus, Meta> = {
  PENDING: {
    label: "Pending",
    tone: "info",
    icon: Hourglass,
    description: "Waiting for target, stop or horizon.",
  },
  CORRECT: {
    label: "Correct",
    tone: "up",
    icon: CircleCheck,
    description: "Virtual target hit before the stop.",
  },
  INCORRECT: { label: "Incorrect", tone: "down", icon: CircleX, description: "Virtual stop hit first." },
  EXPIRED: {
    label: "Expired",
    tone: "muted",
    icon: Clock,
    description: "Neither level hit within the horizon.",
  },
  NOT_APPLICABLE: { label: "Not applicable", short: "N/A", tone: "muted", icon: Minus },
};

export const AI_PROVIDER_META: Record<AIProvider, Meta> = {
  openrouter: { label: "OpenRouter", tone: "ai", icon: BrainCircuit, description: "LLM via OpenRouter." },
  heuristic: {
    label: "Heuristic",
    tone: "neutral",
    icon: SlidersHorizontal,
    description: "Local transparent multi-factor model (no LLM).",
  },
};

// ---------------------------------------------------------------- status, events, notifications

export const TRADING_MODE_META: Record<TradingMode, Meta> = {
  paper: {
    label: "Paper trading",
    short: "Paper",
    tone: "warning",
    icon: FlaskConical,
    description: "Simulated orders against live or simulated prices. No real funds are used.",
  },
  live: {
    label: "Live trading",
    short: "Live",
    tone: "down",
    icon: OctagonAlert,
    description: "Real orders on the exchange. Real funds are at risk.",
  },
};

export const BOT_STATE_META: Record<BotState | "unknown", Meta> = {
  online: {
    label: "Bot online",
    short: "Online",
    tone: "up",
    icon: Bot,
    description: "Heartbeat under 10 s.",
  },
  degraded: {
    label: "Degraded",
    short: "Degraded",
    tone: "warning",
    icon: TriangleAlert,
    description: "Heartbeat between 10 s and 60 s old — the engine is slow or stalled.",
  },
  offline: {
    label: "Bot offline",
    short: "Offline",
    tone: "down",
    icon: Power,
    description: "No heartbeat for over 60 s — the trading engine is not running.",
  },
  unknown: {
    label: "Status unknown",
    short: "Unknown",
    tone: "muted",
    icon: CircleHelp,
    description: "No recent contact with the API, so the bot's state can't be confirmed.",
  },
};

export const CONNECTION_META: Record<ConnectionStatus, Meta> = {
  live: { label: "Live", tone: "up", icon: Radio, description: "Streaming real-time updates." },
  connecting: {
    label: "Connecting…",
    tone: "muted",
    icon: LoaderCircle,
    description: "Opening the live stream.",
  },
  reconnecting: {
    label: "Reconnecting…",
    tone: "warning",
    icon: LoaderCircle,
    description: "Live stream interrupted; retrying with backoff.",
  },
  offline: {
    label: "Offline",
    tone: "down",
    icon: WifiOff,
    description: "No live stream; data refreshes by polling.",
  },
};

export const SEVERITY_META: Record<Severity, Meta> = {
  info: { label: "Info", tone: "info", icon: Info },
  success: { label: "Success", tone: "up", icon: CircleCheck },
  warning: { label: "Warning", tone: "warning", icon: TriangleAlert },
  error: { label: "Error", tone: "down", icon: OctagonAlert },
};

export const HEALTH_STATE_META: Record<HealthState, Meta> = {
  operational: { label: "Operational", tone: "up", icon: CircleCheck },
  warning: { label: "Warning", tone: "warning", icon: TriangleAlert },
  error: { label: "Error", tone: "down", icon: CircleX },
  disabled: { label: "Not configured", short: "Off", tone: "muted", icon: CircleSlash },
};

export const RISK_METER_STATUS_META: Record<RiskMeterStatus, Meta> = {
  ok: { label: "OK", tone: "up", icon: ShieldCheck },
  warning: { label: "Warning", tone: "warning", icon: ShieldAlert },
  critical: { label: "Critical", tone: "down", icon: TriangleAlert },
  breached: { label: "Breached", tone: "down", icon: OctagonAlert },
};

export const BACKTEST_STATUS_META: Record<BacktestStatus, Meta> = {
  queued: { label: "Queued", tone: "muted", icon: Clock },
  running: { label: "Running", tone: "info", icon: LoaderCircle },
  completed: { label: "Completed", tone: "up", icon: CircleCheck },
  failed: { label: "Failed", tone: "down", icon: CircleX },
};

export const EVENT_TYPE_META: Record<EventType, Meta> = {
  MARKET_UPDATE: { label: "Market update", short: "Market", tone: "muted", icon: ChartCandlestick },
  AI_ANALYSIS: { label: "AI analysis", short: "AI", tone: "ai", icon: BrainCircuit },
  TRADE_SIGNAL: { label: "Trade signal", short: "Signal", tone: "accent", icon: Radio },
  RISK_CHECK: { label: "Risk check", short: "Risk", tone: "info", icon: ShieldCheck },
  TRADE_EXECUTED: { label: "Trade executed", short: "Executed", tone: "accent", icon: ArrowLeftRight },
  TRADE_REJECTED: { label: "Trade rejected", short: "Rejected", tone: "warning", icon: Ban },
  TRADE_CLOSED: { label: "Trade closed", short: "Closed", tone: "neutral", icon: CircleCheck },
  STOP_LOSS: { label: "Stop loss", short: "SL", tone: "down", icon: ShieldX },
  TAKE_PROFIT: { label: "Take profit", short: "TP", tone: "up", icon: Target },
  RISK_WARNING: { label: "Risk warning", short: "Risk", tone: "warning", icon: ShieldAlert },
  API_ERROR: { label: "API error", short: "API", tone: "down", icon: PlugZap },
  SYSTEM_WARNING: { label: "System warning", short: "System", tone: "warning", icon: TriangleAlert },
  SYSTEM_INFO: { label: "System", short: "System", tone: "info", icon: Info },
  SETTINGS_CHANGED: { label: "Settings changed", short: "Settings", tone: "accent", icon: SlidersHorizontal },
};

export const NOTIFICATION_TYPE_META: Record<NotificationType, Meta & { route: string }> = {
  TRADE_OPENED: { label: "Trade opened", tone: "accent", icon: ArrowLeftRight, route: "/positions" },
  TRADE_CLOSED: { label: "Trade closed", tone: "neutral", icon: CircleCheck, route: "/trades" },
  STOP_LOSS_HIT: { label: "Stop loss hit", tone: "down", icon: ShieldX, route: "/trades" },
  TAKE_PROFIT_HIT: { label: "Take profit hit", tone: "up", icon: Target, route: "/trades" },
  DAILY_LOSS_WARNING: { label: "Daily loss warning", tone: "warning", icon: TriangleAlert, route: "/risk" },
  DAILY_LOSS_LIMIT: { label: "Daily loss limit", tone: "down", icon: OctagonAlert, route: "/risk" },
  RISK_LIMIT: { label: "Risk limit", tone: "warning", icon: ShieldAlert, route: "/risk" },
  BOT_ERROR: { label: "Bot error", tone: "down", icon: Bot, route: "/system" },
  API_FAILURE: { label: "API failure", tone: "down", icon: PlugZap, route: "/system" },
  AI_UNAVAILABLE: { label: "AI unavailable", tone: "warning", icon: BrainCircuit, route: "/ai" },
  MARKET_DATA_UNAVAILABLE: {
    label: "Market data unavailable",
    tone: "warning",
    icon: WifiOff,
    route: "/system",
  },
  SYSTEM: { label: "System", tone: "info", icon: Info, route: "/system" },
};

/** Notification types that also pop a toast when they arrive live. */
export const TOASTED_NOTIFICATION_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  "TRADE_OPENED",
  "TRADE_CLOSED",
  "STOP_LOSS_HIT",
  "TAKE_PROFIT_HIT",
  "DAILY_LOSS_WARNING",
  "DAILY_LOSS_LIMIT",
  "RISK_LIMIT",
  "BOT_ERROR",
  "API_FAILURE",
  "AI_UNAVAILABLE",
  "MARKET_DATA_UNAVAILABLE",
]);

/** Placeholder icon for "nothing here yet" states. */
export const EMPTY_ICON = CircleDashed;
