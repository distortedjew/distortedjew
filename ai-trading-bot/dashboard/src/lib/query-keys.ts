/**
 * Every TanStack Query key in one place. The WebSocket sync (live-sync.ts) writes to these
 * exact keys, so always go through the hooks in src/hooks/queries.ts (or these factories).
 */
import type {
  AiHistoryFilters,
  EventFilters,
  NotificationParams,
  PerformanceRange,
  Timeframe,
  TradeFilters,
} from "@/types";

export const queryKeys = {
  status: () => ["status"] as const,
  portfolio: () => ["portfolio"] as const,
  positions: () => ["positions"] as const,
  position: (id: string, timeframe?: Timeframe) => ["positions", "detail", id, timeframe ?? null] as const,
  tradesRoot: () => ["trades"] as const,
  trades: (filters: TradeFilters = {}) => ["trades", "list", filters] as const,
  trade: (id: string, timeframe?: Timeframe) => ["trades", "detail", id, timeframe ?? null] as const,
  performanceRoot: () => ["performance"] as const,
  performance: (range: PerformanceRange) => ["performance", range] as const,
  risk: () => ["risk"] as const,
  aiRoot: () => ["ai"] as const,
  aiLatest: (symbol: string) => ["ai", "latest", symbol] as const,
  aiHistoryRoot: () => ["ai", "history"] as const,
  aiHistory: (filters: AiHistoryFilters = {}) => ["ai", "history", filters] as const,
  aiAnalyticsRoot: () => ["ai", "analytics"] as const,
  aiAnalytics: (range: PerformanceRange) => ["ai", "analytics", range] as const,
  aiModels: () => ["ai", "models"] as const,
  market: (symbol: string, timeframe: Timeframe, limit?: number) =>
    ["market", "snapshot", symbol, timeframe, limit ?? null] as const,
  watchlist: () => ["market", "watchlist"] as const,
  mtf: (symbol: string) => ["market", "mtf", symbol] as const,
  regime: (symbol: string) => ["market", "regime", symbol] as const,
  backtestsRoot: () => ["backtests"] as const,
  backtests: () => ["backtests", "list"] as const,
  backtest: (id: string) => ["backtests", "detail", id] as const,
  system: () => ["system"] as const,
  events: (filters: EventFilters = {}) => ["events", filters] as const,
  notificationsRoot: () => ["notifications"] as const,
  notifications: (params: NotificationParams = {}) => ["notifications", params] as const,
  settings: () => ["settings"] as const,
};
