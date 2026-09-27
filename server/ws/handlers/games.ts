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

function broadcastGameState(
  participantIds: string[],
  sessionId: string,
  gameType: GameType,
  state: Record<string, unknown>,
) {
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
}
