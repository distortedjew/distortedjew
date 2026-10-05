/**
 * One typed hook per REST endpoint. WebSocket frames keep most of these fresh through
 * setQueryData (src/lib/live-sync.ts); while the socket is not live they fall back to polling.
 *
 *   const { data: portfolio, isPending, error, refetch } = usePortfolio();
 *
 * Optional `options` let a caller disable a query (`enabled: false`) or tune polling.
 */
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { api, downloadFile, type QueryParams } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useFallbackInterval } from "@/hooks/use-fallback-interval";
import type {
  AIAnalysis,
  AIAnalytics,
  AIDecisionPage,
  AIModelInfo,
  AiHistoryFilters,
  BacktestRequest,
  BacktestResult,
  BacktestSummary,
  BotSettings,
  BotStatus,
  EventFilters,
  EventPage,
  MarketSnapshot,
  MTFReport,
  Notification,
  NotificationList,
  NotificationParams,
  PerformanceRange,
  PerformanceReport,
  Portfolio,
  Position,
  PositionDetail,
  RegimeReport,
  RiskSnapshot,
  SettingsResponse,
  SystemHealth,
  Ticker,
  Timeframe,
  TradeDetail,
  TradeFilters,
  TradePage,
} from "@/types";

/** The subset of query options callers may override. */
export interface QueryOpts {
  enabled?: boolean;
  /** Override polling (ms) — by default WS-fed queries poll only while the socket is down. */
  refetchInterval?: number | false;
  staleTime?: number;
}

const enc = encodeURIComponent;

/** Analytics that only change when trades close: refresh slowly as a safety net. */
const SLOW_REFRESH_MS = 60_000;

// ---------------------------------------------------------------- live state (WS-fed)

/** Shared fetcher for GET /api/status (also used by selector hooks such as useTradingMode). */
export function fetchStatus({ signal }: { signal?: AbortSignal }): Promise<BotStatus> {
  return api.get<BotStatus>("/api/status", { signal, timeoutMs: 8_000 });
}

/** GET /api/status — BotStatus. Kept fresh by `status` frames (≥ every 2 s). */
export function useStatus(options: QueryOpts = {}) {
  const fallback = useFallbackInterval();
  return useQuery({
    queryKey: queryKeys.status(),
    queryFn: fetchStatus,
    refetchInterval: options.refetchInterval ?? fallback,
    enabled: options.enabled,
    staleTime: options.staleTime ?? 5_000,
  });
}

/** GET /api/portfolio — live portfolio state + KPIs. Updated by `portfolio` frames. */
export function usePortfolio(options: QueryOpts = {}) {
  const fallback = useFallbackInterval();
  return useQuery({
    queryKey: queryKeys.portfolio(),
    queryFn: ({ signal }) => api.get<Portfolio>("/api/portfolio", { signal }),
    refetchInterval: options.refetchInterval ?? fallback,
    enabled: options.enabled,
    staleTime: options.staleTime,
  });
}

/** GET /api/positions — open positions. Updated by `positions` frames. */
export function usePositions(options: QueryOpts = {}) {
  const fallback = useFallbackInterval();
  return useQuery({
    queryKey: queryKeys.positions(),
    queryFn: ({ signal }) => api.get<Position[]>("/api/positions", { signal }),
    refetchInterval: options.refetchInterval ?? fallback,
    enabled: options.enabled,
    staleTime: options.staleTime,
  });
}

/** GET /api/risk — RiskSnapshot (meters, halts). Updated by `risk` frames. */
export function useRisk(options: QueryOpts = {}) {
  const fallback = useFallbackInterval();
  return useQuery({
    queryKey: queryKeys.risk(),
    queryFn: ({ signal }) => api.get<RiskSnapshot>("/api/risk", { signal }),
    refetchInterval: options.refetchInterval ?? fallback,
    enabled: options.enabled,
    staleTime: options.staleTime,
  });
}

/** GET /api/ai/latest?symbol= — latest analysis (null before the first one). Updated by `ai_analysis`. */
export function useAiLatest(symbol: string | undefined, options: QueryOpts = {}) {
  const fallback = useFallbackInterval(15_000);
  return useQuery({
    queryKey: queryKeys.aiLatest(symbol ?? ""),
    queryFn: ({ signal }) =>
      api.get<AIAnalysis | null>("/api/ai/latest", { signal, params: { symbol } }),
    enabled: Boolean(symbol) && options.enabled !== false,
    refetchInterval: options.refetchInterval ?? fallback,
    staleTime: options.staleTime,
  });
}

