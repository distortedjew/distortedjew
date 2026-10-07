import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectLiveSync, mergeTicker, prependNotification } from "@/lib/live-sync";
import { queryKeys } from "@/lib/query-keys";
import { WsManager } from "@/lib/ws";
import { useLiveStore } from "@/stores/live";
import { FakeSocket } from "@/test/fake-socket";
import {
  makeAnalysis,
  makeEvent,
  makeMtf,
  makeNotification,
  makeNotificationList,
  makePortfolio,
  makePosition,
  makeRegimeReport,
  makeRegimeState,
  makeRisk,
  makeSettings,
  makeSettingsResponse,
  makeStatus,
  makeTicker,
  makeTrade,
  makeEngineStatus,
} from "@/test/fixtures";
import type {
  AIAnalysis,
  AIDecisionPage,
  NotificationList,
  RegimeReport,
  SettingsResponse,
  Ticker,
} from "@/types";

let queryClient: QueryClient;
let manager: WsManager;
let dispose: () => void;
let socket: FakeSocket;

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.reset();
  useLiveStore.getState().reset();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  manager = new WsManager({
    url: "ws://test/ws",
    createSocket: FakeSocket.factory,
    random: () => 0.5,
    attachWindowListeners: false,
  });
  dispose = connectLiveSync(queryClient, manager, useLiveStore);
  manager.start();
  socket = FakeSocket.latest();
  socket.open();
});

afterEach(() => {
  dispose();
  manager.stop();
  queryClient.clear();
  vi.useRealTimers();
});

describe("connection state", () => {
  it("mirrors the manager's status in the live store", () => {
    expect(useLiveStore.getState().connection).toBe("live");
    socket.serverClose();
    expect(useLiveStore.getState().connection).toBe("reconnecting");
    expect(useLiveStore.getState().nextRetryAt).not.toBeNull();
  });
});

describe("snapshot frames → query cache", () => {
  it("writes status, portfolio, positions, risk and mtf", () => {
    const status = makeStatus();
    const portfolio = makePortfolio({ equity: 12_000 });
    const positions = [makePosition()];
    const risk = makeRisk({ rejections_today: 9 });
    const mtf = makeMtf({ symbol: "ETH/USDT" });
    socket.receive({ type: "status", data: status });
    socket.receive({ type: "portfolio", data: portfolio });
    socket.receive({ type: "positions", data: positions });
    socket.receive({ type: "risk", data: risk });
    socket.receive({ type: "mtf", data: mtf });

    expect(queryClient.getQueryData(queryKeys.status())).toEqual(status);
    expect(queryClient.getQueryData(queryKeys.portfolio())).toEqual(portfolio);
    expect(queryClient.getQueryData(queryKeys.positions())).toEqual(positions);
    expect(queryClient.getQueryData(queryKeys.risk())).toEqual(risk);
    expect(queryClient.getQueryData(queryKeys.mtf("ETH/USDT"))).toEqual(mtf);
    expect(useLiveStore.getState().status).toEqual(status);
  });

  it("keeps the settings' applied version in step with the engine heartbeat", () => {
    queryClient.setQueryData(queryKeys.settings(), makeSettingsResponse({ applied_version: 1 }));
    socket.receive({
      type: "status",
      data: makeStatus({ engine: makeEngineStatus({ settings_version: 2 }) }),
    });
    expect(queryClient.getQueryData<SettingsResponse>(queryKeys.settings())?.applied_version).toBe(2);

    const settings = makeSettings({ version: 3 });
    socket.receive({ type: "settings", data: settings });
    expect(queryClient.getQueryData<SettingsResponse>(queryKeys.settings())?.settings).toEqual(settings);
  });

  it("stores tickers and merges them into the watchlist (keeping the sparkline)", () => {
    queryClient.setQueryData<Ticker[]>(queryKeys.watchlist(), [
      makeTicker(),
      makeTicker({ symbol: "ETH/USDT", price: 3_450 }),
    ]);
    socket.receive({ type: "ticker", data: makeTicker({ price: 98_000, sparkline: [] }) });
    const watchlist = queryClient.getQueryData<Ticker[]>(queryKeys.watchlist())!;
    expect(watchlist[0].price).toBe(98_000);
    expect(watchlist[0].sparkline).toHaveLength(4);
    expect(watchlist[1].price).toBe(3_450);
    expect(useLiveStore.getState().tickers["BTC/USDT"].price).toBe(98_000);
  });

  it("updates the regime report's current state and refetches it when the regime changes", () => {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    queryClient.setQueryData(queryKeys.regime("BTC/USDT"), makeRegimeReport());
    socket.receive({ type: "regime", data: makeRegimeState({ confidence: 90 }) });
    expect(queryClient.getQueryData<RegimeReport>(queryKeys.regime("BTC/USDT"))?.current?.confidence).toBe(
      90,
    );
    expect(invalidate).not.toHaveBeenCalled();

    socket.receive({ type: "regime", data: makeRegimeState({ regime: "RANGING" }) });
    expect(queryClient.getQueryData<RegimeReport>(queryKeys.regime("BTC/USDT"))?.current?.regime).toBe(
      "RANGING",
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.regime("BTC/USDT") });
  });
});

