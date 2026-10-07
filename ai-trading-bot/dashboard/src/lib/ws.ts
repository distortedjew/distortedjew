/**
 * WebSocket manager (singleton `wsManager`) for the API's `/ws` stream.
 *
 * - Connects to `/ws` on the same origin (wss on https; `?token=` when a dashboard token is set).
 * - Status: connecting → live → reconnecting → offline (after `offlineAfterAttempts` failures;
 *   it keeps retrying in the background and recovers by itself).
 * - Reconnects with exponential backoff 0.5 s → 15 s with ±25 % jitter.
 * - Liveness: if no frame arrives for 10 s (the server sends `status` at least every 2 s)
 *   the socket is considered dead and replaced. A `ping` is sent every 15 s.
 * - After every reconnect: sends `resume` with the last seen event id, re-sends the chart
 *   subscriptions and notifies `onReconnect` listeners (the query layer refetches everything).
 * - Chart subscriptions are ref-counted: `const off = wsManager.subscribeChart("BTC/USDT", "5m")`.
 * - A close with code 4401 means the dashboard token is missing/wrong: status goes "offline",
 *   `unauthorized` is set and retries slow down to the maximum backoff.
 *
 * Components should use the hooks in src/hooks/live.ts rather than this class directly.
 */
import { getAuthToken } from "@/lib/api";
import type {
  ConnectionStatus,
  Timeframe,
  WsClientFrame,
  WsFrame,
  WsFrameData,
  WsFrameType,
  WsServerMessage,
} from "@/types";

export interface BackoffOptions {
  minMs: number;
  maxMs: number;
  /** Relative jitter: 0.25 → delay × [0.75, 1.25], clamped to [minMs, maxMs]. */
  jitter: number;
  random: () => number;
}

/** Delay before reconnect attempt `attempt` (0-based): min·2^attempt, capped, with jitter. */
export function backoffDelay(attempt: number, opts: BackoffOptions): number {
  const raw = Math.min(opts.maxMs, opts.minMs * 2 ** Math.max(0, attempt));
  const factor = 1 - opts.jitter + opts.random() * 2 * opts.jitter;
  return Math.round(Math.min(opts.maxMs, Math.max(opts.minMs, raw * factor)));
}

type WebSocketLike = Pick<WebSocket, "readyState" | "send" | "close"> & {
  onopen: ((ev: Event) => unknown) | null;
  onmessage: ((ev: MessageEvent) => unknown) | null;
  onclose: ((ev: CloseEvent) => unknown) | null;
  onerror: ((ev: Event) => unknown) | null;
};

export type WebSocketFactory = (url: string) => WebSocketLike;

export interface WsManagerOptions {
  url?: string | (() => string);
  createSocket?: WebSocketFactory;
  random?: () => number;
  now?: () => number;
  minBackoffMs?: number;
  maxBackoffMs?: number;
  jitter?: number;
  livenessTimeoutMs?: number;
  pingIntervalMs?: number;
  /** Consecutive failed attempts after which the status reads "offline" (retries continue). */
  offlineAfterAttempts?: number;
  /** Listen to window online/visibility events to retry immediately. */
  attachWindowListeners?: boolean;
}

export interface WsSnapshot {
  status: ConnectionStatus;
  /** Consecutive failed attempts since the last successful connection. */
  attempt: number;
  /** When the next reconnect attempt is scheduled (ms epoch), if any. */
  nextRetryAt: number | null;
  lastFrameAt: number | null;
  lastEventId: number | null;
  connectedAt: number | null;
  /** Successful re-connections since start (0 on the first connection). */
  reconnects: number;
  /** The server rejected the token (close code 4401). */
  unauthorized: boolean;
}

type FrameHandler<T extends WsFrameType> = (data: WsFrameData<T>, frame: WsFrame<T>) => void;
type AnyHandler = (frame: WsServerMessage) => void;

const OPEN = 1;
const CONNECTING = 0;
/** Close code the API uses for a rejected dashboard token. */
export const WS_UNAUTHORIZED_CODE = 4401;