/** GET /api/market/watchlist — tickers with 24h sparklines. Updated by `ticker` frames. */
export function useWatchlist(options: QueryOpts = {}) {
  const fallback = useFallbackInterval();
  return useQuery({
    queryKey: queryKeys.watchlist(),
    queryFn: ({ signal }) => api.get<Ticker[]>("/api/market/watchlist", { signal }),
    refetchInterval: options.refetchInterval ?? fallback,
    enabled: options.enabled,
    staleTime: options.staleTime,
  });
}

/** GET /api/market/mtf?symbol= — multi-timeframe report. Updated by `mtf` frames. */
export function useMtf(symbol: string | undefined, options: QueryOpts = {}) {
  const fallback = useFallbackInterval(15_000);
  return useQuery({
    queryKey: queryKeys.mtf(symbol ?? ""),
    queryFn: ({ signal }) => api.get<MTFReport | null>("/api/market/mtf", { signal, params: { symbol } }),
    enabled: Boolean(symbol) && options.enabled !== false,
    refetchInterval: options.refetchInterval ?? fallback,
    staleTime: options.staleTime,
  });
}

/** GET /api/market/regime?symbol= — current regime, per-regime performance, history. */
export function useRegime(symbol: string | undefined, options: QueryOpts = {}) {
  const fallback = useFallbackInterval(15_000);
  return useQuery({
    queryKey: queryKeys.regime(symbol ?? ""),
    queryFn: ({ signal }) => api.get<RegimeReport>("/api/market/regime", { signal, params: { symbol } }),
    enabled: Boolean(symbol) && options.enabled !== false,
    refetchInterval: options.refetchInterval ?? fallback,
    staleTime: options.staleTime,
  });
}

/** GET /api/notifications — notification center list. `notification` frames prepend. */
export function useNotifications(params: NotificationParams = {}, options: QueryOpts = {}) {
  const fallback = useFallbackInterval(15_000);
  return useQuery({
    queryKey: queryKeys.notifications(params),
    queryFn: ({ signal }) =>
      api.get<NotificationList>("/api/notifications", { signal, params: params as QueryParams }),
    refetchInterval: options.refetchInterval ?? fallback,
    enabled: options.enabled,
    staleTime: options.staleTime,
  });
}

/** GET /api/settings — editable settings + applied version. Updated by `settings` frames. */
export function useSettings(options: QueryOpts = {}) {
  return useQuery({
    queryKey: queryKeys.settings(),
    queryFn: ({ signal }) => api.get<SettingsResponse>("/api/settings", { signal }),
    refetchInterval: options.refetchInterval,
    enabled: options.enabled,
    staleTime: options.staleTime ?? 30_000,
  });
}

// ---------------------------------------------------------------- history / analytics

/** GET /api/positions/{id}?timeframe= — one position with candles + markers. */
export function usePosition(id: string | undefined, timeframe?: Timeframe, options: QueryOpts = {}) {
  const fallback = useFallbackInterval(15_000);
  return useQuery({
    queryKey: queryKeys.position(id ?? "", timeframe),
    queryFn: ({ signal }) =>
      api.get<PositionDetail>(`/api/positions/${enc(id ?? "")}`, { signal, params: { timeframe } }),
    enabled: Boolean(id) && options.enabled !== false,
    refetchInterval: options.refetchInterval ?? fallback,
    staleTime: options.staleTime,
    placeholderData: keepPreviousData,
  });
}

/** GET /api/trades — filtered, sorted, paginated closed trades with a summary. */
export function useTrades(filters: TradeFilters = {}, options: QueryOpts = {}) {
  return useQuery({
    queryKey: queryKeys.trades(filters),
    queryFn: ({ signal }) => api.get<TradePage>("/api/trades", { signal, params: filters as QueryParams }),
    placeholderData: keepPreviousData,
    refetchInterval: options.refetchInterval ?? SLOW_REFRESH_MS,
    enabled: options.enabled,
    staleTime: options.staleTime,
  });
}