describe("AI analyses", () => {
  it("sets the latest analysis per symbol and refreshes history for a new decision", () => {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const analysis = makeAnalysis({ id: "dec_new000000001", symbol: "ETH/USDT" });
    socket.receive({ type: "ai_analysis", data: analysis });
    expect(queryClient.getQueryData(queryKeys.aiLatest("ETH/USDT"))).toEqual(analysis);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.aiHistoryRoot() });
  });

  it("patches a rewritten decision in place in cached history pages", () => {
    const original = makeAnalysis();
    queryClient.setQueryData(queryKeys.aiLatest("BTC/USDT"), original);
    const page: AIDecisionPage = { items: [original], total: 1, limit: 50, offset: 0 };
    queryClient.setQueryData(queryKeys.aiHistory({ symbol: "BTC/USDT" }), page);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const rewritten = makeAnalysis({ trade_id: "pos_0123456789ab" });
    socket.receive({ type: "ai_analysis", data: rewritten });
    const cached = queryClient.getQueryData<AIDecisionPage>(queryKeys.aiHistory({ symbol: "BTC/USDT" }));
    expect(cached?.items[0].trade_id).toBe("pos_0123456789ab");
    expect(queryClient.getQueryData<AIAnalysis>(queryKeys.aiLatest("BTC/USDT"))?.trade_id).toBe(
      "pos_0123456789ab",
    );
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("notifications", () => {
  it("prepends to every cached list and bumps the unread count", () => {
    const old = makeNotification({ id: 1, read: true });
    queryClient.setQueryData(queryKeys.notifications({ limit: 50 }), makeNotificationList([old]));
    queryClient.setQueryData(queryKeys.notifications({ unread_only: true }), makeNotificationList([]));

    socket.receive({
      type: "notification",
      data: makeNotification({ id: 2, type: "STOP_LOSS_HIT", severity: "warning" }),
    });
    const all = queryClient.getQueryData<NotificationList>(queryKeys.notifications({ limit: 50 }))!;
    expect(all.items.map((n) => n.id)).toEqual([2, 1]);
    expect(all.unread_count).toBe(1);
    expect(all.total).toBe(2);
    const unread = queryClient.getQueryData<NotificationList>(
      queryKeys.notifications({ unread_only: true }),
    )!;
    expect(unread.items.map((n) => n.id)).toEqual([2]);

    // Replays are ignored.
    socket.receive({ type: "notification", data: makeNotification({ id: 2 }) });
    expect(
      queryClient.getQueryData<NotificationList>(queryKeys.notifications({ limit: 50 }))!.items,
    ).toHaveLength(2);
  });

  it("prependNotification skips read items for unread-only lists", () => {
    const list = makeNotificationList([]);
    expect(prependNotification(list, makeNotification({ read: true }), true)).toBe(list);
    expect(prependNotification(undefined, makeNotification())).toBeUndefined();
  });
});

describe("events, closed trades and reconnects", () => {
  it("buffers live events in the store", () => {
    socket.receive({ type: "event", data: makeEvent({ id: 5 }) });
    socket.receive({ type: "event", data: makeEvent({ id: 6, type: "TRADE_EXECUTED" }) });
    expect(useLiveStore.getState().events.map((e) => e.id)).toEqual([6, 5]);
    expect(useLiveStore.getState().lastEventId).toBe(6);
  });

  it("refreshes system health on warning / error events", () => {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    socket.receive({ type: "event", data: makeEvent({ id: 9, type: "API_ERROR", severity: "error" }) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.system() });
  });

  it("invalidates trades, performance and AI analytics when a trade closes", () => {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    socket.receive({ type: "trade_closed", data: makeTrade() });
    const keys = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
    expect(keys).toEqual(
      expect.arrayContaining([
        JSON.stringify(queryKeys.tradesRoot()),
        JSON.stringify(queryKeys.performanceRoot()),
        JSON.stringify(queryKeys.aiAnalyticsRoot()),
        JSON.stringify(queryKeys.aiHistoryRoot()),
      ]),
    );
  });

  it("invalidates every query after a reconnect", () => {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    socket.serverClose();
    vi.advanceTimersByTime(500);
    FakeSocket.latest().open();
    expect(invalidate).toHaveBeenCalledWith();
  });

  it("stops writing after dispose", () => {
    dispose();
    socket.receive({ type: "portfolio", data: makePortfolio() });
    expect(queryClient.getQueryData(queryKeys.portfolio())).toBeUndefined();
  });
});

describe("mergeTicker", () => {
  it("leaves unknown symbols and empty caches alone", () => {
    const list = [makeTicker()];
    expect(mergeTicker(list, makeTicker({ symbol: "DOGE/USDT" }))).toBe(list);
    expect(mergeTicker(undefined, makeTicker())).toBeUndefined();
  });
});
