import { beforeEach, describe, expect, it } from "vitest";
import { EVENT_BUFFER_SIZE, mergeEvents, useLiveStore } from "@/stores/live";
import { makeEvent, makeTicker } from "@/test/fixtures";

beforeEach(() => useLiveStore.getState().reset());

describe("mergeEvents", () => {
  it("keeps newest first, deduplicates by id and caps the buffer", () => {
    const current = [makeEvent({ id: 3 }), makeEvent({ id: 2 })];
    const merged = mergeEvents(current, [makeEvent({ id: 4 }), makeEvent({ id: 2 }), makeEvent({ id: 1 })]);
    expect(merged.map((e) => e.id)).toEqual([4, 3, 2, 1]);
    expect(mergeEvents(current, [])).toBe(current);
    expect(mergeEvents(current, [makeEvent({ id: 3 })])).toBe(current);

    const many = Array.from({ length: EVENT_BUFFER_SIZE + 20 }, (_, i) => makeEvent({ id: i + 1 }));
    const capped = mergeEvents([], many);
    expect(capped).toHaveLength(EVENT_BUFFER_SIZE);
    expect(capped[0].id).toBe(EVENT_BUFFER_SIZE + 20);
  });
});

describe("useLiveStore", () => {
  it("tracks the last event id from hello and events", () => {
    const store = useLiveStore.getState();
    store.setHello({ server_time: "2026-10-04T12:00:00Z", api_version: "1", last_event_id: 10 });
    expect(useLiveStore.getState().lastEventId).toBe(10);
    store.addEvents([makeEvent({ id: 12 }), makeEvent({ id: 11 })]);
    expect(useLiveStore.getState().lastEventId).toBe(12);
  });

  it("keeps the newer ticker per symbol", () => {
    const store = useLiveStore.getState();
    store.setTickers([makeTicker({ price: 1, ts: "2026-10-04T12:00:05Z" })]);
    store.setTickers([makeTicker({ price: 2, ts: "2026-10-04T12:00:01Z" })]);
    expect(useLiveStore.getState().tickers["BTC/USDT"].price).toBe(1);
    store.setTicker(makeTicker({ price: 3 }));
    expect(useLiveStore.getState().tickers["BTC/USDT"].price).toBe(3);
  });

  it("throttles the frame clock to once a second", () => {
    const store = useLiveStore.getState();
    store.noteFrame(1_000);
    store.noteFrame(1_500);
    expect(useLiveStore.getState().lastFrameAt).toBe(1_000);
    store.noteFrame(2_000);
    expect(useLiveStore.getState().lastFrameAt).toBe(2_000);
  });
});
