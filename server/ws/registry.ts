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

/**
 * Closes all of a user's sockets (code 4003) after telling them why. The
 * normal close handler then ends their match and removes them from rooms.
 */
export function closeUserConnections(userId: string, reason: string) {
  const set = socketsByUser.get(userId);
  if (!set) return 0;
  const notice = JSON.stringify({ type: "error", code: "ACCOUNT_RESTRICTED", message: reason });
  for (const socket of [...set]) {
    if (socket.readyState === socket.OPEN) socket.send(notice);
    socket.close(4003, "account restricted");
  }
  return set.size;
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