/** GET /api/trades/{id}?timeframe= — one closed trade with candles + markers. */
export function useTrade(id: string | undefined, timeframe?: Timeframe, options: QueryOpts = {}) {
  return useQuery({
    queryKey: queryKeys.trade(id ?? "", timeframe),
    queryFn: ({ signal }) =>
      api.get<TradeDetail>(`/api/trades/${enc(id ?? "")}`, { signal, params: { timeframe } }),
    enabled: Boolean(id) && options.enabled !== false,
    staleTime: options.staleTime ?? 60_000,
    placeholderData: keepPreviousData,
  });
}

/** GET /api/performance?range= — PerformanceReport. Invalidated on `trade_closed`. */
export function usePerformance(range: PerformanceRange, options: QueryOpts = {}) {
  return useQuery({
    queryKey: queryKeys.performance(range),
    queryFn: ({ signal }) =>
      api.get<PerformanceReport>("/api/performance", { signal, params: { range }, timeoutMs: 30_000 }),
    placeholderData: keepPreviousData,
    refetchInterval: options.refetchInterval ?? SLOW_REFRESH_MS,
    enabled: options.enabled,
    staleTime: options.staleTime ?? 30_000,
  });
}

/** GET /api/ai/history — paginated AI decisions. Invalidated on new `ai_analysis`. */
export function useAiHistory(filters: AiHistoryFilters = {}, options: QueryOpts = {}) {
  return useQuery({
    queryKey: queryKeys.aiHistory(filters),
    queryFn: ({ signal }) =>
      api.get<AIDecisionPage>("/api/ai/history", { signal, params: filters as QueryParams }),
    placeholderData: keepPreviousData,
    refetchInterval: options.refetchInterval ?? SLOW_REFRESH_MS,
    enabled: options.enabled,
    staleTime: options.staleTime,
  });
}

/** GET /api/ai/analytics?range= — AI accuracy, calibration, usage and cost. */
export function useAiAnalytics(range: PerformanceRange, options: QueryOpts = {}) {
  return useQuery({
    queryKey: queryKeys.aiAnalytics(range),
    queryFn: ({ signal }) =>
      api.get<AIAnalytics>("/api/ai/analytics", { signal, params: { range }, timeoutMs: 30_000 }),
    placeholderData: keepPreviousData,
    refetchInterval: options.refetchInterval ?? SLOW_REFRESH_MS,
    enabled: options.enabled,
    staleTime: options.staleTime ?? 30_000,
  });
}

/** GET /api/ai/models — configured model, options and usage (never key material). */
export function useAiModels(options: QueryOpts = {}) {
  return useQuery({
    queryKey: queryKeys.aiModels(),
    queryFn: ({ signal }) => api.get<AIModelInfo>("/api/ai/models", { signal }),
    refetchInterval: options.refetchInterval ?? SLOW_REFRESH_MS,
    enabled: options.enabled,
    staleTime: options.staleTime ?? 60_000,
  });
}

/**
 * GET /api/market?symbol=&timeframe=&limit= — candles, overlays, markers and position levels.
 * Live candles come from `useCandleStream(symbol, timeframe, cb)` (src/hooks/live.ts), not this cache.
 */
export function useMarket(
  symbol: string | undefined,
  timeframe: Timeframe,
  limit?: number,
  options: QueryOpts = {},
) {
  return useQuery({
    queryKey: queryKeys.market(symbol ?? "", timeframe, limit),
    queryFn: ({ signal }) =>
      api.get<MarketSnapshot>("/api/market", {
        signal,
        params: { symbol, timeframe, limit },
        timeoutMs: 30_000,
      }),
    enabled: Boolean(symbol) && options.enabled !== false,
    placeholderData: keepPreviousData,
    refetchInterval: options.refetchInterval,
    staleTime: options.staleTime ?? 30_000,
  });
}

/** GET /api/backtests — job list; polls while any job is queued or running. */
export function useBacktests(options: QueryOpts = {}) {
  return useQuery({
    queryKey: queryKeys.backtests(),
    queryFn: ({ signal }) => api.get<BacktestSummary[]>("/api/backtests", { signal }),
    refetchInterval:
      options.refetchInterval ??
      ((query) =>
        query.state.data?.some((b) => b.status === "queued" || b.status === "running") ? 2_000 : false),
    enabled: options.enabled,
    staleTime: options.staleTime,
  });
}

