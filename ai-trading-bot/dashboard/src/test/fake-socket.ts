/**
 * Test double for the browser WebSocket, driven by the test: `open()`, `receive(frame)`,
 * `serverClose(code)`. Every instance is recorded in `FakeSocket.instances` (newest last).
 */
import type { WebSocketFactory } from "@/lib/ws";

type Handler<E> = ((event: E) => unknown) | null;

export class FakeSocket {
  static instances: FakeSocket[] = [];

  static reset(): void {
    FakeSocket.instances = [];
  }

  static latest(): FakeSocket {
    const socket = FakeSocket.instances[FakeSocket.instances.length - 1];
    if (!socket) throw new Error("no socket created yet");
    return socket;
  }

  static factory: WebSocketFactory = (url) => new FakeSocket(url);

  readonly url: string;
  readyState: 0 | 1 | 2 | 3 = 0; // CONNECTING
  sent: string[] = [];
  closedByClient = false;
  onopen: Handler<Event> = null;
  onmessage: Handler<MessageEvent> = null;
  onclose: Handler<CloseEvent> = null;
  onerror: Handler<Event> = null;

  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }

  send(data: string): void {
    if (this.readyState !== 1) throw new Error("socket not open");
    this.sent.push(data);
  }

  close(): void {
    this.closedByClient = true;
    this.readyState = 3;
  }

  // ---- driven by the test

  open(): void {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  receive(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent);
  }

  serverClose(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code } as CloseEvent);
  }

  /** Client frames sent so far, parsed. */
  frames(): { type: string; [key: string]: unknown }[] {
    return this.sent.map((s) => JSON.parse(s) as { type: string });
  }
}