/** `/ws` on the API origin (VITE_WS_URL overrides; absolute VITE_API_BASE is honoured). */
export function defaultWsUrl(): string {
  let base: string;
  const explicit = import.meta.env.VITE_WS_URL;
  const apiBase = import.meta.env.VITE_API_BASE;
  if (explicit) {
    base = explicit;
  } else if (apiBase && /^https?:\/\//i.test(apiBase)) {
    const u = new URL(apiBase);
    base = `${u.protocol === "https:" ? "wss" : "ws"}://${u.host}/ws`;
  } else {
    const { protocol, host } = window.location;
    base = `${protocol === "https:" ? "wss" : "ws"}://${host}/ws`;
  }
  const token = getAuthToken();
  if (!token) return base;
  const url = new URL(base);
  url.searchParams.set("token", token);
  return url.toString();
}

export class WsManager {
  private readonly opts: Required<Omit<WsManagerOptions, "url" | "createSocket">> & {
    url: string | (() => string);
    createSocket: WebSocketFactory;
  };

  private socket: WebSocketLike | null = null;
  private started = false;
  private everConnected = false;
  private status: ConnectionStatus = "connecting";
  private attempt = 0;
  private reconnects = 0;
  private nextRetryAt: number | null = null;
  private lastFrameAt: number | null = null;
  private lastEventId: number | null = null;
  private connectedAt: number | null = null;
  private unauthorized = false;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private livenessTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private subscriptionFlushQueued = false;

  private readonly handlers = new Map<WsFrameType, Set<FrameHandler<WsFrameType>>>();
  private readonly anyHandlers = new Set<AnyHandler>();
  private readonly statusListeners = new Set<(snapshot: WsSnapshot) => void>();
  private readonly reconnectListeners = new Set<() => void>();
  private readonly chartSubs = new Map<string, { symbol: string; timeframe: Timeframe; count: number }>();
  private windowCleanup: (() => void) | null = null;

  constructor(options: WsManagerOptions = {}) {
    this.opts = {
      url: options.url ?? defaultWsUrl,
      createSocket: options.createSocket ?? ((url) => new WebSocket(url)),
      random: options.random ?? Math.random,
      now: options.now ?? Date.now,
      minBackoffMs: options.minBackoffMs ?? 500,
      maxBackoffMs: options.maxBackoffMs ?? 15_000,
      jitter: options.jitter ?? 0.25,
      livenessTimeoutMs: options.livenessTimeoutMs ?? 10_000,
      pingIntervalMs: options.pingIntervalMs ?? 15_000,
      offlineAfterAttempts: options.offlineAfterAttempts ?? 3,
      attachWindowListeners: options.attachWindowListeners ?? typeof window !== "undefined",
    };
  }

  // ------------------------------------------------------------------ lifecycle

  /** Open the connection (idempotent). */
  start(): void {
    if (this.started) return;
    this.started = true;
    if (this.opts.attachWindowListeners) this.attachWindowListeners();
    this.open();
  }

  /** Close the connection and stop reconnecting. */
  stop(): void {
    this.started = false;
    this.windowCleanup?.();
    this.windowCleanup = null;
    this.clearReconnectTimer();
    this.clearLiveness();
    this.stopPing();
    this.dropSocket();
    this.nextRetryAt = null;
    this.setStatus("offline");
  }

  /**
   * Retry right away (e.g. the "Retry now" button, the tab becoming visible, the browser coming
   * back online), keeping the backoff counter. No-op while a socket is open or still opening
   * (a stuck attempt is bounded by the liveness timeout).
   */
  reconnectNow(): void {
    if (!this.started) {
      this.start();
      return;
    }
    if (this.socket && (this.socket.readyState === OPEN || this.socket.readyState === CONNECTING)) return;
    this.clearReconnectTimer();
    this.dropSocket();
    this.open();
  }

  getSnapshot(): WsSnapshot {
    return {
      status: this.status,
      attempt: this.attempt,
      nextRetryAt: this.nextRetryAt,
      lastFrameAt: this.lastFrameAt,
      lastEventId: this.lastEventId,
      connectedAt: this.connectedAt,
      reconnects: this.reconnects,
      unauthorized: this.unauthorized,
    };
  }