/** GET /api/backtests/{id} — full result; polls every second while queued/running. */
export function useBacktest(id: string | undefined, options: QueryOpts = {}) {
  return useQuery({
    queryKey: queryKeys.backtest(id ?? ""),
    queryFn: ({ signal }) =>
      api.get<BacktestResult>(`/api/backtests/${enc(id ?? "")}`, { signal, timeoutMs: 30_000 }),
    enabled: Boolean(id) && options.enabled !== false,
    refetchInterval:
      options.refetchInterval ??
      ((query) => {
        const status = query.state.data?.status;
        return status === "queued" || status === "running" ? 1_000 : false;
      }),
    staleTime: options.staleTime,
  });
}

/** GET /api/system — component health, host/process/database stats, recent issues. */
export function useSystem(options: QueryOpts = {}) {
  return useQuery({
    queryKey: queryKeys.system(),
    queryFn: ({ signal }) => api.get<SystemHealth>("/api/system", { signal }),
    refetchInterval: options.refetchInterval ?? 5_000,
    enabled: options.enabled,
    staleTime: options.staleTime ?? 2_000,
  });
}

/**
 * GET /api/events — one page of the event log (newest first; page back with `before_id`).
 * For a live-updating feed use `useEventFeed()` from src/hooks/live.ts.
 */
export function useEvents(filters: EventFilters = {}, options: QueryOpts = {}) {
  return useQuery({
    queryKey: queryKeys.events(filters),
    queryFn: ({ signal }) => api.get<EventPage>("/api/events", { signal, params: filters as QueryParams }),
    placeholderData: keepPreviousData,
    refetchInterval: options.refetchInterval,
    enabled: options.enabled,
    staleTime: options.staleTime ?? 30_000,
  });
}

// ---------------------------------------------------------------- mutations

/** PUT /api/settings — save; the engine applies it on its own schedule (status.engine.settings_version). */
export function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: BotSettings) => api.put<SettingsResponse>("/api/settings", settings),
    onSuccess: (response) => {
      queryClient.setQueryData(queryKeys.settings(), response);
    },
  });
}

/** Mark notifications read in every cached list (ids empty = all). */
export function markNotificationsReadInCache(queryClient: QueryClient, ids: number[]): void {
  const all = ids.length === 0;
  const idSet = new Set(ids);
  queryClient.setQueriesData<NotificationList>({ queryKey: queryKeys.notificationsRoot() }, (old) => {
    if (!old) return old;
    let changed = 0;
    const items = old.items.map((n: Notification) => {
      if (n.read || !(all || idSet.has(n.id))) return n;
      changed += 1;
      return { ...n, read: true };
    });
    if (changed === 0 && !all) return old;
    return { ...old, items, unread_count: all ? 0 : Math.max(0, old.unread_count - changed) };
  });
}

/** POST /api/notifications/read — `mutate([])` marks everything read. Optimistic. */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => api.post<NotificationList>("/api/notifications/read", { ids }),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notificationsRoot() });
      const snapshot = queryClient.getQueriesData<NotificationList>({ queryKey: queryKeys.notificationsRoot() });
      markNotificationsReadInCache(queryClient, ids);
      return { snapshot };
    },
    onError: (_error, _ids, context) => {
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.notificationsRoot() }),
  });
}

/** POST /api/backtests — queue a run (202); the list and the job poll until it finishes. */
export function useRunBacktest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: BacktestRequest) =>
      api.post<BacktestSummary>("/api/backtests", request, { timeoutMs: 30_000 }),
    onSuccess: (summary) => {
      queryClient.setQueryData<BacktestSummary[]>(queryKeys.backtests(), (old) =>
        old ? [summary, ...old.filter((b) => b.id !== summary.id)] : [summary],
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.backtests() });
    },
  });
}

/** DELETE /api/backtests/{id} */
export function useDeleteBacktest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/backtests/${enc(id)}`),
    onSuccess: (_void, id) => {
      queryClient.setQueryData<BacktestSummary[]>(queryKeys.backtests(), (old) =>
        old?.filter((b) => b.id !== id),
      );
      queryClient.removeQueries({ queryKey: queryKeys.backtest(id) });
    },
  });
}

/** Download GET /api/trades/export.csv for the given filters (auth-aware). */
export function exportTradesCsv(filters: TradeFilters = {}): Promise<void> {
  const { limit: _limit, offset: _offset, ...rest } = filters;
  const stamp = new Date().toISOString().slice(0, 10);
  return downloadFile("/api/trades/export.csv", rest as QueryParams, `trades-${stamp}.csv`);
}
