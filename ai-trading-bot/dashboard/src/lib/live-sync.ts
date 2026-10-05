/**
 * WebSocket → state wiring. Every server frame lands in exactly one place:
 *
 *   status, portfolio, positions, risk, mtf, settings  → query cache (setQueryData)
 *   ai_analysis      → ai latest per symbol (+ history pages patched / invalidated)
 *   regime           → regime report `current` (report refetched when the regime changes)
 *   ticker           → live store + watchlist cache entry
 *   event            → live store rolling buffer (system health refetched on warnings)
 *   notification     → prepended to every cached notification list (+ unread count)
 *   trade_closed     → trades / performance / AI analytics / AI history invalidated
 *   reconnect        → every query invalidated (REST snapshots refetched)
 *
 * `connectLiveSync` is called once by <LiveDataProvider>; it returns a disposer.
 */
import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { wsManager, type WsManager } from "@/lib/ws";
import { useLiveStore } from "@/stores/live";
import type {
  AIAnalysis,
  AIDecisionPage,
  Notification,
  NotificationList,
  RegimeReport,
  SettingsResponse,
  Ticker,
} from "@/types";

type LiveStoreApi = Pick<typeof useLiveStore, "getState">;

/** Prepend a notification to a cached list (dedupe by id, bump counts). */
export function prependNotification(
  list: NotificationList | undefined,
  notification: Notification,
  unreadOnly = false,
): NotificationList | undefined {
  if (!list) return list;
  if (list.items.some((n) => n.id === notification.id)) return list;
  if (unreadOnly && notification.read) return list;
  return {
    ...list,
    items: [notification, ...list.items],
    unread_count: list.unread_count + (notification.read ? 0 : 1),
    total: list.total + 1,
  };
}

/** Merge a fresh ticker into the watchlist, keeping the sparkline when the frame has none. */
export function mergeTicker(list: Ticker[] | undefined, ticker: Ticker): Ticker[] | undefined {
  if (!list) return list;
  let found = false;
  const next = list.map((t) => {
    if (t.symbol !== ticker.symbol) return t;
    found = true;
    return { ...ticker, sparkline: ticker.sparkline.length ? ticker.sparkline : t.sparkline };
  });
  return found ? next : list;
}

export function connectLiveSync(
  queryClient: QueryClient,
  manager: WsManager = wsManager,
  store: LiveStoreApi = useLiveStore,
): () => void {
  const live = () => store.getState();
  const disposers: (() => void)[] = [];
  const add = (dispose: () => void) => disposers.push(dispose);

  const syncConnection = () => {
    const snap = manager.getSnapshot();
    live().setConnection({
      status: snap.status,
      attempt: snap.attempt,
      nextRetryAt: snap.nextRetryAt,
      connectedAt: snap.connectedAt,
      reconnects: snap.reconnects,
      unauthorized: snap.unauthorized,
    });
  };
  syncConnection();
  add(manager.onStatus(syncConnection));
  add(manager.onAny(() => live().noteFrame(Date.now())));

  add(manager.on("hello", (data) => live().setHello(data)));

  add(
    manager.on("status", (data) => {
      queryClient.setQueryData(queryKeys.status(), data);
      live().setStatus(data, Date.now());
      const applied = data.engine?.settings_version;
      if (applied !== undefined) {
        queryClient.setQueryData<SettingsResponse>(queryKeys.settings(), (old) =>
          old && old.applied_version !== applied ? { ...old, applied_version: applied } : old,
        );
      }
    }),
  );

  add(manager.on("portfolio", (data) => queryClient.setQueryData(queryKeys.portfolio(), data)));
  add(manager.on("positions", (data) => queryClient.setQueryData(queryKeys.positions(), data)));
  add(manager.on("risk", (data) => queryClient.setQueryData(queryKeys.risk(), data)));
  add(manager.on("mtf", (data) => queryClient.setQueryData(queryKeys.mtf(data.symbol), data)));

  add(
    manager.on("ticker", (data) => {
      live().setTicker(data);
      queryClient.setQueryData<Ticker[]>(queryKeys.watchlist(), (old) => mergeTicker(old, data));
    }),
  );

  add(
    manager.on("ai_analysis", (data) => {
      const key = queryKeys.aiLatest(data.symbol);
      const previous = queryClient.getQueryData<AIAnalysis | null>(key);
      queryClient.setQueryData(key, data);
      if (previous?.id === data.id) {
        // Same decision rewritten (risk decision / trade id / evaluation): patch cached pages.
        queryClient.setQueriesData<AIDecisionPage>({ queryKey: queryKeys.aiHistoryRoot() }, (old) =>
          old && old.items.some((a) => a.id === data.id)
            ? { ...old, items: old.items.map((a) => (a.id === data.id ? data : a)) }
            : old,
        );
      } else {
        // A new decision: history pages refetch if mounted, otherwise they are just marked stale.
        void queryClient.invalidateQueries({ queryKey: queryKeys.aiHistoryRoot() });
      }
    }),
  );

  add(
    manager.on("regime", (data) => {
      const key = queryKeys.regime(data.symbol);
      const previous = queryClient.getQueryData<RegimeReport>(key);
      if (!previous) return;
      queryClient.setQueryData<RegimeReport>(key, { ...previous, current: data });
      if (previous.current?.regime !== data.regime) void queryClient.invalidateQueries({ queryKey: key });
    }),
  );

  add(
    manager.on("event", (data) => {
      live().addEvents([data]);
      if (data.severity === "warning" || data.severity === "error") {
        void queryClient.invalidateQueries({ queryKey: queryKeys.system() });
      }
    }),
  );

  add(
    manager.on("notification", (data) => {
      for (const query of queryClient.getQueryCache().findAll({ queryKey: queryKeys.notificationsRoot() })) {
        const params = (query.queryKey[1] ?? {}) as { unread_only?: boolean };
        queryClient.setQueryData<NotificationList>(query.queryKey, (old) =>
          prependNotification(old, data, Boolean(params.unread_only)),
        );
      }
    }),
  );

  add(
    manager.on("trade_closed", (data) => {
      for (const key of [
        queryKeys.tradesRoot(),
        queryKeys.performanceRoot(),
        queryKeys.aiAnalyticsRoot(),
        queryKeys.aiHistoryRoot(),
        ["positions", "detail", data.id],
      ]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    }),
  );

  add(
    manager.on("settings", (data) => {
      const previous = queryClient.getQueryData<SettingsResponse>(queryKeys.settings());
      if (previous)
        queryClient.setQueryData<SettingsResponse>(queryKeys.settings(), { ...previous, settings: data });
      else void queryClient.invalidateQueries({ queryKey: queryKeys.settings() });
    }),
  );

  add(manager.onReconnect(() => void queryClient.invalidateQueries()));

  return () => {
    for (const dispose of disposers.splice(0)) dispose();
  };
}
