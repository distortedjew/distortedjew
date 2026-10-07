import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backoffDelay, WsManager, WS_UNAUTHORIZED_CODE, type WsManagerOptions } from "@/lib/ws";
import { FakeSocket } from "@/test/fake-socket";
import { makeEvent, makeStatus, makeTicker } from "@/test/fixtures";

function createManager(options: WsManagerOptions = {}) {
  return new WsManager({
    url: "ws://test/ws",
    createSocket: FakeSocket.factory,
    random: () => 0.5, // jitter factor exactly 1 → deterministic delays
    attachWindowListeners: false,
    ...options,
  });
}

/** Let queued microtasks (subscription flushes) run. */
const flushMicrotasks = () => Promise.resolve();

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("backoffDelay", () => {
  const opts = { minMs: 500, maxMs: 15_000, jitter: 0.25 };

  it("doubles from 0.5 s up to the 15 s cap", () => {
    const delays = Array.from({ length: 8 }, (_, attempt) =>
      backoffDelay(attempt, { ...opts, random: () => 0.5 }),
    );
    expect(delays).toEqual([500, 1_000, 2_000, 4_000, 8_000, 15_000, 15_000, 15_000]);
  });

  it("keeps jitter within ±25 % and inside [min, max]", () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const base = Math.min(15_000, 500 * 2 ** attempt);
      for (const r of [0, 0.1, 0.37, 0.5, 0.81, 0.999]) {
        const delay = backoffDelay(attempt, { ...opts, random: () => r });
        expect(delay).toBeGreaterThanOrEqual(Math.max(500, Math.floor(base * 0.75)));
        expect(delay).toBeLessThanOrEqual(Math.min(15_000, Math.ceil(base * 1.25)));
      }
    }
    expect(backoffDelay(2, { ...opts, random: () => 0 })).toBe(1_500);
    expect(backoffDelay(2, { ...opts, random: () => 1 })).toBe(2_500);
    // Clamped at both ends.
    expect(backoffDelay(0, { ...opts, random: () => 0 })).toBe(500);
    expect(backoffDelay(12, { ...opts, random: () => 1 })).toBe(15_000);
  });
});

describe("WsManager connection lifecycle", () => {
  it("goes connecting → live → reconnecting → offline and recovers", () => {
    const manager = createManager();
    const statuses: string[] = [];
    manager.onStatus((s) => statuses.push(s.status));

    manager.start();
    expect(manager.getSnapshot().status).toBe("connecting");
    FakeSocket.latest().open();
    expect(manager.getSnapshot().status).toBe("live");

    FakeSocket.latest().serverClose();
    expect(manager.getSnapshot().status).toBe("reconnecting");
    expect(manager.getSnapshot().nextRetryAt! - Date.now()).toBe(500);

    // Two more failed attempts keep it "reconnecting"; the third makes it "offline".
    vi.advanceTimersByTime(500);
    FakeSocket.latest().serverClose();
    expect(manager.getSnapshot().status).toBe("reconnecting");
    vi.advanceTimersByTime(1_000);
    FakeSocket.latest().serverClose();
    expect(manager.getSnapshot().status).toBe("offline");
    expect(manager.getSnapshot().attempt).toBe(3);

    // Retries continue in the background and recover by themselves.
    vi.advanceTimersByTime(2_000);
    expect(FakeSocket.instances).toHaveLength(4);
    FakeSocket.latest().open();
    expect(manager.getSnapshot()).toMatchObject({ status: "live", attempt: 0, reconnects: 1 });
    expect(statuses).toContain("offline");
    expect(statuses.at(-1)).toBe("live");
    manager.stop();
  });

  it("backs off exponentially between failed attempts", () => {
    const manager = createManager();
    manager.start();
    const delays: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      FakeSocket.latest().serverClose();
      const delay = manager.getSnapshot().nextRetryAt! - Date.now();
      delays.push(delay);
      vi.advanceTimersByTime(delay);
    }
    expect(delays).toEqual([500, 1_000, 2_000, 4_000, 8_000, 15_000, 15_000]);
    expect(FakeSocket.instances).toHaveLength(8);
    manager.stop();
  });

  it("stays 'connecting' (not 'reconnecting') until the first successful connection", () => {
    const manager = createManager();
    manager.start();
    FakeSocket.latest().serverClose();
    expect(manager.getSnapshot().status).toBe("connecting");
    manager.stop();
    expect(manager.getSnapshot().status).toBe("offline");
  });

  it("treats close code 4401 as unauthorized: offline and slowest retry pace", () => {
    const manager = createManager();
    manager.start();
    FakeSocket.latest().serverClose(WS_UNAUTHORIZED_CODE);
    const snap = manager.getSnapshot();
    expect(snap.status).toBe("offline");
    expect(snap.unauthorized).toBe(true);
    expect(snap.nextRetryAt! - Date.now()).toBe(15_000);
    manager.stop();
  });

  it("stop() closes the socket and cancels retries", () => {
    const manager = createManager();
    manager.start();
    const socket = FakeSocket.latest();
    socket.open();
    manager.stop();
    expect(socket.closedByClient).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(manager.getSnapshot().status).toBe("offline");
  });

  it("reconnectNow() retries immediately but leaves an opening socket alone", () => {
    const manager = createManager();
    manager.start();
    manager.reconnectNow(); // still CONNECTING → no churn
    expect(FakeSocket.instances).toHaveLength(1);
    FakeSocket.latest().serverClose();
    expect(FakeSocket.instances).toHaveLength(1);
    manager.reconnectNow(); // waiting for the backoff timer → go now
    expect(FakeSocket.instances).toHaveLength(2);
    manager.stop();
  });
});

