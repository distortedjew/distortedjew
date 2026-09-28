import type { WebSocket } from "ws";
import type { ServerMessage } from "@/types/ws";
import { redis } from "@/lib/redis/client";
import { mmKeys } from "@/lib/matchmaking/keys";

export interface ConnectionMeta {
  userId: string;
  username: string;
  isGuest: boolean;
  role: "USER" | "MODERATOR" | "ADMIN";
}

const socketsByUser = new Map<string, Set<WebSocket>>();
const metaBySocket = new WeakMap<WebSocket, ConnectionMeta>();

export function registerConnection(ws: WebSocket, meta: ConnectionMeta) {
  metaBySocket.set(ws, meta);
  let set = socketsByUser.get(meta.userId);
  if (!set) {
    set = new Set();
    socketsByUser.set(meta.userId, set);
  }
  set.add(ws);
  redis.sadd(mmKeys.presence(), meta.userId).catch(() => undefined);
}

export function unregisterConnection(ws: WebSocket) {
  const meta = metaBySocket.get(ws);
  if (!meta) return;
  const set = socketsByUser.get(meta.userId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) {
      socketsByUser.delete(meta.userId);
      redis.srem(mmKeys.presence(), meta.userId).catch(() => undefined);
    }
  }
}

export function getMeta(ws: WebSocket): ConnectionMeta | undefined {
  return metaBySocket.get(ws);
}

export function isOnline(userId: string): boolean {
  return socketsByUser.has(userId);
}

export function sendTo(userId: string, message: ServerMessage) {
  const set = socketsByUser.get(userId);
  if (!set) return false;
  const payload = JSON.stringify(message);
  for (const socket of set) {
    if (socket.readyState === socket.OPEN) {
      socket.send(payload);
    }
  }
  return true;
}

export function broadcastTo(userIds: string[], message: ServerMessage) {
  for (const id of userIds) sendTo(id, message);
}

export function onlineCount(): number {
  return socketsByUser.size;
}
