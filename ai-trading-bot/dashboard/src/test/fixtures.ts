/**
 * Typed test fixtures for contract models. Each factory returns a complete, valid object
 * (the generated types make every field required), with overrides for what a test cares about.
 */
import type {
  AIAnalysis,
  BotSettings,
  BotStatus,
  EngineStatus,
  Event,
  Kpi,
  MTFReport,
  Notification,
  NotificationList,
  Portfolio,
  PortfolioKpis,
  Position,
  RegimeReport,
  RegimeState,
  RiskSnapshot,
  SettingsResponse,
  Ticker,
  Trade,
} from "@/types";

const T0 = "2026-10-04T12:00:00Z";

export function makeEngineStatus(overrides: Partial<EngineStatus> = {}): EngineStatus {
  return {
    mode: "paper",
    running: true,
    trading_allowed: true,
    halt_reason: null,
    strategy: "ai",
    symbols: ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
    primary_symbol: "BTC/USDT",
    decision_timeframe: "5m",
    feed: "simulated",
    feed_connected: true,
    feed_message: null,
    ai_provider: "heuristic",
    ai_model: "heuristic-v1",
    openrouter_configured: false,
    settings_version: 1,
    started_at: "2026-10-04T10:00:00Z",
    heartbeat_at: T0,
    last_market_update: T0,
    last_ai_analysis: T0,
    last_trade: null,
    next_analysis_at: null,
    version: "1.0.0",
    pid: 4242,
    cpu_pct: 3.1,
    rss_mb: 180,
    ...overrides,
  };
}

export function makeStatus(overrides: Partial<BotStatus> = {}): BotStatus {
  return {
    state: "online",
    online: true,
    heartbeat_age_sec: 1.2,
    mode: "paper",
    engine: makeEngineStatus(),
    api_version: "1.0.0",
    server_time: T0,
    ...overrides,
  };
}

export function makeTicker(overrides: Partial<Ticker> = {}): Ticker {
  return {
    symbol: "BTC/USDT",
    price: 97_123.45,
    change_24h: 1_210.5,
    change_24h_pct: 1.26,
    high_24h: 97_800,
    low_24h: 95_400,
    volume_24h: 12_345.6,
    quote_volume_24h: 1_198_000_000,
    ts: T0,
    sparkline: [95_900, 96_200, 96_800, 97_123.45],
    ...overrides,
  };
}

export function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 1,
    ts: T0,
    type: "AI_ANALYSIS",
    severity: "info",
    symbol: "BTC/USDT",
    title: "AI analysis",
    message: "HOLD at 62% confidence",
    data: {},
    ...overrides,
  };
}

export function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 1,
    ts: T0,
    type: "TRADE_OPENED",
    severity: "info",
    title: "Long BTC/USDT opened",
    message: "0.0123 BTC at 97,123.45",
    read: false,
    data: {},
    ...overrides,
  };
}

export function makeNotificationList(items: Notification[] = []): NotificationList {
  return { items, unread_count: items.filter((n) => !n.read).length, total: items.length };
}

export function makeKpi(overrides: Partial<Kpi> = {}): Kpi {
  return {
    value: 10_482.31,
    previous: 10_300,
    change: 182.31,
    change_pct: 1.77,
    comparison_label: "vs 24h ago",
    sparkline: [10_300, 10_350, 10_330, 10_410, 10_482.31],
    ...overrides,
  };
}

export function makeKpis(overrides: Partial<PortfolioKpis> = {}): PortfolioKpis {
  return {
    equity: makeKpi(),
    today_pnl: makeKpi({ value: 82.31, previous: -40, change: 122.31, change_pct: null, comparison_label: "vs yesterday" }),
    total_pnl: makeKpi({ value: 482.31, previous: 300, change: 182.31, change_pct: 60.77 }),
    win_rate: makeKpi({ value: 58.3, previous: 52.1, change: 6.2, change_pct: 11.9, comparison_label: "vs prior 7d" }),
    profit_factor: makeKpi({ value: 1.62, previous: 1.31, change: 0.31, change_pct: 23.66, comparison_label: "vs prior 7d" }),
    max_drawdown: makeKpi({ value: -4.21, previous: -3.9, change: -0.31, change_pct: -7.95, comparison_label: "vs 7d ago" }),
    open_positions: makeKpi({ value: 2, previous: 1, change: 1, change_pct: 100, sparkline: [1, 1, 2, 2] }),
    trades_today: makeKpi({ value: 5, previous: 7, change: -2, change_pct: -28.57, comparison_label: "vs yesterday" }),
    ...overrides,
  };
}