describe("WsManager liveness", () => {
  it("replaces a socket that goes quiet for 10 s", () => {
    const manager = createManager();
    manager.start();
    const socket = FakeSocket.latest();
    socket.open();

    // Frames keep it alive…
    vi.advanceTimersByTime(9_000);
    socket.receive({ type: "status", data: makeStatus() });
    vi.advanceTimersByTime(9_000);
    expect(socket.closedByClient).toBe(false);
    expect(manager.getSnapshot().status).toBe("live");

    // …silence does not.
    vi.advanceTimersByTime(1_001);
    expect(socket.closedByClient).toBe(true);
    expect(manager.getSnapshot().status).toBe("reconnecting");
    vi.advanceTimersByTime(500);
    expect(FakeSocket.instances).toHaveLength(2);
    manager.stop();
  });

  it("bounds a connection attempt that never opens", () => {
    const manager = createManager();
    manager.start();
    const socket = FakeSocket.latest();
    vi.advanceTimersByTime(10_000);
    expect(socket.closedByClient).toBe(true);
    vi.advanceTimersByTime(500);
    expect(FakeSocket.instances).toHaveLength(2);
    manager.stop();
  });

  it("pings every 15 s while connected", () => {
    const manager = createManager({ livenessTimeoutMs: 60_000 });
    manager.start();
    const socket = FakeSocket.latest();
    socket.open();
    vi.advanceTimersByTime(15_000);
    vi.advanceTimersByTime(15_000);
    expect(socket.frames().filter((f) => f.type === "ping")).toHaveLength(2);
    manager.stop();
  });
});

