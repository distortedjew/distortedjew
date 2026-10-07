/**
 * Live (WebSocket) hooks. Components never touch the socket directly.
 *
 *   const status = useConnectionStatus();            // "live" | "reconnecting" | …
 *   const ticker = useTicker("BTC/USDT");            // freshest of WS ticker / REST watchlist
 *   useCandleStream("BTC/USDT", "5m", (c) => series.update(c.candle));
 *   useWsFrame("trade_closed", (trade) => …);        // react to one frame type
 *   const { events } = useEventFeed({ limit: 50 });  // REST history + live events, newest first
 *   const bot = useBotStatus();                      // effective bot state + heartbeat age
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useMemo } from "react";
import { fetchStatus, useEvents, useStatus, useWatchlist } from "@/hooks/queries";
import { useFallbackInterval } from "@/hooks/use-fallback-interval";
import { queryKeys } from "@/lib/query-keys";
import { useNow } from "@/lib/time";
import { wsManager } from "@/lib/ws";
import { mergeEvents, useLiveStore } from "@/stores/live";
import type {
  BotState,
  BotStatus,
  ConnectionStatus,
  Event,
  EventType,
  Severity,
  Ticker,
  Timeframe,
  TradingMode,
  WsCandleData,
  WsFrameData,
  WsFrameType,
} from "@/types";

// ---------------------------------------------------------------- connection

export function useConnectionStatus(): ConnectionStatus {
  return useLiveStore((s) => s.connection);
}

export interface ConnectionInfo {
  status: ConnectionStatus;
  attempt: number;
  nextRetryAt: number | null;
  lastFrameAt: number | null;
  connectedAt: number | null;
  reconnects: number;
  /** The API rejected the dashboard token (open the app with ?token=…). */
  unauthorized: boolean;
  retryNow: () => void;
}

export function useConnection(): ConnectionInfo {
  const status = useLiveStore((s) => s.connection);
  const attempt = useLiveStore((s) => s.reconnectAttempt);
  const nextRetryAt = useLiveStore((s) => s.nextRetryAt);
  const lastFrameAt = useLiveStore((s) => s.lastFrameAt);
  const connectedAt = useLiveStore((s) => s.connectedAt);
  const reconnects = useLiveStore((s) => s.reconnects);
  const unauthorized = useLiveStore((s) => s.unauthorized);
  return {
    status,
    attempt,
    nextRetryAt,
    lastFrameAt,
    connectedAt,
    reconnects,
    unauthorized,
    retryNow: retryConnection,
  };
}

function retryConnection(): void {
  wsManager.reconnectNow();
}

// ---------------------------------------------------------------- frames

/** Run `handler` for every frame of `type` (latest handler is always used; no resubscribe churn). */
export function useWsFrame<T extends WsFrameType>(
  type: T,
  handler: (data: WsFrameData<T>) => void,
  enabled = true,
): void {
  const onFrame = useEffectEvent((data: WsFrameData<T>) => handler(data));
  useEffect(() => {
    if (!enabled) return;
    return wsManager.on(type, (data) => onFrame(data));
  }, [type, enabled]);
}

/**
 * Subscribe to live `candle` frames for one chart (ref-counted `subscribe_chart`).
 * The callback receives forming and closed candles with overlay values at that candle.
 */
export function useCandleStream(
  symbol: string | undefined,
  timeframe: Timeframe,
  onCandle: (data: WsCandleData) => void,
  enabled = true,
): void {
  const handle = useEffectEvent((data: WsCandleData) => onCandle(data));
  useEffect(() => {
    if (!enabled || !symbol) return;
    const unsubscribeChart = wsManager.subscribeChart(symbol, timeframe);
    const off = wsManager.on("candle", (data) => {
      if (data.symbol === symbol && data.timeframe === timeframe) handle(data);
    });
    return () => {
      off();
      unsubscribeChart();
    };
  }, [symbol, timeframe, enabled]);
}

// ---------------------------------------------------------------- tickers

/** Latest ticker for a symbol: the newer of the WS ticker and the REST watchlist entry. */
export function useTicker(symbol: string | undefined): Ticker | undefined {
  const live = useLiveStore((s) => (symbol ? s.tickers[symbol] : undefined));
  const { data } = useWatchlist();
  const rest = symbol ? data?.find((t) => t.symbol === symbol) : undefined;
  if (!live) return rest;
  if (!rest) return live;
  return Date.parse(live.ts) >= Date.parse(rest.ts) ? live : rest;
}

