/**
 * Live store (Zustand): state that only exists because of the WebSocket stream.
 *
 * REST-shaped data (portfolio, positions, risk, status, AI, settings…) lives in the
 * TanStack Query cache and is updated there by src/lib/live-sync.ts. This store keeps:
 * the connection state, heartbeat bookkeeping, the latest ticker per symbol and a rolling
 * buffer of the most recent events. Read it through the hooks in src/hooks/live.ts.
 */
import { create } from "zustand";
import type { BotStatus, ConnectionStatus, Event, Ticker, WsHelloData } from "@/types";

export const EVENT_BUFFER_SIZE = 500;
/** lastFrameAt is refreshed at most this often to avoid a store write per frame. */
const FRAME_CLOCK_THROTTLE_MS = 1_000;

export interface LiveState {
  connection: ConnectionStatus;
  reconnectAttempt: number;
  nextRetryAt: number | null;
  connectedAt: number | null;
  reconnects: number;
  /** Client time (ms) of the last frame received (throttled to ~1 s). */
  lastFrameAt: number | null;
  lastEventId: number | null;
  hello: WsHelloData | null;
  /** Latest BotStatus and the client time it arrived (for a skew-free heartbeat age). */
  status: BotStatus | null;
  statusAt: number | null;
  tickers: Record<string, Ticker>;
  /** Newest first, at most EVENT_BUFFER_SIZE, deduplicated by id. */
  events: Event[];

  setConnection: (patch: {
    status: ConnectionStatus;
    attempt: number;
    nextRetryAt: number | null;
    connectedAt: number | null;
    reconnects: number;
  }) => void;
  noteFrame: (at: number) => void;
  setHello: (hello: WsHelloData) => void;
  setStatus: (status: BotStatus, at: number) => void;
  setTicker: (ticker: Ticker) => void;
  setTickers: (tickers: Ticker[]) => void;
  addEvents: (events: Event[]) => void;
  reset: () => void;
}

const initial = {
  connection: "connecting" as ConnectionStatus,
  reconnectAttempt: 0,
  nextRetryAt: null,
  connectedAt: null,
  reconnects: 0,
  lastFrameAt: null,
  lastEventId: null,
  hello: null,
  status: null,
  statusAt: null,
  tickers: {},
  events: [],
};

/** Merge new events into a newest-first buffer, deduplicating by id. */
export function mergeEvents(current: Event[], incoming: Event[], max = EVENT_BUFFER_SIZE): Event[] {
  if (incoming.length === 0) return current;
  const seen = new Set(current.map((e) => e.id));
  const fresh = incoming.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
  if (fresh.length === 0) return current;
  const merged = [...fresh, ...current];
  merged.sort((a, b) => b.id - a.id);
  return merged.length > max ? merged.slice(0, max) : merged;
}

export const useLiveStore = create<LiveState>()((set, get) => ({
  ...initial,

  setConnection: ({ status, attempt, nextRetryAt, connectedAt, reconnects }) =>
    set({ connection: status, reconnectAttempt: attempt, nextRetryAt, connectedAt, reconnects }),

  noteFrame: (at) => {
    const last = get().lastFrameAt;
    if (last === null || at - last >= FRAME_CLOCK_THROTTLE_MS) set({ lastFrameAt: at });
  },

  setHello: (hello) =>
    set((state) => ({
      hello,
      lastEventId:
        state.lastEventId === null ? hello.last_event_id : Math.max(state.lastEventId, hello.last_event_id),
    })),

  setStatus: (status, at) => set({ status, statusAt: at }),

  setTicker: (ticker) => set((state) => ({ tickers: { ...state.tickers, [ticker.symbol]: ticker } })),

  setTickers: (tickers) =>
    set((state) => {
      const next = { ...state.tickers };
      for (const t of tickers) {
        const existing = next[t.symbol];
        if (!existing || Date.parse(t.ts) >= Date.parse(existing.ts)) next[t.symbol] = t;
      }
      return { tickers: next };
    }),

  addEvents: (events) =>
    set((state) => {
      const merged = mergeEvents(state.events, events);
      if (merged === state.events) return state;
      const maxId = merged.length ? merged[0].id : null;
      return {
        events: merged,
        lastEventId:
          maxId === null ? state.lastEventId : state.lastEventId === null ? maxId : Math.max(state.lastEventId, maxId),
      };
    }),

  reset: () => set({ ...initial }),
}));