describe("WsManager resume and chart subscriptions", () => {
  it("resumes from the last event id after every reconnect (not on the first connect)", () => {
    const manager = createManager();
    manager.start();
    const first = FakeSocket.latest();
    first.open();
    expect(first.frames().some((f) => f.type === "resume")).toBe(false);

    first.receive({
      type: "hello",
      data: { server_time: "2026-10-04T12:00:00Z", api_version: "1.0", last_event_id: 41 },
    });
    first.receive({ type: "event", data: makeEvent({ id: 42 }) });
    first.receive({ type: "event", data: makeEvent({ id: 43 }) });
    expect(manager.getSnapshot().lastEventId).toBe(43);

    first.serverClose();
    vi.advanceTimersByTime(500);
    const second = FakeSocket.latest();
    second.open();
    expect(second.frames()[0]).toEqual({ type: "resume", last_event_id: 43 });

    // A hello with a higher id does not skip ahead of what we actually received.
    second.receive({
      type: "hello",
      data: { server_time: "2026-10-04T12:00:05Z", api_version: "1.0", last_event_id: 50 },
    });
    expect(manager.getSnapshot().lastEventId).toBe(43);
    // A lower id means the database was reset: follow the server.
    second.receive({
      type: "hello",
      data: { server_time: "2026-10-04T12:00:06Z", api_version: "1.0", last_event_id: 3 },
    });
    expect(manager.getSnapshot().lastEventId).toBe(3);
    manager.stop();
  });

  it("ref-counts chart subscriptions and re-sends them after a reconnect", async () => {
    const manager = createManager();
    manager.start();
    const socket = FakeSocket.latest();

    // Subscribing before the socket opens is fine: the set is sent on open.
    const offA = manager.subscribeChart("BTC/USDT", "5m");
    const offB = manager.subscribeChart("BTC/USDT", "5m");
    const offC = manager.subscribeChart("ETH/USDT", "1h");
    await flushMicrotasks();
    socket.open();
    const subscribe = socket.frames().filter((f) => f.type === "subscribe_chart");
    expect(subscribe.at(-1)).toEqual({
      type: "subscribe_chart",
      charts: [
        { symbol: "BTC/USDT", timeframe: "5m" },
        { symbol: "ETH/USDT", timeframe: "1h" },
      ],
    });

    // One of two BTC subscribers leaves: still subscribed, nothing sent.
    offA();
    offA(); // idempotent
    await flushMicrotasks();
    expect(manager.getChartSubscriptions()).toHaveLength(2);

    offC();
    await flushMicrotasks();
    expect(socket.frames().at(-1)).toEqual({
      type: "subscribe_chart",
      charts: [{ symbol: "BTC/USDT", timeframe: "5m" }],
    });

    // After a reconnect the remaining subscription is sent again (after the resume).
    socket.receive({
      type: "hello",
      data: { server_time: "2026-10-04T12:00:00Z", api_version: "1.0", last_event_id: 7 },
    });
    socket.serverClose();
    vi.advanceTimersByTime(500);
    const next = FakeSocket.latest();
    next.open();
    expect(next.frames()).toEqual([
      { type: "resume", last_event_id: 7 },
      { type: "subscribe_chart", charts: [{ symbol: "BTC/USDT", timeframe: "5m" }] },
    ]);

    offB();
    await flushMicrotasks();
    expect(next.frames().at(-1)).toEqual({ type: "subscribe_chart", charts: [] });
    manager.stop();
  });
});

describe("WsManager typed emitter", () => {
  it("delivers each frame type to its handlers and isolates handler errors", () => {
    const manager = createManager();
    const tickers: string[] = [];
    const all: string[] = [];
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    manager.on("ticker", () => {
      throw new Error("boom");
    });
    const off = manager.on("ticker", (data) => tickers.push(data.symbol));
    manager.onAny((frame) => all.push(frame.type));
    manager.start();
    const socket = FakeSocket.latest();
    socket.open();
    socket.receive({ type: "ticker", data: makeTicker({ symbol: "ETH/USDT" }) });
    socket.receive({ type: "status", data: makeStatus() });
    socket.onmessage?.({ data: "not json" } as MessageEvent);
    off();
    socket.receive({ type: "ticker", data: makeTicker({ symbol: "SOL/USDT" }) });

    expect(tickers).toEqual(["ETH/USDT"]);
    expect(all).toEqual(["ticker", "status", "ticker"]);
    expect(consoleError).toHaveBeenCalled();
    manager.stop();
  });

  it("notifies reconnect listeners only on re-connections", () => {
    const manager = createManager();
    const onReconnect = vi.fn();
    manager.onReconnect(onReconnect);
    manager.start();
    FakeSocket.latest().open();
    expect(onReconnect).not.toHaveBeenCalled();
    FakeSocket.latest().serverClose();
    vi.advanceTimersByTime(500);
    FakeSocket.latest().open();
    expect(onReconnect).toHaveBeenCalledTimes(1);
    manager.stop();
  });
});
