"""Data contract shared by the engine (writer), the API (reader) and the dashboard.

This module is the single source of truth for every shape that crosses a
process boundary: rows the engine persists as JSON payloads, REST responses,
and WebSocket messages. The dashboard's TypeScript types are generated from
these models (``dashboard/scripts/gen-types``), so a change here is a change to
the public API.

Unit conventions (apply everywhere, no exceptions):
- Money is quote currency (USDT), as float.
- Any field ending in ``_pct``, plus ``confidence``, ``win_rate``,
  ``*_accuracy``, ``utilization_pct`` and ``progress``, is in **percent units**:
  ``4.82`` means 4.82 %. Ratios (``profit_factor``, ``sharpe``, ``sortino``,
  ``risk_reward``, ``recovery_factor``, ``r_multiple``) are plain numbers.
- ``datetime`` values are timezone-aware UTC and serialize as ISO 8601 with ``Z``.
- Chart times (``time`` on candles, line points, markers, equity points) are
  **unix seconds** (UTC), the format TradingView Lightweight Charts expects.
- Symbols use the slash form: ``BTC/USDT``.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# --------------------------------------------------------------------------
# Enumerations (string literals so the generated TypeScript gets unions)
# --------------------------------------------------------------------------

Side = Literal["LONG", "SHORT"]
Signal = Literal["LONG", "SHORT", "HOLD"]
Timeframe = Literal["1m", "5m", "15m", "1h", "4h", "1d"]
TIMEFRAMES: tuple[Timeframe, ...] = ("1m", "5m", "15m", "1h", "4h", "1d")
TIMEFRAME_SECONDS: dict[str, int] = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "1h": 3600,
    "4h": 14400,
    "1d": 86400,
}

Regime = Literal[
    "TRENDING_BULLISH",
    "TRENDING_BEARISH",
    "RANGING",
    "HIGH_VOLATILITY",
    "LOW_VOLATILITY",
    "BREAKOUT",
    "UNKNOWN",
]
REGIMES: tuple[Regime, ...] = (
    "TRENDING_BULLISH",
    "TRENDING_BEARISH",
    "RANGING",
    "HIGH_VOLATILITY",
    "LOW_VOLATILITY",
    "BREAKOUT",
    "UNKNOWN",
)
Trend = Literal["BULL", "BEAR", "NEUTRAL"]
EmaAlignment = Literal["BULLISH", "BEARISH", "MIXED"]

TradingMode = Literal["paper", "live"]
StrategyName = Literal["ai", "hybrid", "baseline"]
OrderType = Literal["market", "limit"]
FeedKind = Literal["binance", "simulated"]
FeedSetting = Literal["auto", "binance", "simulated"]
AIProvider = Literal["openrouter", "heuristic"]
HEURISTIC_MODEL_ID = "heuristic-v1"

Severity = Literal["info", "success", "warning", "error"]
# "disabled" = not configured / intentionally off (render grey, not red)
HealthState = Literal["operational", "warning", "error", "disabled"]
BotState = Literal["online", "degraded", "offline"]

ExitReason = Literal["STOP_LOSS", "TAKE_PROFIT", "SIGNAL_REVERSAL", "TIME_EXIT", "KILL_SWITCH"]
TradeResult = Literal["WIN", "LOSS", "BREAKEVEN"]
# NOT_APPLICABLE: HOLD signals, or nothing to decide (e.g. already positioned that way)
RiskStatus = Literal["APPROVED", "REJECTED", "NOT_APPLICABLE"]
# Shadow evaluation of every directional signal, executed or not:
# CORRECT = virtual TP hit before SL, INCORRECT = SL first, EXPIRED = neither within horizon.
EvalStatus = Literal["PENDING", "CORRECT", "INCORRECT", "EXPIRED", "NOT_APPLICABLE"]
RiskMeterStatus = Literal["ok", "warning", "critical", "breached"]

EventType = Literal[
    "MARKET_UPDATE",  # decision-timeframe candle close (not every tick)
    "AI_ANALYSIS",
    "TRADE_SIGNAL",
    "RISK_CHECK",
    "TRADE_EXECUTED",
    "TRADE_REJECTED",
    "TRADE_CLOSED",
    "STOP_LOSS",
    "TAKE_PROFIT",
    "RISK_WARNING",
    "API_ERROR",
    "SYSTEM_WARNING",
    "SYSTEM_INFO",
    "SETTINGS_CHANGED",
]
NotificationType = Literal[
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
    "SYSTEM",
]
PerformanceRange = Literal["24h", "7d", "30d", "90d", "all"]
BacktestStatus = Literal["queued", "running", "completed", "failed"]
ChartMarkerKind = Literal[
    "entry_long",
    "entry_short",
    "exit_win",
    "exit_loss",
    "stop_loss",
    "take_profit",
    "signal_long",
    "signal_short",
]
PriceLevelKind = Literal["entry", "stop_loss", "take_profit"]


class Model(BaseModel):
    """Base for every contract model: tolerant reader, strict-enough writer."""

    # serialization-mode JSON Schema marks defaulted fields as required: responses always carry them,
    # so the generated TypeScript types don't make them optional.
    model_config = ConfigDict(
        extra="ignore", populate_by_name=True, json_schema_serialization_defaults_required=True
    )


# --------------------------------------------------------------------------
# Market data
# --------------------------------------------------------------------------


class Candle(Model):
    time: int = Field(description="Candle open time, unix seconds UTC")
    open: float
    high: float
    low: float
    close: float
    volume: float = Field(description="Base-asset volume")


class LinePoint(Model):
    time: int
    value: float


class Ticker(Model):
    symbol: str
    price: float
    change_24h: float
    change_24h_pct: float
    high_24h: float
    low_24h: float
    volume_24h: float = Field(description="Base-asset volume over 24h")
    quote_volume_24h: float
    ts: datetime
    sparkline: list[float] = Field(default_factory=list, description="Last 24h of hourly closes")


class IndicatorSnapshot(Model):
    """Indicator values on the latest completed candle of one timeframe."""

    price: float
    ema9: float | None = None
    ema21: float | None = None
    ema50: float | None = None
    ema200: float | None = None
    vwap: float | None = None
    bb_upper: float | None = None
    bb_middle: float | None = None
    bb_lower: float | None = None
    bb_width_pct: float | None = None
    rsi: float | None = None
    macd: float | None = None
    macd_signal: float | None = None
    macd_hist: float | None = None
    atr: float | None = None
    atr_pct: float | None = None
    adx: float | None = None
    volume: float | None = None
    volume_avg20: float | None = None
    volume_ratio: float | None = Field(default=None, description="volume / 20-bar average")


class IndicatorSeries(Model):
    """Overlay series aligned to the candles of a MarketSnapshot."""

    ema9: list[LinePoint] = Field(default_factory=list)
    ema21: list[LinePoint] = Field(default_factory=list)
    ema50: list[LinePoint] = Field(default_factory=list)
    ema200: list[LinePoint] = Field(default_factory=list)
    vwap: list[LinePoint] = Field(default_factory=list)
    bb_upper: list[LinePoint] = Field(default_factory=list)
    bb_middle: list[LinePoint] = Field(default_factory=list)
    bb_lower: list[LinePoint] = Field(default_factory=list)


class ChartMarker(Model):
    time: int = Field(description="Unix seconds, snapped to the candle open time of the chart timeframe")
    kind: ChartMarkerKind
    price: float
    label: str
    trade_id: str | None = None


class PriceLevel(Model):
    kind: PriceLevelKind
    price: float
    label: str
    position_id: str
    side: Side


class TimeframeSignal(Model):
    timeframe: Timeframe
    trend: Trend
    signal: Signal
    rsi: float | None = None
    strength: float = Field(description="0-100 directional strength")
    ema_alignment: EmaAlignment
    macd_hist: float | None = None
    price_vs_ema200_pct: float | None = None


class MTFReport(Model):
    symbol: str
    timeframes: list[TimeframeSignal]
    aligned_count: int = Field(description="Timeframes agreeing with the dominant trend")
    total: int
    dominant: Trend
    alignment_label: str = Field(description='e.g. "4/4 TIMEFRAMES ALIGNED"')
    updated_at: datetime


class RegimeState(Model):
    symbol: str
    regime: Regime
    confidence: float
    since: datetime | None = None
    metrics: dict[str, float] = Field(
        default_factory=dict, description="adx, atr_pct, bb_width_pct, ema_slope_pct, ..."
    )
    updated_at: datetime


class RegimePerformance(Model):
    regime: Regime
    trades: int
    wins: int
    win_rate: float | None = None
    avg_trade_pct: float | None = None
    total_pnl: float
    profit_factor: float | None = None


class RegimeSegment(Model):
    regime: Regime
    start: datetime
    end: datetime | None = None
    confidence: float


class RegimeReport(Model):
    symbol: str
    current: RegimeState | None
    performance: list[RegimePerformance]
    history: list[RegimeSegment]


class MarketSnapshot(Model):
    symbol: str
    timeframe: Timeframe
    feed: FeedKind
    ticker: Ticker | None
    candles: list[Candle]
    indicators: IndicatorSeries
    markers: list[ChartMarker]
    levels: list[PriceLevel] = Field(description="Entry / SL / TP of open positions on this symbol")
    updated_at: datetime


# --------------------------------------------------------------------------
# AI analysis and risk decisions
# --------------------------------------------------------------------------


class RiskCheck(Model):
    name: str = Field(description='Human label, e.g. "Risk / reward"')
    passed: bool
    value: str | None = Field(default=None, description='Display string, e.g. "1.2"')
    limit: str | None = Field(default=None, description='Display string, e.g. "≥ 1.5"')
    detail: str | None = None


class RiskDecision(Model):
    status: RiskStatus
    reasons: list[str] = Field(default_factory=list, description="Why it was rejected / not applicable")
    checks: list[RiskCheck] = Field(default_factory=list)
    position_size: float | None = Field(default=None, description="Base units, when approved")
    notional: float | None = None
    risk_amount: float | None = Field(default=None, description="Quote currency lost if the stop is hit")
    risk_pct: float | None = Field(default=None, description="risk_amount as % of equity")


class SignalEvaluation(Model):
    status: EvalStatus
    resolved_at: datetime | None = None
    return_pct: float | None = Field(default=None, description="Move in the signal's direction at resolution")
    hit: Literal["TP", "SL", "HORIZON"] | None = None


class AIAnalysis(Model):
    id: str
    symbol: str
    timeframe: Timeframe
    created_at: datetime
    signal: Signal
    confidence: float
    regime: Regime
    regime_confidence: float
    price: float
    entry: float | None = None
    stop_loss: float | None = None
    take_profit: float | None = None
    risk_reward: float | None = None
    summary: str = Field(description="One or two sentences, plain language")
    reasons: list[str] = Field(description='Supporting evidence bullets ("EMA 21 above EMA 50")')
    risks: list[str] = Field(default_factory=list, description="Counter-evidence / caveats bullets")
    invalidation: str | None = Field(default=None, description='e.g. "Close below $61,240 (EMA 50)"')
    detailed_reasoning: str = Field(description="Longer free-text reasoning for the expandable section")
    indicators: IndicatorSnapshot
    mtf: list[TimeframeSignal] = Field(default_factory=list)
    strategy: StrategyName
    baseline_signal: Signal | None = Field(default=None, description="What the technical baseline said")
    provider: AIProvider
    model: str
    latency_ms: int
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost_usd: float = 0.0
    fallback_reason: str | None = Field(
        default=None, description="Set when OpenRouter was configured but the heuristic had to answer"
    )
    risk: RiskDecision
    trade_id: str | None = None
    evaluation: SignalEvaluation


class AIDecisionPage(Model):
    items: list[AIAnalysis]
    total: int
    limit: int
    offset: int


# --------------------------------------------------------------------------
# Positions and trades
# --------------------------------------------------------------------------


class Position(Model):
    id: str
    symbol: str
    side: Side
    size: float = Field(description="Base units")
    notional: float = Field(description="Entry notional in quote currency")
    entry_price: float
    current_price: float
    stop_loss: float
    take_profit: float
    unrealized_pnl: float = Field(description="Net of the entry fee already paid")
    unrealized_pnl_pct: float = Field(description="unrealized_pnl / notional * 100")
    r_multiple: float = Field(description="unrealized_pnl / risk_amount")
    fees_paid: float
    risk_amount: float
    risk_pct: float = Field(description="risk_amount as % of equity at entry")
    opened_at: datetime
    duration_sec: int
    ai_confidence: float | None = None
    analysis_id: str | None = None
    strategy: StrategyName
    regime: Regime
    order_type: OrderType
    entry_reason: str = ""
    mfe_pct: float = Field(default=0.0, description="Max favourable excursion, % of entry price")
    mae_pct: float = Field(default=0.0, description="Max adverse excursion, % of entry price (<= 0)")
    distance_to_sl_pct: float = 0.0
    distance_to_tp_pct: float = 0.0


class Trade(Model):
    """A closed round trip."""

    id: str
    symbol: str
    side: Side
    size: float
    notional: float
    entry_price: float
    exit_price: float
    stop_loss: float
    take_profit: float
    opened_at: datetime
    closed_at: datetime
    duration_sec: int
    pnl: float = Field(description="Net of all fees")
    pnl_pct: float = Field(description="pnl / notional * 100")
    gross_pnl: float
    fees: float
    result: TradeResult
    exit_reason: ExitReason
    r_multiple: float
    ai_confidence: float | None = None
    analysis_id: str | None = None
    strategy: StrategyName
    regime: Regime
    entry_reason: str = ""
    mfe_pct: float = 0.0
    mae_pct: float = 0.0


class TradeSummary(Model):
    count: int
    wins: int
    losses: int
    win_rate: float | None = None
    net_pnl: float
    fees: float
    avg_pnl_pct: float | None = None


class TradePage(Model):
    items: list[Trade]
    total: int
    limit: int
    offset: int
    summary: TradeSummary = Field(description="Aggregates over the whole filtered set, not just this page")


class PositionDetail(Model):
    position: Position
    analysis: AIAnalysis | None
    timeframe: Timeframe
    candles: list[Candle]
    markers: list[ChartMarker]


class TradeDetail(Model):
    trade: Trade
    analysis: AIAnalysis | None
    timeframe: Timeframe
    candles: list[Candle]
    markers: list[ChartMarker]


# --------------------------------------------------------------------------
# Portfolio and KPIs
# --------------------------------------------------------------------------


class PortfolioState(Model):
    """Live core numbers the engine publishes (live_state key ``portfolio``)."""

    mode: TradingMode
    starting_balance: float
    equity: float
    cash: float
    realized_pnl: float
    unrealized_pnl: float
    total_pnl: float
    total_pnl_pct: float
    today_pnl: float = Field(description="Realized today (UTC) + change in unrealized since UTC midnight")
    today_pnl_pct: float
    exposure: float = Field(description="Sum of |notional| of open positions at current prices")
    exposure_pct: float
    open_positions: int
    trades_today: int
    peak_equity: float
    drawdown_pct: float = Field(description="Current drawdown from peak, <= 0")
    updated_at: datetime


class Kpi(Model):
    value: float | None
    previous: float | None = None
    change: float | None = None
    change_pct: float | None = None
    comparison_label: str = Field(description='e.g. "vs yesterday", "vs prior 7d"')
    sparkline: list[float] = Field(default_factory=list)


class PortfolioKpis(Model):
    equity: Kpi
    today_pnl: Kpi
    total_pnl: Kpi
    win_rate: Kpi
    profit_factor: Kpi
    max_drawdown: Kpi
    open_positions: Kpi
    trades_today: Kpi


class Portfolio(PortfolioState):
    """GET /api/portfolio and WS ``portfolio``: live state plus history-based KPIs."""

    kpis: PortfolioKpis


# --------------------------------------------------------------------------
# Risk
# --------------------------------------------------------------------------


class RiskMeter(Model):
    key: Literal[
        "daily_loss",
        "drawdown",
        "exposure",
        "positions",
        "consecutive_losses",
        "daily_risk",
    ]
    label: str
    current: float
    limit: float
    unit: Literal["usd", "pct", "count"]
    utilization_pct: float
    status: RiskMeterStatus
    message: str | None = Field(default=None, description='e.g. "APPROACHING DAILY LIMIT"')


class RiskSnapshot(Model):
    """live_state key ``risk``; GET /api/risk; WS ``risk``."""

    trading_allowed: bool
    halt_reason: str | None = None
    halted_until: datetime | None = None
    equity: float
    current_exposure: float
    current_exposure_pct: float
    max_exposure_pct: float
    risk_per_trade_pct: float
    open_risk: float = Field(description="Sum of risk_amount over open positions")
    open_risk_pct: float
    daily_pnl: float
    daily_loss: float = Field(description="max(0, -daily_pnl)")
    max_daily_loss: float
    drawdown_pct: float
    max_drawdown_pct: float = Field(description="Worst drawdown observed so far (<= 0)")
    max_drawdown_limit_pct: float = Field(description="Halt threshold, positive number")
    open_positions: int
    max_positions: int
    consecutive_losses: int
    max_consecutive_losses: int
    min_risk_reward: float
    min_confidence: float
    rejections_today: int
    meters: list[RiskMeter]
    warnings: list[str] = Field(default_factory=list)
    updated_at: datetime


# --------------------------------------------------------------------------
# Status, system health, events, notifications
# --------------------------------------------------------------------------


class EngineStatus(Model):
    """live_state key ``status``; refreshed every heartbeat (~2 s)."""

    mode: TradingMode
    running: bool
    trading_allowed: bool
    halt_reason: str | None = None
    strategy: StrategyName
    symbols: list[str]
    primary_symbol: str
    decision_timeframe: Timeframe
    feed: FeedKind
    feed_connected: bool
    feed_message: str | None = None
    ai_provider: AIProvider = Field(description="Provider that answered the most recent analysis")
    ai_model: str
    openrouter_configured: bool
    settings_version: int = Field(description="Settings version the engine has applied")
    started_at: datetime
    heartbeat_at: datetime
    last_market_update: datetime | None = None
    last_ai_analysis: datetime | None = None
    last_trade: datetime | None = None
    next_analysis_at: datetime | None = None
    version: str
    pid: int
    cpu_pct: float
    rss_mb: float


class BotStatus(Model):
    """GET /api/status and WS ``status``."""

    state: BotState = Field(description="online < 10 s heartbeat age, degraded < 60 s, else offline")
    online: bool
    heartbeat_age_sec: float | None
    mode: TradingMode
    engine: EngineStatus | None
    api_version: str
    server_time: datetime


class ComponentHealth(Model):
    key: Literal["bot", "api", "openrouter", "market_data", "database", "websocket"]
    name: str
    state: HealthState
    message: str
    last_ok: datetime | None = None
    latency_ms: float | None = None
    details: dict[str, str | float | int | bool | None] = Field(default_factory=dict)


class ProcessStats(Model):
    pid: int
    cpu_pct: float
    rss_mb: float
    uptime_sec: float
    started_at: datetime


class HostStats(Model):
    cpu_pct: float
    cpu_count: int
    ram_used_mb: float
    ram_total_mb: float
    ram_pct: float
    disk_pct: float
    load_avg: list[float]
    python: str
    platform: str


class DatabaseStats(Model):
    path: str
    size_mb: float
    tables: dict[str, int]
    query_latency_ms: float


class Event(Model):
    id: int = Field(description="Monotonic; clients resume from the last id they saw")
    ts: datetime
    type: EventType
    severity: Severity
    symbol: str | None = None
    title: str
    message: str
    data: dict[str, Any] = Field(default_factory=dict)


class EventPage(Model):
    items: list[Event]
    total: int
    has_more: bool


class SystemHealth(Model):
    components: list[ComponentHealth]
    status: BotStatus
    api: ProcessStats
    host: HostStats
    database: DatabaseStats
    websocket_clients: int
    websocket_messages_sent: int
    engine_uptime_sec: float | None
    recent_issues: list[Event] = Field(description="Latest warning/error events")


class Notification(Model):
    id: int
    ts: datetime
    type: NotificationType
    severity: Severity
    title: str
    message: str
    read: bool = False
    data: dict[str, Any] = Field(default_factory=dict)


class NotificationList(Model):
    items: list[Notification]
    unread_count: int
    total: int


class MarkReadRequest(Model):
    ids: list[int] = Field(default_factory=list, description="Empty list = mark all as read")


# --------------------------------------------------------------------------
# Performance analytics
# --------------------------------------------------------------------------


class EquityPoint(Model):
    time: int
    equity: float
    drawdown_pct: float = Field(description="<= 0")


class DailyPnl(Model):
    date: date
    pnl: float
    return_pct: float
    trades: int


class MonthlyReturn(Model):
    month: str = Field(description='"YYYY-MM"')
    return_pct: float
    pnl: float
    trades: int


class DistributionBin(Model):
    label: str
    min: float
    max: float
    count: int


class PerformanceMetrics(Model):
    total_return_pct: float
    cagr_pct: float | None = None
    sharpe: float | None = None
    sortino: float | None = None
    profit_factor: float | None = None
    expectancy: float | None = Field(default=None, description="Average net P&L per trade, quote currency")
    expectancy_r: float | None = Field(default=None, description="Average R multiple per trade")
    max_drawdown_pct: float = Field(description="<= 0")
    max_drawdown_usd: float = Field(description="<= 0")
    recovery_factor: float | None = None
    avg_trade: float | None = None
    avg_trade_pct: float | None = None
    net_profit: float
    gross_profit: float
    gross_loss: float = Field(description="<= 0")
    total_fees: float


class WinLossStats(Model):
    win_rate: float | None = None
    loss_rate: float | None = None
    avg_win: float | None = None
    avg_loss: float | None = Field(default=None, description="<= 0")
    avg_win_pct: float | None = None
    avg_loss_pct: float | None = None
    largest_win: float | None = None
    largest_loss: float | None = None
    payoff_ratio: float | None = Field(default=None, description="avg_win / |avg_loss|")


class TradingStats(Model):
    total_trades: int
    long_trades: int
    short_trades: int
    winning_trades: int
    losing_trades: int
    breakeven_trades: int
    long_win_rate: float | None = None
    short_win_rate: float | None = None
    avg_holding_sec: float | None = None
    longest_win_streak: int
    longest_loss_streak: int
    current_streak: int = Field(description="+n = n wins in a row, -n = n losses in a row")
    trades_per_day: float | None = None


class SymbolBreakdown(Model):
    symbol: str
    trades: int
    win_rate: float | None = None
    pnl: float


class ExitReasonBreakdown(Model):
    reason: ExitReason
    count: int
    pnl: float


class PerformanceReport(Model):
    range: PerformanceRange
    starting_equity: float
    ending_equity: float
    metrics: PerformanceMetrics
    win_loss: WinLossStats
    stats: TradingStats
    equity_curve: list[EquityPoint]
    daily_pnl: list[DailyPnl]
    monthly: list[MonthlyReturn]
    distribution: list[DistributionBin] = Field(description="Histogram of trade pnl_pct")
    by_symbol: list[SymbolBreakdown]
    by_exit_reason: list[ExitReasonBreakdown]
    updated_at: datetime


# --------------------------------------------------------------------------
# AI performance analytics and model usage
# --------------------------------------------------------------------------


class ConfidenceBucket(Model):
    label: str = Field(description='e.g. "80–90%"')
    min: float
    max: float
    signals: int = Field(description="Directional signals in this bucket")
    trades: int = Field(description="Executed trades from those signals that have closed")
    wins: int
    win_rate: float | None = None
    avg_return_pct: float | None = None
    shadow_accuracy: float | None = Field(default=None, description="CORRECT / (CORRECT + INCORRECT)")


class ConfidencePoint(Model):
    trade_id: str
    confidence: float
    pnl_pct: float
    pnl: float
    result: TradeResult
    side: Side
    closed_at: datetime


class CalibrationPoint(Model):
    predicted: float = Field(description="Bucket mean confidence, percent")
    actual: float | None = Field(default=None, description="Observed win/accuracy rate, percent")
    count: int


class AIPerformancePoint(Model):
    date: date
    signals: int
    trades: int
    win_rate: float | None = None
    cumulative_win_rate: float | None = None
    accuracy: float | None = Field(default=None, description="Shadow-evaluation accuracy that day")
    avg_confidence: float | None = None
    pnl: float


class RejectionReasonCount(Model):
    reason: str
    count: int


class ProviderBreakdown(Model):
    provider: AIProvider
    model: str
    signals: int
    trades: int
    win_rate: float | None = None


class AIUsageHour(Model):
    hour: datetime
    requests: int
    errors: int
    tokens: int
    avg_latency_ms: float | None = None


class AIUsageStats(Model):
    provider: AIProvider
    model: str
    configured: bool
    requests_today: int
    requests_total: int
    errors_today: int
    error_rate_pct: float
    avg_latency_ms: float | None = None
    p95_latency_ms: float | None = None
    prompt_tokens_today: int
    completion_tokens_today: int
    total_tokens_today: int
    cost_today_usd: float
    cost_total_usd: float
    est_monthly_cost_usd: float
    last_request_at: datetime | None = None
    last_error: str | None = None
    last_error_at: datetime | None = None
    hourly: list[AIUsageHour] = Field(default_factory=list, description="Last 24 hours")


class AIAnalytics(Model):
    total_signals: int
    long_signals: int
    short_signals: int
    hold_signals: int
    hold_frequency_pct: float
    executed_trades: int
    ai_win_rate: float | None = None
    ai_avg_return_pct: float | None = None
    avg_confidence: float | None = None
    high_confidence_threshold: float
    high_confidence_win_rate: float | None = None
    low_confidence_win_rate: float | None = None
    long_accuracy: float | None = None
    short_accuracy: float | None = None
    signals_rejected: int
    rejection_rate_pct: float
    rejection_reasons: list[RejectionReasonCount]
    buckets: list[ConfidenceBucket]
    scatter: list[ConfidencePoint]
    calibration: list[CalibrationPoint]
    over_time: list[AIPerformancePoint]
    by_provider: list[ProviderBreakdown]
    usage: AIUsageStats
    updated_at: datetime


class AIModelOption(Model):
    id: str
    name: str
    context_length: int | None = None
    prompt_price_per_mtok: float | None = None
    completion_price_per_mtok: float | None = None
    recommended: bool = False


class AIModelInfo(Model):
    configured: bool
    api_key_hint: str | None = Field(
        default=None, description='Always a fixed mask such as "••••••••••••••••", never key material'
    )
    current_model: str
    active_provider: AIProvider
    options: list[AIModelOption]
    usage: AIUsageStats


# --------------------------------------------------------------------------
# Settings (dashboard-editable; secrets are never part of these models)
# --------------------------------------------------------------------------


class TradingSettings(Model):
    symbols: list[str] = Field(
        default_factory=lambda: ["BTC/USDT", "ETH/USDT", "SOL/USDT"], min_length=1, max_length=10
    )
    primary_symbol: str = "BTC/USDT"
    decision_timeframe: Timeframe = "5m"
    strategy: StrategyName = "ai"
    allow_shorts: bool = True
    max_holding_minutes: int = Field(default=720, ge=5, le=10080)
    paper_trading: bool = Field(default=True, description="Read-only: this build only paper trades")
    live_trading: bool = Field(default=False, description="Read-only: can only be enabled server-side")


class RiskSettings(Model):
    risk_per_trade_pct: float = Field(default=1.0, ge=0.1, le=5.0)
    max_daily_loss_usd: float = Field(default=200.0, ge=1.0)
    max_positions: int = Field(default=3, ge=1, le=20)
    min_risk_reward: float = Field(default=1.5, ge=0.5, le=10.0)
    min_ai_confidence: float = Field(default=65.0, ge=0.0, le=100.0)
    max_consecutive_losses: int = Field(default=4, ge=1, le=50)
    loss_streak_cooldown_minutes: int = Field(default=60, ge=0, le=1440)
    max_drawdown_pct: float = Field(default=15.0, ge=1.0, le=90.0)
    max_exposure_pct: float = Field(default=150.0, ge=10.0, le=500.0)
    max_position_pct: float = Field(
        default=50.0, ge=1.0, le=200.0, description="Per-position notional cap, % of equity"
    )


class ExecutionSettings(Model):
    order_type: OrderType = "market"
    fee_bps: float = Field(
        default=5.0, ge=0.0, le=100.0, description="Taker fee per side (perp-style; spot is ~10)"
    )
    slippage_bps: float = Field(default=2.0, ge=0.0, le=100.0)
    limit_order_timeout_minutes: int = Field(default=15, ge=1, le=1440)


class AISettings(Model):
    model: str = "anthropic/claude-haiku-4.5"
    fallback_models: list[str] = Field(default_factory=list, max_length=5)
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    max_tokens: int = Field(default=900, ge=128, le=8000)
    request_timeout_sec: int = Field(default=30, ge=5, le=180)
    retry_count: int = Field(default=2, ge=0, le=5)
    heuristic_fallback: bool = Field(
        default=True, description="Answer with the local heuristic when OpenRouter fails"
    )


class NotificationSettings(Model):
    """Channel toggles. Tokens / webhooks / SMTP passwords come only from server env."""

    telegram_enabled: bool = False
    telegram_configured: bool = Field(
        default=False, description="Read-only: TELEGRAM_BOT_TOKEN + chat id present"
    )
    discord_enabled: bool = False
    discord_configured: bool = Field(default=False, description="Read-only: DISCORD_WEBHOOK_URL present")
    email_enabled: bool = False
    email_configured: bool = Field(default=False, description="Read-only: SMTP settings present")
    email_to: str | None = None
    events: list[NotificationType] = Field(
        default_factory=lambda: [
            "TRADE_OPENED",
            "TRADE_CLOSED",
            "STOP_LOSS_HIT",
            "TAKE_PROFIT_HIT",
            "DAILY_LOSS_WARNING",
            "DAILY_LOSS_LIMIT",
            "BOT_ERROR",
            "API_FAILURE",
            "AI_UNAVAILABLE",
            "MARKET_DATA_UNAVAILABLE",
        ]
    )


class BotSettings(Model):
    trading: TradingSettings = Field(default_factory=TradingSettings)
    risk: RiskSettings = Field(default_factory=RiskSettings)
    execution: ExecutionSettings = Field(default_factory=ExecutionSettings)
    ai: AISettings = Field(default_factory=AISettings)
    notifications: NotificationSettings = Field(default_factory=NotificationSettings)
    version: int = 0
    updated_at: datetime | None = None


class SettingsResponse(Model):
    settings: BotSettings
    applied_version: int | None = Field(
        description="Version the engine reports as applied; None if engine offline"
    )
    restart_required: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------
# Backtests
# --------------------------------------------------------------------------


class BacktestRequest(Model):
    symbol: str = "BTC/USDT"
    timeframe: Timeframe = "1h"
    start: date
    end: date
    strategy: StrategyName = "hybrid"
    ai_model: str = HEURISTIC_MODEL_ID
    starting_balance: float = Field(default=10_000.0, gt=0)
    risk_pct: float = Field(default=1.0, ge=0.1, le=5.0)
    fee_bps: float = Field(
        default=5.0, ge=0.0, le=100.0, description="Taker fee per side (perp-style; spot is ~10)"
    )
    slippage_bps: float = Field(default=2.0, ge=0.0, le=100.0)
    min_ai_confidence: float = Field(default=65.0, ge=0.0, le=100.0)
    min_risk_reward: float = Field(default=1.5, ge=0.5, le=10.0)
    compare: bool = Field(default=True, description="Also run the other two strategies on the same data")


class BacktestMetrics(Model):
    total_return_pct: float
    net_profit: float
    win_rate: float | None = None
    profit_factor: float | None = None
    max_drawdown_pct: float
    sharpe: float | None = None
    sortino: float | None = None
    cagr_pct: float | None = None
    trades: int
    expectancy: float | None = None
    avg_trade_pct: float | None = None
    exposure_time_pct: float | None = None
    buy_hold_return_pct: float | None = None


class BacktestTrade(Model):
    entry_time: int
    exit_time: int
    side: Side
    entry_price: float
    exit_price: float
    size: float
    pnl: float
    pnl_pct: float
    exit_reason: ExitReason
    confidence: float | None = None


class BacktestRun(Model):
    strategy: StrategyName
    metrics: BacktestMetrics
    equity_curve: list[EquityPoint]
    trades: list[BacktestTrade]
    monthly: list[MonthlyReturn]
    distribution: list[DistributionBin]


class BacktestSummary(Model):
    id: str
    created_at: datetime
    finished_at: datetime | None = None
    status: BacktestStatus
    progress: float
    symbol: str
    timeframe: Timeframe
    start: date
    end: date
    strategy: StrategyName
    total_return_pct: float | None = None
    win_rate: float | None = None
    max_drawdown_pct: float | None = None
    sharpe: float | None = None
    trades: int | None = None
    error: str | None = None


class BacktestResult(BacktestSummary):
    request: BacktestRequest
    data_source: FeedKind | None = None
    duration_ms: int | None = None
    candles: list[Candle] = Field(default_factory=list, description="Price series used (may be downsampled)")
    runs: list[BacktestRun] = Field(
        default_factory=list, description="Requested strategy first, then comparisons"
    )


# --------------------------------------------------------------------------
# WebSocket protocol (server -> client); every frame is {"type": ..., "data": ...}
# --------------------------------------------------------------------------


class WsHelloData(Model):
    server_time: datetime
    api_version: str
    last_event_id: int


class WsCandleData(Model):
    symbol: str
    timeframe: Timeframe
    candle: Candle
    closed: bool
    indicators: dict[str, float | None] = Field(
        default_factory=dict,
        description="ema9, ema21, ema50, ema200, vwap, bb_upper, bb_middle, bb_lower at this candle",
    )


class WsHello(Model):
    type: Literal["hello"] = "hello"
    data: WsHelloData


class WsStatus(Model):
    type: Literal["status"] = "status"
    data: BotStatus


class WsTicker(Model):
    type: Literal["ticker"] = "ticker"
    data: Ticker


class WsCandle(Model):
    type: Literal["candle"] = "candle"
    data: WsCandleData


class WsPortfolio(Model):
    type: Literal["portfolio"] = "portfolio"
    data: Portfolio


class WsPositions(Model):
    type: Literal["positions"] = "positions"
    data: list[Position]


class WsRisk(Model):
    type: Literal["risk"] = "risk"
    data: RiskSnapshot


class WsAIAnalysis(Model):
    type: Literal["ai_analysis"] = "ai_analysis"
    data: AIAnalysis


class WsMTF(Model):
    type: Literal["mtf"] = "mtf"
    data: MTFReport


class WsRegime(Model):
    type: Literal["regime"] = "regime"
    data: RegimeState


class WsEvent(Model):
    type: Literal["event"] = "event"
    data: Event


class WsNotification(Model):
    type: Literal["notification"] = "notification"
    data: Notification


class WsTradeClosed(Model):
    type: Literal["trade_closed"] = "trade_closed"
    data: Trade


class WsSettings(Model):
    type: Literal["settings"] = "settings"
    data: BotSettings


class WsPong(Model):
    type: Literal["pong"] = "pong"
    data: dict[str, Any] = Field(default_factory=dict)


class WsError(Model):
    type: Literal["error"] = "error"
    data: dict[str, Any] = Field(default_factory=dict)


WsServerMessage = Annotated[
    WsHello
    | WsStatus
    | WsTicker
    | WsCandle
    | WsPortfolio
    | WsPositions
    | WsRisk
    | WsAIAnalysis
    | WsMTF
    | WsRegime
    | WsEvent
    | WsNotification
    | WsTradeClosed
    | WsSettings
    | WsPong
    | WsError,
    Field(discriminator="type"),
]


# Client -> server frames
class ChartSubscription(Model):
    symbol: str
    timeframe: Timeframe


class WsClientSubscribeChart(Model):
    """Replace this connection's chart subscriptions (at most 8 pairs; extras are ignored)."""

    type: Literal["subscribe_chart"] = "subscribe_chart"
    charts: list[ChartSubscription] = Field(default_factory=list)


class WsClientResume(Model):
    """Ask for every event with id > last_event_id (sent after a reconnect)."""

    type: Literal["resume"] = "resume"
    last_event_id: int


class WsClientPing(Model):
    type: Literal["ping"] = "ping"


WsClientMessage = Annotated[
    WsClientSubscribeChart | WsClientResume | WsClientPing,
    Field(discriminator="type"),
]
