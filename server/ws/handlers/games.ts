import { prisma } from "@/lib/db/client";
import { getMatchState } from "@/lib/matchmaking/engine";
import { getRoomMemberIds } from "@/lib/rooms/service";
import {
  createWaitingSession,
  startSession,
  applyGameAction,
  advanceSessionRound,
  publicStateFor,
} from "@/lib/games/session-service";
import type { GameType } from "@/lib/games/types";
import { sendTo } from "../registry";
import type { ConnectionMeta } from "../registry";
import type { ClientMessage } from "@/types/ws";

const ROUND_REVEAL_DELAY_MS = 2500;

// Lightweight cache so high-frequency draw strokes don't hit Postgres per
// event. Populated whenever a session starts, cleared once it completes.
const sessionParticipantsCache = new Map<string, string[]>();

function broadcastGameState(
  participantIds: string[],
  sessionId: string,
  gameType: GameType,
  state: Record<string, unknown>,
) {
  sessionParticipantsCache.set(sessionId, participantIds);
  for (const userId of participantIds) {
    sendTo(userId, {
      type: "game:state",
      sessionId,
      state: publicStateFor(gameType, state, userId),
    });
  }
}

export async function handleGameInvite(
  meta: ConnectionMeta,
  msg: Extract<ClientMessage, { type: "game:invite" }>,
) {
  const gameType = msg.gameType as GameType;

  if (msg.matchId) {
    const state = await getMatchState(msg.matchId);
    if (!state || (state.userAId !== meta.userId && state.userBId !== meta.userId)) return;
    const peerId = state.userAId === meta.userId ? state.userBId : state.userAId;

    const session = await createWaitingSession(gameType, { matchId: msg.matchId });
    sendTo(peerId, { type: "game:invited", sessionId: session.id, gameType, fromUserId: meta.userId });
    return;
  }

  if (msg.roomId) {
    const memberIds = await getRoomMemberIds(msg.roomId);
    if (!memberIds.includes(meta.userId) || memberIds.length < 2) return;

    const session = await createWaitingSession(gameType, { roomId: msg.roomId });
    const state = await startSession(session.id, gameType, memberIds);
    broadcastGameState(memberIds, session.id, gameType, state as Record<string, unknown>);
  }
}

export async function handleGameAccept(
  meta: ConnectionMeta,
  msg: Extract<ClientMessage, { type: "game:accept" }>,
) {
  const session = await prisma.gameSession.findUnique({
    where: { id: msg.sessionId },
    include: { game: true },
  });
  if (!session || session.status !== "WAITING" || !session.matchId) return;

  const matchState = await getMatchState(session.matchId);
  if (!matchState) return;
  if (matchState.userAId !== meta.userId && matchState.userBId !== meta.userId) return;

  const participantIds = [matchState.userAId, matchState.userBId];
  const gameType = session.game.type as GameType;
  const state = await startSession(session.id, gameType, participantIds);
  broadcastGameState(participantIds, session.id, gameType, state as Record<string, unknown>);
}

export async function handleGameAction(
  meta: ConnectionMeta,
  msg: Extract<ClientMessage, { type: "game:action" }>,
) {
  const result = await applyGameAction(msg.sessionId, meta.userId, msg.action);
  if (!result) return;

  broadcastGameState(result.participantIds, msg.sessionId, result.gameType, result.state);

  if (result.roundEnded && !result.gameComplete) {
    setTimeout(async () => {
      const advanced = await advanceSessionRound(msg.sessionId);
      if (advanced) {
        broadcastGameState(result.participantIds, msg.sessionId, advanced.gameType, advanced.state as Record<string, unknown>);
      }
    }, ROUND_REVEAL_DELAY_MS);
  }

  if (result.gameComplete) {
    sessionParticipantsCache.delete(msg.sessionId);
  }
}

export async function handleGameDraw(
  meta: ConnectionMeta,
  msg: Extract<ClientMessage, { type: "game:draw" }>,
) {
  let participantIds = sessionParticipantsCache.get(msg.sessionId);
  if (!participantIds) {
    const session = await prisma.gameSession.findUnique({ where: { id: msg.sessionId } });
    const state = session?.state as { participantIds?: string[] } | undefined;
    participantIds = state?.participantIds;
    if (participantIds) sessionParticipantsCache.set(msg.sessionId, participantIds);
  }
  if (!participantIds || !participantIds.includes(meta.userId)) return;

  for (const userId of participantIds) {
    if (userId === meta.userId) continue;
    sendTo(userId, { type: "game:draw", sessionId: msg.sessionId, stroke: msg.stroke });
  }
}