export function makePortfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  return {
    mode: "paper",
    starting_balance: 10_000,
    equity: 10_482.31,
    cash: 9_100,
    realized_pnl: 400,
    unrealized_pnl: 82.31,
    total_pnl: 482.31,
    total_pnl_pct: 4.82,
    today_pnl: 82.31,
    today_pnl_pct: 0.79,
    exposure: 4_210,
    exposure_pct: 40.16,
    open_positions: 2,
    trades_today: 5,
    peak_equity: 10_600,
    drawdown_pct: -1.11,
    updated_at: T0,
    kpis: makeKpis(),
    ...overrides,
  };
}

export function makePosition(overrides: Partial<Position> = {}): Position {
  return {
    id: "pos_0123456789ab",
    symbol: "BTC/USDT",
    side: "LONG",
    size: 0.0123,
    notional: 1_194.62,
    entry_price: 97_123.45,
    current_price: 97_400,
    stop_loss: 96_200,
    take_profit: 98_900,
    unrealized_pnl: 2.8,
    unrealized_pnl_pct: 0.23,
    r_multiple: 0.2,
    fees_paid: 0.6,
    risk_amount: 11.36,
    risk_pct: 0.11,
    opened_at: "2026-10-04T11:30:00Z",
    duration_sec: 1_800,
    ai_confidence: 74,
    analysis_id: "dec_0123456789ab",
    strategy: "ai",
    regime: "TRENDING_BULLISH",
    order_type: "market",
    entry_reason: "EMA stack bullish with rising MACD",
    mfe_pct: 0.4,
    mae_pct: -0.1,
    distance_to_sl_pct: 1.23,
    distance_to_tp_pct: 1.54,
    ...overrides,
  };
}

export function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: "pos_aaaaaaaaaaaa",
    symbol: "BTC/USDT",
    side: "LONG",
    size: 0.0123,
    notional: 1_194.62,
    entry_price: 97_123.45,
    exit_price: 98_900,
    stop_loss: 96_200,
    take_profit: 98_900,
    opened_at: "2026-10-04T09:00:00Z",
    closed_at: "2026-10-04T11:00:00Z",
    duration_sec: 7_200,
    pnl: 20.65,
    pnl_pct: 1.73,
    gross_pnl: 21.85,
    fees: 1.2,
    result: "WIN",
    exit_reason: "TAKE_PROFIT",
    r_multiple: 1.9,
    ai_confidence: 78,
    analysis_id: "dec_aaaaaaaaaaaa",
    strategy: "ai",
    regime: "TRENDING_BULLISH",
    entry_reason: "Breakout above range high",
    mfe_pct: 1.9,
    mae_pct: -0.2,
    ...overrides,
  };
}

export function makeAnalysis(overrides: Partial<AIAnalysis> = {}): AIAnalysis {
  return {
    id: "dec_0123456789ab",
    symbol: "BTC/USDT",
    timeframe: "5m",
    created_at: T0,
    signal: "LONG",
    confidence: 74,
    regime: "TRENDING_BULLISH",
    regime_confidence: 81,
    price: 97_123.45,
    entry: 97_123.45,
    stop_loss: 96_200,
    take_profit: 98_900,
    risk_reward: 1.92,
    summary: "Uptrend intact; momentum building.",
    reasons: ["EMA 21 above EMA 50"],
    risks: ["RSI near overbought"],
    invalidation: "Close below 96,200 (EMA 50)",
    detailed_reasoning: "…",
    indicators: {
      price: 97_123.45,
      ema9: null,
      ema21: null,
      ema50: null,
      ema200: null,
      vwap: null,
      bb_upper: null,
      bb_middle: null,
      bb_lower: null,
      bb_width_pct: null,
      rsi: 61,
      macd: null,
      macd_signal: null,
      macd_hist: null,
      atr: null,
      atr_pct: null,
      adx: null,
      volume: null,
      volume_avg20: null,
      volume_ratio: null,
    },
    mtf: [],
    strategy: "ai",
    baseline_signal: "LONG",
    provider: "heuristic",
    model: "heuristic-v1",
    latency_ms: 12,
    prompt_tokens: 0,
    completion_tokens: 0,
    cost_usd: 0,
    fallback_reason: null,
    risk: {
      status: "APPROVED",
      reasons: [],
      checks: [],
      position_size: 0.0123,
      notional: 1_194.62,
      risk_amount: 11.36,
      risk_pct: 0.11,
    },
    trade_id: null,
    evaluation: { status: "PENDING", resolved_at: null, return_pct: null, hit: null },
    ...overrides,
  };
}

