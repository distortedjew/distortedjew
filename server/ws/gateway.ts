import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { authenticateUpgrade } from "./auth";
import { registerConnection, unregisterConnection, getMeta, sendTo, broadcastTo, closeUserConnections } from "./registry";
import { redisSub } from "@/lib/redis/client";
import { USER_EVENTS_CHANNEL, type UserEvent } from "@/lib/realtime/user-events";
import { getActiveMatchId, endMatch, leaveQueue } from "@/lib/matchmaking/engine";
import { getRoomIdsForUser, getRoomMemberIds, getRoomParticipantViews, leaveRoom } from "@/lib/rooms/service";
import { getRandomIcebreaker } from "@/lib/icebreakers";
import { rateLimit } from "@/lib/redis/rate-limit";
import {
  handleQueueJoin,
  handleQueueLeave,
} from "./handlers/matchmaking";
import {
  handleChatMessage,
  handleChatTyping,
  handleChatReaction,
  handleChatNext,
  handleChatLeave,
  handleConnectRequest,
  handleReport,
  handleBlock,
} from "./handlers/chat";
import {
  handleWebrtcOffer,
  handleWebrtcAnswer,
  handleWebrtcIce,
  handleWebrtcMediaState,
} from "./handlers/webrtc";
import {
  handleRoomJoin,
  handleRoomLeave,
  handleRoomMessage,
  handleRoomWebrtcOffer,
  handleRoomWebrtcAnswer,
  handleRoomWebrtcIce,
  handleRoomMute,
  handleRoomRemove,
} from "./handlers/rooms";
import {
  handleGameInvite,
  handleGameAccept,
  handleGameAction,
  handleGameDraw,
} from "./handlers/games";
import type { ClientMessage } from "@/types/ws";

const MAX_CONNECTIONS_PER_USER = 5;
const connectionCountByUser = new Map<string, number>();

// Largest legitimate frame is an SDP offer (a few KB). The ws default is
// 100 MiB, which let any signed-in guest make the server buffer and parse
// huge messages.
const MAX_PAYLOAD_BYTES = 64 * 1024;

function listenForUserEvents() {
  redisSub.subscribe(USER_EVENTS_CHANNEL).catch((err) => {
    console.error("[ws] failed to subscribe to user events", err);
  });
  redisSub.on("message", (channel, raw) => {
    if (channel !== USER_EVENTS_CHANNEL) return;
    let event: UserEvent;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }
    if (event.type === "disconnect" && typeof event.userId === "string") {
      closeUserConnections(event.userId, event.reason);
    }
  });
}

