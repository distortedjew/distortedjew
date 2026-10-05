/* eslint-disable */
/**
 * GENERATED — do not edit; run npm run gen:types
 *
 * Source: backend/tradebot/schemas.py (via backend/scripts/export_schema.py).
 * Units: *_pct, confidence, win_rate, *_accuracy, utilization_pct and progress are percent
 * units (4.82 = 4.82 %); datetimes are UTC ISO 8601 strings; chart `time` fields are unix seconds.
 */

/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "AIProvider".
 */
export type AIProvider = "openrouter" | "heuristic";
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "BacktestStatus".
 */
export type BacktestStatus = "queued" | "running" | "completed" | "failed";
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "BotState".
 */
export type BotState = "online" | "degraded" | "offline";
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "ChartMarkerKind".
 */
export type ChartMarkerKind =
  | "entry_long"
  | "entry_short"
  | "exit_win"
  | "exit_loss"
  | "stop_loss"
  | "take_profit"
  | "signal_long"
  | "signal_short";
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "EmaAlignment".
 */
export type EmaAlignment = "BULLISH" | "BEARISH" | "MIXED";
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "EvalStatus".
 */
export type EvalStatus = "PENDING" | "CORRECT" | "INCORRECT" | "EXPIRED" | "NOT_APPLICABLE";
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "EventType".
 */
export type EventType =
  | "MARKET_UPDATE"
  | "AI_ANALYSIS"
  | "TRADE_SIGNAL"
  | "RISK_CHECK"
  | "TRADE_EXECUTED"
  | "TRADE_REJECTED"
  | "TRADE_CLOSED"
  | "STOP_LOSS"
  | "TAKE_PROFIT"
  | "RISK_WARNING"
  | "API_ERROR"
  | "SYSTEM_WARNING"
  | "SYSTEM_INFO"
  | "SETTINGS_CHANGED";
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "ExitReason".
 */
export type ExitReason = "STOP_LOSS" | "TAKE_PROFIT" | "SIGNAL_REVERSAL" | "TIME_EXIT" | "KILL_SWITCH";
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "FeedKind".
 */
export type FeedKind = "binance" | "simulated";
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "FeedSetting".
 */
export type FeedSetting = "auto" | "binance" | "simulated";
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "HealthState".
 */
export type HealthState = "operational" | "warning" | "error" | "disabled";
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "NotificationType".
 */
export type NotificationType =
  | "TRADE_OPENED"
  | "TRADE_CLOSED"
  | "STOP_LOSS_HIT"
  | "TAKE_PROFIT_HIT"
  | "DAILY_LOSS_WARNING"
  | "DAILY_LOSS_LIMIT"
  | "RISK_LIMIT"
  | "BOT_ERROR"
  | "API_FAILURE"
  | "AI_UNAVAILABLE"
  | "MARKET_DATA_UNAVAILABLE"
  | "SYSTEM";
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "OrderType".
 */
export type OrderType = "market" | "limit";
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "PerformanceRange".
 */
export type PerformanceRange = "24h" | "7d" | "30d" | "90d" | "all";
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "PriceLevelKind".
 */
export type PriceLevelKind = "entry" | "stop_loss" | "take_profit";
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "Regime".
 */
export type Regime =
  | "TRENDING_BULLISH"
  | "TRENDING_BEARISH"
  | "RANGING"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY"
  | "BREAKOUT"
  | "UNKNOWN";
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "RiskMeterStatus".
 */
export type RiskMeterStatus = "ok" | "warning" | "critical" | "breached";
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "RiskStatus".
 */
export type RiskStatus = "APPROVED" | "REJECTED" | "NOT_APPLICABLE";
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "Severity".
 */
export type Severity = "info" | "success" | "warning" | "error";
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "Side".
 */
export type Side = "LONG" | "SHORT";
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "Signal".
 */
export type Signal = "LONG" | "SHORT" | "HOLD";
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "StrategyName".
 */
export type StrategyName = "ai" | "hybrid" | "baseline";
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "Timeframe".
 */
export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "TradeResult".
 */
export type TradeResult = "WIN" | "LOSS" | "BREAKEVEN";
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "TradingMode".
 */
export type TradingMode = "paper" | "live";
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "Trend".
 */
export type Trend = "BULL" | "BEAR" | "NEUTRAL";
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "WsClientMessage".
 */
export type WsClientMessage = WsClientSubscribeChart | WsClientResume | WsClientPing;
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "WsServerMessage".
 */
export type WsServerMessage =
  | WsHello
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
  | WsError;

