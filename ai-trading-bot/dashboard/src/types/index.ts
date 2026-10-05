/**
 * Contract types. `api.ts` is GENERATED from backend/tradebot/schemas.py (npm run gen:types) —
 * import everything from "@/types", never edit api.ts by hand.
 */
import type {
  AIProvider,
  EventType,
  ExitReason,
  PortfolioKpis,
  RiskMeter,
  RiskStatus,
  Severity,
  Side,
  Signal,
  StrategyName,
  Timeframe,
  TradeResult,
  WsClientMessage,
  WsServerMessage,
} from "./api";

export type * from "./api";

// ---------------------------------------------------------------- WebSocket

/** Every server → client frame type ("hello", "status", "ticker", …). */
export type WsFrameType = WsServerMessage["type"];

/** The full frame for one type: `WsFrame<"ticker">` → `{ type: "ticker"; data: Ticker }`. */
export type WsFrame<T extends WsFrameType = WsFrameType> = Extract<WsServerMessage, { type: T }>;

/** Just the payload: `WsFrameData<"portfolio">` → `Portfolio`. */
export type WsFrameData<T extends WsFrameType> = WsFrame<T>["data"];

/** Client → server frames ("subscribe_chart", "resume", "ping"). */
export type WsClientFrame = WsClientMessage;

/** Dashboard ↔ API WebSocket state, shown as LIVE ● / RECONNECTING… / OFFLINE. */
export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "offline";

// ---------------------------------------------------------------- misc helpers

export type KpiKey = keyof PortfolioKpis;
export type RiskMeterKey = RiskMeter["key"];

/**
 * Semantic tone shared by every primitive (Badge, StatusDot, ProgressBar, icons…).
 * up/down = profit/loss or bullish/bearish; warning/info = state; accent = selection;
 * ai = AI-generated content; neutral/muted = no meaning.
 */
export type Tone = "neutral" | "muted" | "up" | "down" | "warning" | "info" | "accent" | "ai";

// ---------------------------------------------------------------- REST query params

/** GET /api/trades (and /api/trades/export.csv). Dates are ISO strings (YYYY-MM-DD or full ISO). */
export interface TradeFilters {
  symbol?: string;
  side?: Side;
  result?: TradeResult;
  strategy?: StrategyName;
  exit_reason?: ExitReason;
  min_confidence?: number;
  max_confidence?: number;
  start?: string;
  end?: string;
  /** Free-text search (symbol, id, entry reason). */
  q?: string;
  /** Field to sort by, e.g. "closed_at", "pnl", "pnl_pct", "duration_sec", "ai_confidence". */
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

/** GET /api/ai/history */
export interface AiHistoryFilters {
  symbol?: string;
  signal?: Signal;
  risk_status?: RiskStatus;
  provider?: AIProvider;
  min_confidence?: number;
  limit?: number;
  offset?: number;
}

/** GET /api/events */
export interface EventFilters {
  limit?: number;
  /** Page backwards: only events with id < before_id. */
  before_id?: number;
  types?: EventType[];
  severity?: Severity;
  symbol?: string;
}

/** GET /api/notifications */
export interface NotificationParams {
  limit?: number;
  unread_only?: boolean;
}

/** GET /api/market */
export interface MarketParams {
  symbol: string;
  timeframe: Timeframe;
  limit?: number;
}
