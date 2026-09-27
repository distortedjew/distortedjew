"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ClientMessage, ServerMessage } from "@/types/ws";

type Listener = (msg: ServerMessage) => void;

export type SocketStatus = "connecting" | "open" | "closed";

interface SocketContextValue {
  status: SocketStatus;
  send: (msg: ClientMessage) => void;
  subscribe: (listener: Listener) => () => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

const RECONNECT_DELAY_MS = 2000;

export function SocketProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const socketRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Set<Listener>>(new Set());
  const queueRef = useRef<ClientMessage[]>([]);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    if (!enabled) return;
    mountedRef.current = true;

    function connect() {
      if (!mountedRef.current) return;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
      socketRef.current = socket;
      setStatus("connecting");

      socket.onopen = () => {
        setStatus("open");
        for (const msg of queueRef.current) socket.send(JSON.stringify(msg));
        queueRef.current = [];
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as ServerMessage;
          listenersRef.current.forEach((listener) => listener(data));
        } catch {
          // ignore malformed frames
        }
      };

      socket.onclose = () => {
        setStatus("closed");
        if (mountedRef.current) {
          reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };

      socket.onerror = () => {
        socket.close();
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [enabled]);

  const send = useCallback((msg: ClientMessage) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    } else {
      queueRef.current.push(msg);
    }
  }, []);

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  return (
    <SocketContext.Provider value={{ status, send, subscribe }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used within a SocketProvider");
  return ctx;
}

/** Subscribes to server messages matching one or more `type`s. */
export function useSocketMessage<T extends ServerMessage["type"]>(
  types: T | T[],
  handler: (msg: Extract<ServerMessage, { type: T }>) => void,
) {
  const { subscribe } = useSocket();
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const typeList = Array.isArray(types) ? types : [types];
    return subscribe((msg) => {
      if ((typeList as string[]).includes(msg.type)) {
        handlerRef.current(msg as Extract<ServerMessage, { type: T }>);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, JSON.stringify(types)]);
}