export function createGateway() {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });
  listenForUserEvents();

  wss.on("connection", (ws: WebSocket, meta: Awaited<ReturnType<typeof authenticateUpgrade>>) => {
    if (!meta) {
      ws.close(4001, "unauthenticated");
      return;
    }

    registerConnection(ws, meta);
    connectionCountByUser.set(meta.userId, (connectionCountByUser.get(meta.userId) ?? 0) + 1);

    ws.on("message", async (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      // Draw strokes are high-frequency by nature (pointer move events) and
      // get their own generous limiter instead of the general message cap.
      const rateLimitKey = msg.type === "game:draw" ? `ws:draw:${meta.userId}` : `ws:msg:${meta.userId}`;
      const rateLimitMax = msg.type === "game:draw" ? 200 : 60;
      const limit = await rateLimit(rateLimitKey, rateLimitMax, 10);
      if (!limit.allowed) return;

      const connMeta = getMeta(ws);
      if (!connMeta) return;

      try {
        switch (msg.type) {
          case "queue:join":
            await handleQueueJoin(connMeta, msg);
            break;
          case "queue:leave":
            await handleQueueLeave(connMeta);
            break;
          case "chat:message":
            await handleChatMessage(connMeta, msg);
            break;
          case "chat:typing":
            await handleChatTyping(connMeta, msg);
            break;
          case "chat:reaction":
            await handleChatReaction(connMeta, msg);
            break;
          case "chat:next":
            await handleChatNext(connMeta, msg);
            break;
          case "chat:leave":
            await handleChatLeave(connMeta, msg);
            break;
          case "chat:connect_request":
            await handleConnectRequest(connMeta, msg);
            break;
          case "chat:report":
            await handleReport(connMeta, msg);
            break;
          case "chat:block":
            await handleBlock(connMeta, msg);
            break;
          case "webrtc:offer":
            await handleWebrtcOffer(connMeta, msg);
            break;
          case "webrtc:answer":
            await handleWebrtcAnswer(connMeta, msg);
            break;
          case "webrtc:ice":
            await handleWebrtcIce(connMeta, msg);
            break;
          case "webrtc:media_state":
            await handleWebrtcMediaState(connMeta, msg);
            break;
          case "icebreaker:request":
            sendTo(connMeta.userId, {
              type: "icebreaker:prompt",
              matchId: msg.matchId,
              prompt: getRandomIcebreaker(),
            });
            break;
          case "room:join":
            await handleRoomJoin(connMeta, msg);
            break;
          case "room:leave":
            await handleRoomLeave(connMeta, msg);
            break;
          case "room:message":
            await handleRoomMessage(connMeta, msg);
            break;
          case "room:webrtc_offer":
            await handleRoomWebrtcOffer(connMeta, msg);
            break;
          case "room:webrtc_answer":
            await handleRoomWebrtcAnswer(connMeta, msg);
            break;
          case "room:webrtc_ice":
            await handleRoomWebrtcIce(connMeta, msg);
            break;
          case "room:mute":
            await handleRoomMute(connMeta, msg);
            break;
          case "room:remove":
            await handleRoomRemove(connMeta, msg);
            break;
          case "game:invite":
            await handleGameInvite(connMeta, msg);
            break;
          case "game:accept":
            await handleGameAccept(connMeta, msg);
            break;
          case "game:action":
            await handleGameAction(connMeta, msg);
            break;
          case "game:draw":
            await handleGameDraw(connMeta, msg);
            break;
          case "presence:ping":
            sendTo(connMeta.userId, { type: "presence:pong" });
            break;
          default:
            break;
        }
      } catch (err) {
        console.error("[ws] handler error", msg.type, err);
        sendTo(connMeta.userId, {
          type: "error",
          code: "INTERNAL",
          message: "Something went wrong. Please try again.",
        });
      }
    });

    ws.on("close", async () => {
      unregisterConnection(ws);
      const remaining = (connectionCountByUser.get(meta.userId) ?? 1) - 1;
      if (remaining <= 0) {
        connectionCountByUser.delete(meta.userId);
        await leaveQueue(meta.userId).catch(() => undefined);
        const activeMatchId = await getActiveMatchId(meta.userId).catch(() => null);
        if (activeMatchId) {
          const state = await endMatch(activeMatchId, meta.userId, "DISCONNECT").catch(
            () => null,
          );
          if (state) {
            const peerId = state.userAId === meta.userId ? state.userBId : state.userAId;
            sendTo(peerId, {
              type: "chat:partner_left",
              matchId: activeMatchId,
              reason: "disconnect",
            });
          }
        }
        const roomIds = await getRoomIdsForUser(meta.userId).catch(() => []);
        for (const roomId of roomIds) {
          const others = (await getRoomMemberIds(roomId)).filter((id) => id !== meta.userId);
          await leaveRoom(roomId, meta.userId).catch(() => undefined);
          broadcastTo(others, { type: "room:participant_left", roomId, userId: meta.userId });
          if (others.length > 0) {
            const refreshed = await getRoomParticipantViews(roomId).catch(() => null);
            if (refreshed) broadcastTo(others, { type: "room:participants", roomId, participants: refreshed });
          }
        }
      } else {
        connectionCountByUser.set(meta.userId, remaining);
      }
    });

    ws.on("error", (err) => {
      console.error("[ws] socket error for", meta.userId, err.message);
    });
  });

  return {
    async handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
      const meta = await authenticateUpgrade(req);
      const perUserCount = meta ? (connectionCountByUser.get(meta.userId) ?? 0) : 0;

      if (!meta) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      if (perUserCount >= MAX_CONNECTIONS_PER_USER) {
        socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, meta);
      });
    },
  };
}