export interface TradebotContract {
  AIAnalysis?: AIAnalysis;
  AIAnalytics?: AIAnalytics;
  AIDecisionPage?: AIDecisionPage;
  AIModelInfo?: AIModelInfo;
  AIModelOption?: AIModelOption;
  AIPerformancePoint?: AIPerformancePoint;
  AIProvider?: AIProvider;
  AISettings?: AISettings;
  AIUsageHour?: AIUsageHour;
  AIUsageStats?: AIUsageStats;
  BacktestMetrics?: BacktestMetrics;
  BacktestRequest?: BacktestRequest;
  BacktestResult?: BacktestResult;
  BacktestRun?: BacktestRun;
  BacktestStatus?: BacktestStatus;
  BacktestSummary?: BacktestSummary;
  BacktestTrade?: BacktestTrade;
  BotSettings?: BotSettings;
  BotState?: BotState;
  BotStatus?: BotStatus;
  CalibrationPoint?: CalibrationPoint;
  Candle?: Candle;
  ChartMarker?: ChartMarker;
  ChartMarkerKind?: ChartMarkerKind;
  ChartSubscription?: ChartSubscription;
  ComponentHealth?: ComponentHealth;
  ConfidenceBucket?: ConfidenceBucket;
  ConfidencePoint?: ConfidencePoint;
  DailyPnl?: DailyPnl;
  DatabaseStats?: DatabaseStats;
  DistributionBin?: DistributionBin;
  EmaAlignment?: EmaAlignment;
  EngineStatus?: EngineStatus;
  EquityPoint?: EquityPoint;
  EvalStatus?: EvalStatus;
  Event?: Event;
  EventPage?: EventPage;
  EventType?: EventType;
  ExecutionSettings?: ExecutionSettings;
  ExitReason?: ExitReason;
  ExitReasonBreakdown?: ExitReasonBreakdown;
  FeedKind?: FeedKind;
  FeedSetting?: FeedSetting;
  HealthState?: HealthState;
  HostStats?: HostStats;
  IndicatorSeries?: IndicatorSeries;
  IndicatorSnapshot?: IndicatorSnapshot;
  Kpi?: Kpi;
  LinePoint?: LinePoint;
  MTFReport?: MTFReport;
  MarkReadRequest?: MarkReadRequest;
  MarketSnapshot?: MarketSnapshot;
  MonthlyReturn?: MonthlyReturn;
  Notification?: Notification;
  NotificationList?: NotificationList;
  NotificationSettings?: NotificationSettings;
  NotificationType?: NotificationType;
  OrderType?: OrderType;
  PerformanceMetrics?: PerformanceMetrics;
  PerformanceRange?: PerformanceRange;
  PerformanceReport?: PerformanceReport;
  Portfolio?: Portfolio;
  PortfolioKpis?: PortfolioKpis;
  PortfolioState?: PortfolioState;
  Position?: Position;
  PositionDetail?: PositionDetail;
  PriceLevel?: PriceLevel;
  PriceLevelKind?: PriceLevelKind;
  ProcessStats?: ProcessStats;
  ProviderBreakdown?: ProviderBreakdown;
  Regime?: Regime;
  RegimePerformance?: RegimePerformance;
  RegimeReport?: RegimeReport;
  RegimeSegment?: RegimeSegment;
  RegimeState?: RegimeState;
  RejectionReasonCount?: RejectionReasonCount;
  RiskCheck?: RiskCheck;
  RiskDecision?: RiskDecision;
  RiskMeter?: RiskMeter;
  RiskMeterStatus?: RiskMeterStatus;
  RiskSettings?: RiskSettings;
  RiskSnapshot?: RiskSnapshot;
  RiskStatus?: RiskStatus;
  SettingsResponse?: SettingsResponse;
  Severity?: Severity;
  Side?: Side;
  Signal?: Signal;
  SignalEvaluation?: SignalEvaluation;
  StrategyName?: StrategyName;
  SymbolBreakdown?: SymbolBreakdown;
  SystemHealth?: SystemHealth;
  Ticker?: Ticker;
  Timeframe?: Timeframe;
  TimeframeSignal?: TimeframeSignal;
  Trade?: Trade;
  TradeDetail?: TradeDetail;
  TradePage?: TradePage;
  TradeResult?: TradeResult;
  TradeSummary?: TradeSummary1;
  TradingMode?: TradingMode;
  TradingSettings?: TradingSettings;
  TradingStats?: TradingStats;
  Trend?: Trend;
  WinLossStats?: WinLossStats;
  WsAIAnalysis?: WsAIAnalysis;
  WsCandle?: WsCandle;
  WsCandleData?: WsCandleData;
  WsClientMessage?: WsClientMessage;
  WsClientPing?: WsClientPing;
  WsClientResume?: WsClientResume;
  WsClientSubscribeChart?: WsClientSubscribeChart;
  WsError?: WsError;
  WsEvent?: WsEvent;
  WsHello?: WsHello;
  WsHelloData?: WsHelloData;
  WsMTF?: WsMTF;
  WsNotification?: WsNotification;
  WsPong?: WsPong;
  WsPortfolio?: WsPortfolio;
  WsPositions?: WsPositions;
  WsRegime?: WsRegime;
  WsRisk?: WsRisk;
  WsServerMessage?: WsServerMessage;
  WsSettings?: WsSettings;
  WsStatus?: WsStatus;
  WsTicker?: WsTicker;
  WsTradeClosed?: WsTradeClosed;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "AIAnalysis".
 */
export interface AIAnalysis {
  id: string;
  symbol: string;
  timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
  created_at: string;
  signal: "LONG" | "SHORT" | "HOLD";
  confidence: number;
  regime:
    | "TRENDING_BULLISH"
    | "TRENDING_BEARISH"
    | "RANGING"
    | "HIGH_VOLATILITY"
    | "LOW_VOLATILITY"
    | "BREAKOUT"
    | "UNKNOWN";
  regime_confidence: number;
  price: number;
  entry: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  risk_reward: number | null;
  /**
   * One or two sentences, plain language
   */
  summary: string;
  /**
   * Supporting evidence bullets ("EMA 21 above EMA 50")
   */
  reasons: string[];
  /**
   * Counter-evidence / caveats bullets
   */
  risks: string[];
  /**
   * e.g. "Close below $61,240 (EMA 50)"
   */
  invalidation: string | null;
  /**
   * Longer free-text reasoning for the expandable section
   */
  detailed_reasoning: string;
  indicators: IndicatorSnapshot;
  mtf: TimeframeSignal[];
  strategy: "ai" | "hybrid" | "baseline";
  /**
   * What the technical baseline said
   */
  baseline_signal: ("LONG" | "SHORT" | "HOLD") | null;
  provider: "openrouter" | "heuristic";
  model: string;
  latency_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  /**
   * Set when OpenRouter was configured but the heuristic had to answer
   */
  fallback_reason: string | null;
  risk: RiskDecision;
  trade_id: string | null;
  evaluation: SignalEvaluation;
}
/**
 * Indicator values on the latest completed candle of one timeframe.
 *
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "IndicatorSnapshot".
 */
export interface IndicatorSnapshot {
  price: number;
  ema9: number | null;
  ema21: number | null;
  ema50: number | null;
  ema200: number | null;
  vwap: number | null;
  bb_upper: number | null;
  bb_middle: number | null;
  bb_lower: number | null;
  bb_width_pct: number | null;
  rsi: number | null;
  macd: number | null;
  macd_signal: number | null;
  macd_hist: number | null;
  atr: number | null;
  atr_pct: number | null;
  adx: number | null;
  volume: number | null;
  volume_avg20: number | null;
  /**
   * volume / 20-bar average
   */
  volume_ratio: number | null;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "TimeframeSignal".
 */
export interface TimeframeSignal {
  timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
  trend: "BULL" | "BEAR" | "NEUTRAL";
  signal: "LONG" | "SHORT" | "HOLD";
  rsi: number | null;
  /**
   * 0-100 directional strength
   */
  strength: number;
  ema_alignment: "BULLISH" | "BEARISH" | "MIXED";
  macd_hist: number | null;
  price_vs_ema200_pct: number | null;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "RiskDecision".
 */
export interface RiskDecision {
  status: "APPROVED" | "REJECTED" | "NOT_APPLICABLE";
  /**
   * Why it was rejected / not applicable
   */
  reasons: string[];
  checks: RiskCheck[];
  /**
   * Base units, when approved
   */
  position_size: number | null;
  notional: number | null;
  /**
   * Quote currency lost if the stop is hit
   */
  risk_amount: number | null;
  /**
   * risk_amount as % of equity
   */
  risk_pct: number | null;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "RiskCheck".
 */
export interface RiskCheck {
  /**
   * Human label, e.g. "Risk / reward"
   */
  name: string;
  passed: boolean;
  /**
   * Display string, e.g. "1.2"
   */
  value: string | null;
  /**
   * Display string, e.g. "≥ 1.5"
   */
  limit: string | null;
  detail: string | null;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "SignalEvaluation".
 */
export interface SignalEvaluation {
  status: "PENDING" | "CORRECT" | "INCORRECT" | "EXPIRED" | "NOT_APPLICABLE";
  resolved_at: string | null;
  /**
   * Move in the signal's direction at resolution
   */
  return_pct: number | null;
  hit: ("TP" | "SL" | "HORIZON") | null;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "AIAnalytics".
 */
export interface AIAnalytics {
  total_signals: number;
  long_signals: number;
  short_signals: number;
  hold_signals: number;
  hold_frequency_pct: number;
  executed_trades: number;
  ai_win_rate: number | null;
  ai_avg_return_pct: number | null;
  avg_confidence: number | null;
  high_confidence_threshold: number;
  high_confidence_win_rate: number | null;
  low_confidence_win_rate: number | null;
  long_accuracy: number | null;
  short_accuracy: number | null;
  signals_rejected: number;
  rejection_rate_pct: number;
  rejection_reasons: RejectionReasonCount[];
  buckets: ConfidenceBucket[];
  scatter: ConfidencePoint[];
  calibration: CalibrationPoint[];
  over_time: AIPerformancePoint[];
  by_provider: ProviderBreakdown[];
  usage: AIUsageStats;
  updated_at: string;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "RejectionReasonCount".
 */
export interface RejectionReasonCount {
  reason: string;
  count: number;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "ConfidenceBucket".
 */
export interface ConfidenceBucket {
  /**
   * e.g. "80–90%"
   */
  label: string;
  min: number;
  max: number;
  /**
   * Directional signals in this bucket
   */
  signals: number;
  /**
   * Executed trades from those signals that have closed
   */
  trades: number;
  wins: number;
  win_rate: number | null;
  avg_return_pct: number | null;
  /**
   * CORRECT / (CORRECT + INCORRECT)
   */
  shadow_accuracy: number | null;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "ConfidencePoint".
 */
export interface ConfidencePoint {
  trade_id: string;
  confidence: number;
  pnl_pct: number;
  pnl: number;
  result: "WIN" | "LOSS" | "BREAKEVEN";
  side: "LONG" | "SHORT";
  closed_at: string;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "CalibrationPoint".
 */
export interface CalibrationPoint {
  /**
   * Bucket mean confidence, percent
   */
  predicted: number;
  /**
   * Observed win/accuracy rate, percent
   */
  actual: number | null;
  count: number;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "AIPerformancePoint".
 */
export interface AIPerformancePoint {
  date: string;
  signals: number;
  trades: number;
  win_rate: number | null;
  cumulative_win_rate: number | null;
  /**
   * Shadow-evaluation accuracy that day
   */
  accuracy: number | null;
  avg_confidence: number | null;
  pnl: number;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "ProviderBreakdown".
 */
export interface ProviderBreakdown {
  provider: "openrouter" | "heuristic";
  model: string;
  signals: number;
  trades: number;
  win_rate: number | null;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "AIUsageStats".
 */
export interface AIUsageStats {
  provider: "openrouter" | "heuristic";
  model: string;
  configured: boolean;
  requests_today: number;
  requests_total: number;
  errors_today: number;
  error_rate_pct: number;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
  prompt_tokens_today: number;
  completion_tokens_today: number;
  total_tokens_today: number;
  cost_today_usd: number;
  cost_total_usd: number;
  est_monthly_cost_usd: number;
  last_request_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  /**
   * Last 24 hours
   */
  hourly: AIUsageHour[];
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "AIUsageHour".
 */
export interface AIUsageHour {
  hour: string;
  requests: number;
  errors: number;
  tokens: number;
  avg_latency_ms: number | null;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "AIDecisionPage".
 */
export interface AIDecisionPage {
  items: AIAnalysis[];
  total: number;
  limit: number;
  offset: number;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "AIModelInfo".
 */
export interface AIModelInfo {
  configured: boolean;
  /**
   * Always a fixed mask such as "••••••••••••••••", never key material
   */
  api_key_hint: string | null;
  current_model: string;
  active_provider: "openrouter" | "heuristic";
  options: AIModelOption[];
  usage: AIUsageStats;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "AIModelOption".
 */
export interface AIModelOption {
  id: string;
  name: string;
  context_length: number | null;
  prompt_price_per_mtok: number | null;
  completion_price_per_mtok: number | null;
  recommended: boolean;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "AISettings".
 */
export interface AISettings {
  model: string;
  /**
   * @maxItems 5
   */
  fallback_models: string[];
  temperature: number;
  max_tokens: number;
  request_timeout_sec: number;
  retry_count: number;
  /**
   * Answer with the local heuristic when OpenRouter fails
   */
  heuristic_fallback: boolean;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "BacktestMetrics".
 */
export interface BacktestMetrics {
  total_return_pct: number;
  net_profit: number;
  win_rate: number | null;
  profit_factor: number | null;
  max_drawdown_pct: number;
  sharpe: number | null;
  sortino: number | null;
  cagr_pct: number | null;
  trades: number;
  expectancy: number | null;
  avg_trade_pct: number | null;
  exposure_time_pct: number | null;
  buy_hold_return_pct: number | null;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "BacktestRequest".
 */
export interface BacktestRequest {
  symbol: string;
  timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
  start: string;
  end: string;
  strategy: "ai" | "hybrid" | "baseline";
  ai_model: string;
  starting_balance: number;
  risk_pct: number;
  /**
   * Taker fee per side (perp-style; spot is ~10)
   */
  fee_bps: number;
  slippage_bps: number;
  min_ai_confidence: number;
  min_risk_reward: number;
  /**
   * Also run the other two strategies on the same data
   */
  compare: boolean;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "BacktestResult".
 */
export interface BacktestResult {
  id: string;
  created_at: string;
  finished_at: string | null;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  symbol: string;
  timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
  start: string;
  end: string;
  strategy: "ai" | "hybrid" | "baseline";
  total_return_pct: number | null;
  win_rate: number | null;
  max_drawdown_pct: number | null;
  sharpe: number | null;
  trades: number | null;
  error: string | null;
  request: BacktestRequest;
  data_source: ("binance" | "simulated") | null;
  duration_ms: number | null;
  /**
   * Price series used (may be downsampled)
   */
  candles: Candle[];
  /**
   * Requested strategy first, then comparisons
   */
  runs: BacktestRun[];
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "Candle".
 */
export interface Candle {
  /**
   * Candle open time, unix seconds UTC
   */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /**
   * Base-asset volume
   */
  volume: number;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "BacktestRun".
 */
export interface BacktestRun {
  strategy: "ai" | "hybrid" | "baseline";
  metrics: BacktestMetrics;
  equity_curve: EquityPoint[];
  trades: BacktestTrade[];
  monthly: MonthlyReturn[];
  distribution: DistributionBin[];
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "EquityPoint".
 */
export interface EquityPoint {
  time: number;
  equity: number;
  /**
   * <= 0
   */
  drawdown_pct: number;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "BacktestTrade".
 */
export interface BacktestTrade {
  entry_time: number;
  exit_time: number;
  side: "LONG" | "SHORT";
  entry_price: number;
  exit_price: number;
  size: number;
  pnl: number;
  pnl_pct: number;
  exit_reason: "STOP_LOSS" | "TAKE_PROFIT" | "SIGNAL_REVERSAL" | "TIME_EXIT" | "KILL_SWITCH";
  confidence: number | null;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "MonthlyReturn".
 */
export interface MonthlyReturn {
  /**
   * "YYYY-MM"
   */
  month: string;
  return_pct: number;
  pnl: number;
  trades: number;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "DistributionBin".
 */
export interface DistributionBin {
  label: string;
  min: number;
  max: number;
  count: number;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "BacktestSummary".
 */
export interface BacktestSummary {
  id: string;
  created_at: string;
  finished_at: string | null;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  symbol: string;
  timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
  start: string;
  end: string;
  strategy: "ai" | "hybrid" | "baseline";
  total_return_pct: number | null;
  win_rate: number | null;
  max_drawdown_pct: number | null;
  sharpe: number | null;
  trades: number | null;
  error: string | null;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "BotSettings".
 */
export interface BotSettings {
  trading: TradingSettings;
  risk: RiskSettings;
  execution: ExecutionSettings;
  ai: AISettings;
  notifications: NotificationSettings;
  version: number;
  updated_at: string | null;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "TradingSettings".
 */
export interface TradingSettings {
  /**
   * @minItems 1
   * @maxItems 10
   */
  symbols: string[];
  primary_symbol: string;
  decision_timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
  strategy: "ai" | "hybrid" | "baseline";
  allow_shorts: boolean;
  max_holding_minutes: number;
  /**
   * Read-only: this build only paper trades
   */
  paper_trading: boolean;
  /**
   * Read-only: can only be enabled server-side
   */
  live_trading: boolean;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "RiskSettings".
 */
export interface RiskSettings {
  risk_per_trade_pct: number;
  max_daily_loss_usd: number;
  max_positions: number;
  min_risk_reward: number;
  min_ai_confidence: number;
  max_consecutive_losses: number;
  loss_streak_cooldown_minutes: number;
  max_drawdown_pct: number;
  max_exposure_pct: number;
  /**
   * Per-position notional cap, % of equity
   */
  max_position_pct: number;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "ExecutionSettings".
 */
export interface ExecutionSettings {
  order_type: "market" | "limit";
  /**
   * Taker fee per side (perp-style; spot is ~10)
   */
  fee_bps: number;
  slippage_bps: number;
  limit_order_timeout_minutes: number;
}
/**
 * Channel toggles. Tokens / webhooks / SMTP passwords come only from server env.
 *
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "NotificationSettings".
 */
export interface NotificationSettings {
  telegram_enabled: boolean;
  /**
   * Read-only: TELEGRAM_BOT_TOKEN + chat id present
   */
  telegram_configured: boolean;
  discord_enabled: boolean;
  /**
   * Read-only: DISCORD_WEBHOOK_URL present
   */
  discord_configured: boolean;
  email_enabled: boolean;
  /**
   * Read-only: SMTP settings present
   */
  email_configured: boolean;
  email_to: string | null;
  events: (
    | "TRADE_OPENED"
    | "TRADE_CLOSED"
    | "STOP_LOSS_HIT"
    | "TAKE_PROFIT_HIT"
    | "DAILY_LOSS_WARNING"
    | "DAILY_LOSS_LIMIT"
    | "RISK_LIMIT"
    | "BOT_ERROR"
    | "API_FAILURE"
    | "AI_UNAVAILABLE"
    | "MARKET_DATA_UNAVAILABLE"
    | "SYSTEM"
  )[];
}
/**
 * GET /api/status and WS ``status``.
 *
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "BotStatus".
 */
export interface BotStatus {
  /**
   * online < 10 s heartbeat age, degraded < 60 s, else offline
   */
  state: "online" | "degraded" | "offline";
  online: boolean;
  heartbeat_age_sec: number | null;
  mode: "paper" | "live";
  engine: EngineStatus | null;
  api_version: string;
  server_time: string;
}
/**
 * live_state key ``status``; refreshed every heartbeat (~2 s).
 *
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "EngineStatus".
 */
export interface EngineStatus {
  mode: "paper" | "live";
  running: boolean;
  trading_allowed: boolean;
  halt_reason: string | null;
  strategy: "ai" | "hybrid" | "baseline";
  symbols: string[];
  primary_symbol: string;
  decision_timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
  feed: "binance" | "simulated";
  feed_connected: boolean;
  feed_message: string | null;
  /**
   * Provider that answered the most recent analysis
   */
  ai_provider: "openrouter" | "heuristic";
  ai_model: string;
  openrouter_configured: boolean;
  /**
   * Settings version the engine has applied
   */
  settings_version: number;
  started_at: string;
  heartbeat_at: string;
  last_market_update: string | null;
  last_ai_analysis: string | null;
  last_trade: string | null;
  next_analysis_at: string | null;
  version: string;
  pid: number;
  cpu_pct: number;
  rss_mb: number;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "ChartMarker".
 */
export interface ChartMarker {
  /**
   * Unix seconds, snapped to the candle open time of the chart timeframe
   */
  time: number;
  kind:
    | "entry_long"
    | "entry_short"
    | "exit_win"
    | "exit_loss"
    | "stop_loss"
    | "take_profit"
    | "signal_long"
    | "signal_short";
  price: number;
  label: string;
  trade_id: string | null;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "ChartSubscription".
 */
export interface ChartSubscription {
  symbol: string;
  timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "ComponentHealth".
 */
export interface ComponentHealth {
  key: "bot" | "api" | "openrouter" | "market_data" | "database" | "websocket";
  name: string;
  state: "operational" | "warning" | "error" | "disabled";
  message: string;
  last_ok: string | null;
  latency_ms: number | null;
  details: {
    [k: string]: string | number | boolean | null;
  };
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "DailyPnl".
 */
export interface DailyPnl {
  date: string;
  pnl: number;
  return_pct: number;
  trades: number;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "DatabaseStats".
 */
export interface DatabaseStats {
  path: string;
  size_mb: number;
  tables: {
    [k: string]: number;
  };
  query_latency_ms: number;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "Event".
 */
export interface Event {
  /**
   * Monotonic; clients resume from the last id they saw
   */
  id: number;
  ts: string;
  type:
    | "MARKET_UPDATE"
    | "AI_ANALYSIS"
    | "TRADE_SIGNAL"
    | "RISK_CHECK"
    | "TRADE_EXECUTED"
    | "TRADE_REJECTED"
    | "TRADE_CLOSED"
    | "STOP_LOSS"
    | "TAKE_PROFIT"
    | "RISK_WARNING"
    | "API_ERROR"
    | "SYSTEM_WARNING"
    | "SYSTEM_INFO"
    | "SETTINGS_CHANGED";
  severity: "info" | "success" | "warning" | "error";
  symbol: string | null;
  title: string;
  message: string;
  data: {
    [k: string]: unknown;
  };
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "EventPage".
 */
export interface EventPage {
  items: Event[];
  total: number;
  has_more: boolean;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "ExitReasonBreakdown".
 */
export interface ExitReasonBreakdown {
  reason: "STOP_LOSS" | "TAKE_PROFIT" | "SIGNAL_REVERSAL" | "TIME_EXIT" | "KILL_SWITCH";
  count: number;
  pnl: number;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "HostStats".
 */
export interface HostStats {
  cpu_pct: number;
  cpu_count: number;
  ram_used_mb: number;
  ram_total_mb: number;
  ram_pct: number;
  disk_pct: number;
  load_avg: number[];
  python: string;
  platform: string;
}
/**
 * Overlay series aligned to the candles of a MarketSnapshot.
 *
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "IndicatorSeries".
 */
export interface IndicatorSeries {
  ema9: LinePoint[];
  ema21: LinePoint[];
  ema50: LinePoint[];
  ema200: LinePoint[];
  vwap: LinePoint[];
  bb_upper: LinePoint[];
  bb_middle: LinePoint[];
  bb_lower: LinePoint[];
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "LinePoint".
 */
export interface LinePoint {
  time: number;
  value: number;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "Kpi".
 */
export interface Kpi {
  value: number | null;
  previous: number | null;
  change: number | null;
  change_pct: number | null;
  /**
   * e.g. "vs yesterday", "vs prior 7d"
   */
  comparison_label: string;
  sparkline: number[];
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "MTFReport".
 */
export interface MTFReport {
  symbol: string;
  timeframes: TimeframeSignal[];
  /**
   * Timeframes agreeing with the dominant trend
   */
  aligned_count: number;
  total: number;
  dominant: "BULL" | "BEAR" | "NEUTRAL";
  /**
   * e.g. "4/4 TIMEFRAMES ALIGNED"
   */
  alignment_label: string;
  updated_at: string;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "MarkReadRequest".
 */
export interface MarkReadRequest {
  /**
   * Empty list = mark all as read
   */
  ids: number[];
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "MarketSnapshot".
 */
export interface MarketSnapshot {
  symbol: string;
  timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
  feed: "binance" | "simulated";
  ticker: Ticker | null;
  candles: Candle[];
  indicators: IndicatorSeries;
  markers: ChartMarker[];
  /**
   * Entry / SL / TP of open positions on this symbol
   */
  levels: PriceLevel[];
  updated_at: string;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "Ticker".
 */
export interface Ticker {
  symbol: string;
  price: number;
  change_24h: number;
  change_24h_pct: number;
  high_24h: number;
  low_24h: number;
  /**
   * Base-asset volume over 24h
   */
  volume_24h: number;
  quote_volume_24h: number;
  ts: string;
  /**
   * Last 24h of hourly closes
   */
  sparkline: number[];
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "PriceLevel".
 */
export interface PriceLevel {
  kind: "entry" | "stop_loss" | "take_profit";
  price: number;
  label: string;
  position_id: string;
  side: "LONG" | "SHORT";
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "Notification".
 */
export interface Notification {
  id: number;
  ts: string;
  type:
    | "TRADE_OPENED"
    | "TRADE_CLOSED"
    | "STOP_LOSS_HIT"
    | "TAKE_PROFIT_HIT"
    | "DAILY_LOSS_WARNING"
    | "DAILY_LOSS_LIMIT"
    | "RISK_LIMIT"
    | "BOT_ERROR"
    | "API_FAILURE"
    | "AI_UNAVAILABLE"
    | "MARKET_DATA_UNAVAILABLE"
    | "SYSTEM";
  severity: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  read: boolean;
  data: {
    [k: string]: unknown;
  };
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "NotificationList".
 */
export interface NotificationList {
  items: Notification[];
  unread_count: number;
  total: number;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "PerformanceMetrics".
 */
export interface PerformanceMetrics {
  total_return_pct: number;
  cagr_pct: number | null;
  sharpe: number | null;
  sortino: number | null;
  profit_factor: number | null;
  /**
   * Average net P&L per trade, quote currency
   */
  expectancy: number | null;
  /**
   * Average R multiple per trade
   */
  expectancy_r: number | null;
  /**
   * <= 0
   */
  max_drawdown_pct: number;
  /**
   * <= 0
   */
  max_drawdown_usd: number;
  recovery_factor: number | null;
  avg_trade: number | null;
  avg_trade_pct: number | null;
  net_profit: number;
  gross_profit: number;
  /**
   * <= 0
   */
  gross_loss: number;
  total_fees: number;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "PerformanceReport".
 */
export interface PerformanceReport {
  range: "24h" | "7d" | "30d" | "90d" | "all";
  starting_equity: number;
  ending_equity: number;
  metrics: PerformanceMetrics;
  win_loss: WinLossStats;
  stats: TradingStats;
  equity_curve: EquityPoint[];
  daily_pnl: DailyPnl[];
  monthly: MonthlyReturn[];
  /**
   * Histogram of trade pnl_pct
   */
  distribution: DistributionBin[];
  by_symbol: SymbolBreakdown[];
  by_exit_reason: ExitReasonBreakdown[];
  updated_at: string;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "WinLossStats".
 */
export interface WinLossStats {
  win_rate: number | null;
  loss_rate: number | null;
  avg_win: number | null;
  /**
   * <= 0
   */
  avg_loss: number | null;
  avg_win_pct: number | null;
  avg_loss_pct: number | null;
  largest_win: number | null;
  largest_loss: number | null;
  /**
   * avg_win / |avg_loss|
   */
  payoff_ratio: number | null;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "TradingStats".
 */
export interface TradingStats {
  total_trades: number;
  long_trades: number;
  short_trades: number;
  winning_trades: number;
  losing_trades: number;
  breakeven_trades: number;
  long_win_rate: number | null;
  short_win_rate: number | null;
  avg_holding_sec: number | null;
  longest_win_streak: number;
  longest_loss_streak: number;
  /**
   * +n = n wins in a row, -n = n losses in a row
   */
  current_streak: number;
  trades_per_day: number | null;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "SymbolBreakdown".
 */
export interface SymbolBreakdown {
  symbol: string;
  trades: number;
  win_rate: number | null;
  pnl: number;
}
/**
 * GET /api/portfolio and WS ``portfolio``: live state plus history-based KPIs.
 *
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "Portfolio".
 */
export interface Portfolio {
  mode: "paper" | "live";
  starting_balance: number;
  equity: number;
  cash: number;
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
  total_pnl_pct: number;
  /**
   * Realized today (UTC) + change in unrealized since UTC midnight
   */
  today_pnl: number;
  today_pnl_pct: number;
  /**
   * Sum of |notional| of open positions at current prices
   */
  exposure: number;
  exposure_pct: number;
  open_positions: number;
  trades_today: number;
  peak_equity: number;
  /**
   * Current drawdown from peak, <= 0
   */
  drawdown_pct: number;
  updated_at: string;
  kpis: PortfolioKpis;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "PortfolioKpis".
 */
export interface PortfolioKpis {
  equity: Kpi;
  today_pnl: Kpi;
  total_pnl: Kpi;
  win_rate: Kpi;
  profit_factor: Kpi;
  max_drawdown: Kpi;
  open_positions: Kpi;
  trades_today: Kpi;
}
/**
 * Live core numbers the engine publishes (live_state key ``portfolio``).
 *
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "PortfolioState".
 */
export interface PortfolioState {
  mode: "paper" | "live";
  starting_balance: number;
  equity: number;
  cash: number;
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
  total_pnl_pct: number;
  /**
   * Realized today (UTC) + change in unrealized since UTC midnight
   */
  today_pnl: number;
  today_pnl_pct: number;
  /**
   * Sum of |notional| of open positions at current prices
   */
  exposure: number;
  exposure_pct: number;
  open_positions: number;
  trades_today: number;
  peak_equity: number;
  /**
   * Current drawdown from peak, <= 0
   */
  drawdown_pct: number;
  updated_at: string;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "Position".
 */
export interface Position {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT";
  /**
   * Base units
   */
  size: number;
  /**
   * Entry notional in quote currency
   */
  notional: number;
  entry_price: number;
  current_price: number;
  stop_loss: number;
  take_profit: number;
  /**
   * Net of the entry fee already paid
   */
  unrealized_pnl: number;
  /**
   * unrealized_pnl / notional * 100
   */
  unrealized_pnl_pct: number;
  /**
   * unrealized_pnl / risk_amount
   */
  r_multiple: number;
  fees_paid: number;
  risk_amount: number;
  /**
   * risk_amount as % of equity at entry
   */
  risk_pct: number;
  opened_at: string;
  duration_sec: number;
  ai_confidence: number | null;
  analysis_id: string | null;
  strategy: "ai" | "hybrid" | "baseline";
  regime:
    | "TRENDING_BULLISH"
    | "TRENDING_BEARISH"
    | "RANGING"
    | "HIGH_VOLATILITY"
    | "LOW_VOLATILITY"
    | "BREAKOUT"
    | "UNKNOWN";
  order_type: "market" | "limit";
  entry_reason: string;
  /**
   * Max favourable excursion, % of entry price
   */
  mfe_pct: number;
  /**
   * Max adverse excursion, % of entry price (<= 0)
   */
  mae_pct: number;
  distance_to_sl_pct: number;
  distance_to_tp_pct: number;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "PositionDetail".
 */
export interface PositionDetail {
  position: Position;
  analysis: AIAnalysis | null;
  timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
  candles: Candle[];
  markers: ChartMarker[];
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "ProcessStats".
 */
export interface ProcessStats {
  pid: number;
  cpu_pct: number;
  rss_mb: number;
  uptime_sec: number;
  started_at: string;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "RegimePerformance".
 */
export interface RegimePerformance {
  regime:
    | "TRENDING_BULLISH"
    | "TRENDING_BEARISH"
    | "RANGING"
    | "HIGH_VOLATILITY"
    | "LOW_VOLATILITY"
    | "BREAKOUT"
    | "UNKNOWN";
  trades: number;
  wins: number;
  win_rate: number | null;
  avg_trade_pct: number | null;
  total_pnl: number;
  profit_factor: number | null;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "RegimeReport".
 */
export interface RegimeReport {
  symbol: string;
  current: RegimeState | null;
  performance: RegimePerformance[];
  history: RegimeSegment[];
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "RegimeState".
 */
export interface RegimeState {
  symbol: string;
  regime:
    | "TRENDING_BULLISH"
    | "TRENDING_BEARISH"
    | "RANGING"
    | "HIGH_VOLATILITY"
    | "LOW_VOLATILITY"
    | "BREAKOUT"
    | "UNKNOWN";
  confidence: number;
  since: string | null;
  /**
   * adx, atr_pct, bb_width_pct, ema_slope_pct, ...
   */
  metrics: {
    [k: string]: number;
  };
  updated_at: string;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "RegimeSegment".
 */
export interface RegimeSegment {
  regime:
    | "TRENDING_BULLISH"
    | "TRENDING_BEARISH"
    | "RANGING"
    | "HIGH_VOLATILITY"
    | "LOW_VOLATILITY"
    | "BREAKOUT"
    | "UNKNOWN";
  start: string;
  end: string | null;
  confidence: number;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "RiskMeter".
 */
export interface RiskMeter {
  key: "daily_loss" | "drawdown" | "exposure" | "positions" | "consecutive_losses" | "daily_risk";
  label: string;
  current: number;
  limit: number;
  unit: "usd" | "pct" | "count";
  utilization_pct: number;
  status: "ok" | "warning" | "critical" | "breached";
  /**
   * e.g. "APPROACHING DAILY LIMIT"
   */
  message: string | null;
}
/**
 * live_state key ``risk``; GET /api/risk; WS ``risk``.
 *
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "RiskSnapshot".
 */
export interface RiskSnapshot {
  trading_allowed: boolean;
  halt_reason: string | null;
  halted_until: string | null;
  equity: number;
  current_exposure: number;
  current_exposure_pct: number;
  max_exposure_pct: number;
  risk_per_trade_pct: number;
  /**
   * Sum of risk_amount over open positions
   */
  open_risk: number;
  open_risk_pct: number;
  daily_pnl: number;
  /**
   * max(0, -daily_pnl)
   */
  daily_loss: number;
  max_daily_loss: number;
  drawdown_pct: number;
  /**
   * Worst drawdown observed so far (<= 0)
   */
  max_drawdown_pct: number;
  /**
   * Halt threshold, positive number
   */
  max_drawdown_limit_pct: number;
  open_positions: number;
  max_positions: number;
  consecutive_losses: number;
  max_consecutive_losses: number;
  min_risk_reward: number;
  min_confidence: number;
  rejections_today: number;
  meters: RiskMeter[];
  warnings: string[];
  updated_at: string;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "SettingsResponse".
 */
export interface SettingsResponse {
  settings: BotSettings;
  /**
   * Version the engine reports as applied; None if engine offline
   */
  applied_version: number | null;
  restart_required: string[];
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "SystemHealth".
 */
export interface SystemHealth {
  components: ComponentHealth[];
  status: BotStatus;
  api: ProcessStats;
  host: HostStats;
  database: DatabaseStats;
  websocket_clients: number;
  websocket_messages_sent: number;
  engine_uptime_sec: number | null;
  /**
   * Latest warning/error events
   */
  recent_issues: Event[];
}
/**
 * A closed round trip.
 *
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "Trade".
 */
export interface Trade {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT";
  size: number;
  notional: number;
  entry_price: number;
  exit_price: number;
  stop_loss: number;
  take_profit: number;
  opened_at: string;
  closed_at: string;
  duration_sec: number;
  /**
   * Net of all fees
   */
  pnl: number;
  /**
   * pnl / notional * 100
   */
  pnl_pct: number;
  gross_pnl: number;
  fees: number;
  result: "WIN" | "LOSS" | "BREAKEVEN";
  exit_reason: "STOP_LOSS" | "TAKE_PROFIT" | "SIGNAL_REVERSAL" | "TIME_EXIT" | "KILL_SWITCH";
  r_multiple: number;
  ai_confidence: number | null;
  analysis_id: string | null;
  strategy: "ai" | "hybrid" | "baseline";
  regime:
    | "TRENDING_BULLISH"
    | "TRENDING_BEARISH"
    | "RANGING"
    | "HIGH_VOLATILITY"
    | "LOW_VOLATILITY"
    | "BREAKOUT"
    | "UNKNOWN";
  entry_reason: string;
  mfe_pct: number;
  mae_pct: number;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "TradeDetail".
 */
export interface TradeDetail {
  trade: Trade;
  analysis: AIAnalysis | null;
  timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
  candles: Candle[];
  markers: ChartMarker[];
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "TradePage".
 */
export interface TradePage {
  items: Trade[];
  total: number;
  limit: number;
  offset: number;
  summary: TradeSummary;
}
/**
 * Aggregates over the whole filtered set, not just this page
 */
export interface TradeSummary {
  count: number;
  wins: number;
  losses: number;
  win_rate: number | null;
  net_pnl: number;
  fees: number;
  avg_pnl_pct: number | null;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "TradeSummary".
 */
export interface TradeSummary1 {
  count: number;
  wins: number;
  losses: number;
  win_rate: number | null;
  net_pnl: number;
  fees: number;
  avg_pnl_pct: number | null;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "WsAIAnalysis".
 */
export interface WsAIAnalysis {
  type: "ai_analysis";
  data: AIAnalysis;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "WsCandle".
 */
export interface WsCandle {
  type: "candle";
  data: WsCandleData;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "WsCandleData".
 */
export interface WsCandleData {
  symbol: string;
  timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
  candle: Candle;
  closed: boolean;
  /**
   * ema9, ema21, ema50, ema200, vwap, bb_upper, bb_middle, bb_lower at this candle
   */
  indicators: {
    [k: string]: number | null;
  };
}
/**
 * Replace this connection's chart subscriptions (at most 8 pairs; extras are ignored).
 *
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "WsClientSubscribeChart".
 */
export interface WsClientSubscribeChart {
  type: "subscribe_chart";
  charts: ChartSubscription[];
}
/**
 * Ask for every event with id > last_event_id (sent after a reconnect).
 *
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "WsClientResume".
 */
export interface WsClientResume {
  type: "resume";
  last_event_id: number;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "WsClientPing".
 */
export interface WsClientPing {
  type: "ping";
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "WsError".
 */
export interface WsError {
  type: "error";
  data: {
    [k: string]: unknown;
  };
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "WsEvent".
 */
export interface WsEvent {
  type: "event";
  data: Event;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "WsHello".
 */
export interface WsHello {
  type: "hello";
  data: WsHelloData;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "WsHelloData".
 */
export interface WsHelloData {
  server_time: string;
  api_version: string;
  last_event_id: number;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "WsMTF".
 */
export interface WsMTF {
  type: "mtf";
  data: MTFReport;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "WsNotification".
 */
export interface WsNotification {
  type: "notification";
  data: Notification;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "WsPong".
 */
export interface WsPong {
  type: "pong";
  data: {
    [k: string]: unknown;
  };
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "WsPortfolio".
 */
export interface WsPortfolio {
  type: "portfolio";
  data: Portfolio;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "WsPositions".
 */
export interface WsPositions {
  type: "positions";
  data: Position[];
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "WsRegime".
 */
export interface WsRegime {
  type: "regime";
  data: RegimeState;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "WsRisk".
 */
export interface WsRisk {
  type: "risk";
  data: RiskSnapshot;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "WsStatus".
 */
export interface WsStatus {
  type: "status";
  data: BotStatus;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "WsTicker".
 */
export interface WsTicker {
  type: "ticker";
  data: Ticker;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "WsTradeClosed".
 */
export interface WsTradeClosed {
  type: "trade_closed";
  data: Trade;
}
/**
 * This interface was referenced by `TradebotContract`'s JSON-Schema
 * via the `definition` "WsSettings".
 */
export interface WsSettings {
  type: "settings";
  data: BotSettings;
}