  /** Seed the resume cursor (e.g. from a REST event page) — only moves forward. */
  noteEventId(id: number): void {
    if (this.lastEventId === null || id > this.lastEventId) this.lastEventId = id;
  }

  // ------------------------------------------------------------------ subscriptions

  /** Typed handler for one frame type. Returns an unsubscribe function. */
  on<T extends WsFrameType>(type: T, handler: FrameHandler<T>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as unknown as FrameHandler<WsFrameType>);
    return () => {
      set.delete(handler as unknown as FrameHandler<WsFrameType>);
    };
  }

  /** Handler for every frame. */
  onAny(handler: AnyHandler): () => void {
    this.anyHandlers.add(handler);
    return () => {
      this.anyHandlers.delete(handler);
    };
  }

  /** Status / retry changes (not called per frame). */
  onStatus(listener: (snapshot: WsSnapshot) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  /** Fired after a successful re-connection (not the first connection). */
  onReconnect(listener: () => void): () => void {
    this.reconnectListeners.add(listener);
    return () => {
      this.reconnectListeners.delete(listener);
    };
  }

  /** Ask the server for live `candle` frames of one chart. Ref-counted; returns unsubscribe. */
  subscribeChart(symbol: string, timeframe: Timeframe): () => void {
    const key = `${symbol}|${timeframe}`;
    const existing = this.chartSubs.get(key);
    if (existing) existing.count += 1;
    else {
      this.chartSubs.set(key, { symbol, timeframe, count: 1 });
      this.queueSubscriptionFlush();
    }
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const entry = this.chartSubs.get(key);
      if (!entry) return;
      entry.count -= 1;
      if (entry.count <= 0) {
        this.chartSubs.delete(key);
        this.queueSubscriptionFlush();
      }
    };
  }

  /** Current chart subscriptions (deduplicated). */
  getChartSubscriptions(): { symbol: string; timeframe: Timeframe }[] {
    return [...this.chartSubs.values()].map(({ symbol, timeframe }) => ({ symbol, timeframe }));
  }

  /** Send a client frame; returns false when not connected. */
  send(frame: WsClientFrame): boolean {
    if (!this.socket || this.socket.readyState !== OPEN) return false;
    try {
      this.socket.send(JSON.stringify(frame));
      return true;
    } catch {
      return false;
    }
  }

  // ------------------------------------------------------------------ internals

  private open(): void {
    if (!this.started) return;
    this.clearReconnectTimer();
    this.nextRetryAt = null;
    this.setStatus(this.failureStatus());

    let socket: WebSocketLike;
    try {
      const url = typeof this.opts.url === "function" ? this.opts.url() : this.opts.url;
      socket = this.opts.createSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.onopen = () => this.handleOpen(socket);
    socket.onmessage = (event) => this.handleMessage(socket, event);
    socket.onclose = (event) => this.handleClose(socket, event?.code);
    socket.onerror = () => {
      /* a close event always follows */
    };
    // Also bounds how long a connection may stay in CONNECTING.
    this.armLiveness();
  }

  private handleOpen(socket: WebSocketLike): void {
    if (socket !== this.socket) return;
    const isReconnect = this.everConnected;
    this.everConnected = true;
    this.unauthorized = false;
    this.attempt = 0;
    this.nextRetryAt = null;
    this.connectedAt = this.opts.now();
    this.armLiveness();
    this.startPing();
    if (isReconnect && this.lastEventId !== null) {
      this.send({ type: "resume", last_event_id: this.lastEventId });
    }
    if (this.chartSubs.size > 0) this.flushSubscriptions();
    this.setStatus("live", true);
    if (isReconnect) {
      this.reconnects += 1;
      for (const listener of [...this.reconnectListeners]) {
        try {
          listener();
        } catch (error) {
          console.error("[ws] reconnect listener failed", error);
        }
      }
    }
  }

  private handleMessage(socket: WebSocketLike, event: MessageEvent): void {
    if (socket !== this.socket) return;
    this.lastFrameAt = this.opts.now();
    this.armLiveness();

    let frame: WsServerMessage;
    try {
      frame = JSON.parse(typeof event.data === "string" ? event.data : String(event.data)) as WsServerMessage;
    } catch {
      return;
    }
    if (!frame || typeof frame !== "object" || typeof frame.type !== "string") return;

    if (frame.type === "hello") {
      // First contact sets the resume cursor; a lower server id means the database was reset.
      const serverLast = frame.data.last_event_id;
      if (this.lastEventId === null || serverLast < this.lastEventId) this.lastEventId = serverLast;
    } else if (frame.type === "event" && typeof frame.data?.id === "number") {
      this.noteEventId(frame.data.id);
    }

    const set = this.handlers.get(frame.type);
    if (set) {
      for (const handler of [...set]) {
        try {
          handler(frame.data, frame);
        } catch (error) {
          console.error(`[ws] handler for "${frame.type}" failed`, error);
        }
      }
    }
    for (const handler of [...this.anyHandlers]) {
      try {
        handler(frame);
      } catch (error) {
        console.error("[ws] frame handler failed", error);
      }
    }
  }

  private handleClose(socket: WebSocketLike, code?: number): void {
    if (socket !== this.socket) return;
    this.socket = null;
    this.stopPing();
    this.clearLiveness();
    if (!this.started) {
      this.setStatus("offline");
      return;
    }
    if (code === WS_UNAUTHORIZED_CODE) {
      this.unauthorized = true;
      // No point hammering the server with a bad token: retry at the slowest pace.
      this.attempt = Math.max(this.attempt, this.opts.offlineAfterAttempts, 10);
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.started) return;
    this.clearReconnectTimer();
    const delay = backoffDelay(this.attempt, {
      minMs: this.opts.minBackoffMs,
      maxMs: this.opts.maxBackoffMs,
      jitter: this.opts.jitter,
      random: this.opts.random,
    });
    this.attempt += 1;
    this.nextRetryAt = this.opts.now() + delay;
    this.setStatus(this.failureStatus(), true);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  /** Status while not connected, derived from history and failure count. */
  private failureStatus(): ConnectionStatus {
    if (this.unauthorized || this.attempt >= this.opts.offlineAfterAttempts) return "offline";
    return this.everConnected ? "reconnecting" : "connecting";
  }

  /** Liveness watchdog: no frame (or no open) within the timeout → replace the socket. */
  private armLiveness(): void {
    this.clearLiveness();
    this.livenessTimer = setTimeout(() => {
      this.livenessTimer = null;
      if (!this.socket) return;
      this.dropSocket();
      this.stopPing();
      this.scheduleReconnect();
    }, this.opts.livenessTimeoutMs);
  }

  private clearLiveness(): void {
    if (this.livenessTimer !== null) clearTimeout(this.livenessTimer);
    this.livenessTimer = null;
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => this.send({ type: "ping" }), this.opts.pingIntervalMs);
  }

  private stopPing(): void {
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  /** Detach and close the current socket without triggering the close handler. */
  private dropSocket(): void {
    const socket = this.socket;
    if (!socket) return;
    this.socket = null;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    if (socket.readyState === OPEN || socket.readyState === CONNECTING) {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
    }
  }

  private queueSubscriptionFlush(): void {
    if (this.subscriptionFlushQueued) return;
    this.subscriptionFlushQueued = true;
    queueMicrotask(() => {
      this.subscriptionFlushQueued = false;
      this.flushSubscriptions();
    });
  }

  private flushSubscriptions(): void {
    this.send({ type: "subscribe_chart", charts: this.getChartSubscriptions() });
  }

  private setStatus(status: ConnectionStatus, force = false): void {
    if (!force && status === this.status) return;
    this.status = status;
    const snapshot = this.getSnapshot();
    for (const listener of [...this.statusListeners]) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("[ws] status listener failed", error);
      }
    }
  }

  private attachWindowListeners(): void {
    if (typeof window === "undefined") return;
    const retry = () => {
      if (this.status !== "live") this.reconnectNow();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") retry();
    };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", onVisibility);
    this.windowCleanup = () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }
}

/** The app-wide connection. Started once by <LiveDataProvider>. */
export const wsManager = new WsManager();