export function makeRisk(overrides: Partial<RiskSnapshot> = {}): RiskSnapshot {
  return {
    trading_allowed: true,
    halt_reason: null,
    halted_until: null,
    equity: 10_482.31,
    current_exposure: 4_210,
    current_exposure_pct: 40.16,
    max_exposure_pct: 150,
    risk_per_trade_pct: 1,
    open_risk: 22.7,
    open_risk_pct: 0.22,
    daily_pnl: 82.31,
    daily_loss: 0,
    max_daily_loss: 200,
    drawdown_pct: -1.11,
    max_drawdown_pct: -4.21,
    max_drawdown_limit_pct: 15,
    open_positions: 2,
    max_positions: 3,
    consecutive_losses: 0,
    max_consecutive_losses: 4,
    min_risk_reward: 1.5,
    min_confidence: 65,
    rejections_today: 3,
    meters: [],
    warnings: [],
    updated_at: T0,
    ...overrides,
  };
}

export function makeRegimeState(overrides: Partial<RegimeState> = {}): RegimeState {
  return {
    symbol: "BTC/USDT",
    regime: "TRENDING_BULLISH",
    confidence: 81,
    since: "2026-10-04T08:00:00Z",
    metrics: { adx: 31.2 },
    updated_at: T0,
    ...overrides,
  };
}

export function makeRegimeReport(overrides: Partial<RegimeReport> = {}): RegimeReport {
  return { symbol: "BTC/USDT", current: makeRegimeState(), performance: [], history: [], ...overrides };
}

export function makeMtf(overrides: Partial<MTFReport> = {}): MTFReport {
  return {
    symbol: "BTC/USDT",
    timeframes: [],
    aligned_count: 4,
    total: 5,
    dominant: "BULL",
    alignment_label: "4/5 TIMEFRAMES ALIGNED",
    updated_at: T0,
    ...overrides,
  };
}

export function makeSettings(overrides: Partial<BotSettings> = {}): BotSettings {
  return {
    trading: {
      symbols: ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
      primary_symbol: "BTC/USDT",
      decision_timeframe: "5m",
      strategy: "ai",
      allow_shorts: true,
      max_holding_minutes: 720,
      paper_trading: true,
      live_trading: false,
    },
    risk: {
      risk_per_trade_pct: 1,
      max_daily_loss_usd: 200,
      max_positions: 3,
      min_risk_reward: 1.5,
      min_ai_confidence: 65,
      max_consecutive_losses: 4,
      loss_streak_cooldown_minutes: 60,
      max_drawdown_pct: 15,
      max_exposure_pct: 150,
      max_position_pct: 50,
    },
    execution: { order_type: "market", fee_bps: 5, slippage_bps: 2, limit_order_timeout_minutes: 15 },
    ai: {
      model: "anthropic/claude-haiku-4.5",
      fallback_models: [],
      temperature: 0.2,
      max_tokens: 900,
      request_timeout_sec: 30,
      retry_count: 2,
      heuristic_fallback: true,
    },
    notifications: {
      telegram_enabled: false,
      telegram_configured: false,
      discord_enabled: false,
      discord_configured: false,
      email_enabled: false,
      email_configured: false,
      email_to: null,
      events: ["TRADE_OPENED", "TRADE_CLOSED"],
    },
    version: 1,
    updated_at: T0,
    ...overrides,
  };
}

export function makeSettingsResponse(overrides: Partial<SettingsResponse> = {}): SettingsResponse {
  return { settings: makeSettings(), applied_version: 1, restart_required: [], ...overrides };
}