/** All live tickers keyed by symbol (WS only). */
export function useTickers(): Record<string, Ticker> {
  return useLiveStore((s) => s.tickers);
}

// ---------------------------------------------------------------- events

export interface LiveEventFilter {
  types?: EventType[];
  severity?: Severity | Severity[];
  symbol?: string;
  limit?: number;
}

function matches(event: Event, filter: LiveEventFilter): boolean {
  if (filter.types?.length && !filter.types.includes(event.type)) return false;
  if (filter.symbol && event.symbol !== filter.symbol) return false;
  if (filter.severity) {
    const allowed = Array.isArray(filter.severity) ? filter.severity : [filter.severity];
    if (!allowed.includes(event.severity)) return false;
  }
  return true;
}

/** Events received over the WebSocket since the page loaded (newest first, ≤ 500). */
export function useLiveEvents(filter: LiveEventFilter = {}): Event[] {
  const events = useLiveStore((s) => s.events);
  const { types, severity, symbol, limit } = filter;
  return useMemo(() => {
    const out = events.filter((e) => matches(e, { types, severity, symbol }));
    return limit ? out.slice(0, limit) : out;
  }, [events, types, severity, symbol, limit]);
}

/**
 * A live event feed: the latest REST page merged with events streamed since, newest first.
 * Use for activity streams / event logs. `severity` may be a single value for the REST call.
 */
export function useEventFeed(filter: LiveEventFilter = {}) {
  const { types, severity, symbol } = filter;
  const limit = filter.limit ?? 50;
  const restSeverity = Array.isArray(severity) ? undefined : severity;
  const query = useEvents({ limit, types, severity: restSeverity, symbol });
  const live = useLiveEvents({ types, severity, symbol, limit });
  const restItems = query.data?.items;
  const events = useMemo(() => {
    const rest = (restItems ?? []).filter((e) => matches(e, { types, severity, symbol }));
    return mergeEvents(rest, live, limit);
  }, [restItems, live, limit, types, severity, symbol]);
  return {
    events,
    isPending: query.isPending && live.length === 0,
    error: query.error,
    refetch: query.refetch,
    hasMore: query.data?.has_more ?? false,
  };
}

// ---------------------------------------------------------------- bot status

export type EffectiveBotState = BotState | "unknown";

export interface BotStatusInfo {
  status: BotStatus | undefined;
  /** online / degraded / offline from the heartbeat age; "unknown" while we have no fresh data. */
  state: EffectiveBotState;
  /** Heartbeat age now (server age at receipt + time since), seconds. */
  heartbeatAgeSec: number | null;
  /** Seconds since we last heard from the API about the bot. */
  dataAgeSec: number | null;
  isPending: boolean;
}

/** Thresholds match the API: online < 10 s heartbeat age, degraded < 60 s, else offline. */
export function stateFromHeartbeat(ageSec: number | null, fallback: BotState): BotState {
  if (ageSec === null) return fallback;
  if (ageSec < 10) return "online";
  if (ageSec < 60) return "degraded";
  return "offline";
}

export function useBotStatus(): BotStatusInfo {
  const query = useStatus();
  const connection = useConnectionStatus();
  const now = useNow();
  const status = query.data;
  const updatedAt = query.dataUpdatedAt;

  if (!status) {
    return {
      status: undefined,
      state: "unknown",
      heartbeatAgeSec: null,
      dataAgeSec: null,
      isPending: query.isPending,
    };
  }
  const dataAgeSec = updatedAt ? Math.max(0, (now - updatedAt) / 1_000) : null;
  const heartbeatAgeSec =
    status.heartbeat_age_sec === null ? null : status.heartbeat_age_sec + (dataAgeSec ?? 0);
  const stale = connection !== "live" && dataAgeSec !== null && dataAgeSec > 15;
  const state: EffectiveBotState = stale
    ? "unknown"
    : status.engine === null
      ? "offline"
      : stateFromHeartbeat(heartbeatAgeSec, status.state);
  return { status, state, heartbeatAgeSec, dataAgeSec, isPending: false };
}

/**
 * The engine's trading mode ("paper" | "live"), undefined until known. Re-renders only when the
 * mode itself changes (not on every status frame), so the app shell can use it cheaply.
 */
export function useTradingMode(): TradingMode | undefined {
  const fallback = useFallbackInterval();
  const { data } = useQuery({
    queryKey: queryKeys.status(),
    queryFn: fetchStatus,
    select: (status) => status.mode,
    refetchInterval: fallback,
    staleTime: 5_000,
  });
  return data;
}
