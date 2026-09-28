import { prisma } from "@/lib/db/client";
import { awardXp, unlockAchievement } from "@/lib/gamification/xp";
import { GAME_ENGINES, advanceRoundIfNeeded, roundJustEnded } from "./registry";
import type { GameType } from "./types";

export async function getGameByType(type: GameType) {
  return prisma.game.findUnique({ where: { type } });
}

export async function createWaitingSession(gameType: GameType, opts: { matchId?: string; roomId?: string }) {
  const game = await getGameByType(gameType);
  if (!game) throw new Error(`Unknown game type: ${gameType}`);
  return prisma.gameSession.create({
    data: {
      gameId: game.id,
      matchId: opts.matchId,
      roomId: opts.roomId,
      status: "WAITING",
      state: {},
    },
  });
}

export async function startSession(sessionId: string, gameType: GameType, participantIds: string[]) {
  const engine = GAME_ENGINES[gameType];
  const state = engine.createInitialState(participantIds);

  await prisma.$transaction([
    prisma.gameSession.update({
      where: { id: sessionId },
      data: { status: "IN_PROGRESS", state: state as object },
    }),
    ...participantIds.map((userId) =>
      prisma.gameParticipant.upsert({
        where: { gameSessionId_userId: { gameSessionId: sessionId, userId } },
        update: {},
        create: { gameSessionId: sessionId, userId },
      }),
    ),
  ]);

  return state;
}

interface ApplyResult {
  state: Record<string, unknown>;
  participantIds: string[];
  gameType: GameType;
  roundEnded: boolean;
  gameComplete: boolean;
}

export async function applyGameAction(
  sessionId: string,
  userId: string,
  action: Record<string, unknown>,
): Promise<ApplyResult | null> {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { game: true },
  });
  if (!session || session.status !== "IN_PROGRESS") return null;

  const gameType = session.game.type as GameType;
  const engine = GAME_ENGINES[gameType];
  const currentState = session.state as Record<string, unknown> & { participantIds: string[] };

  const { state: nextState, complete } = engine.applyAction(currentState, userId, action);
  const roundEnded = roundJustEnded(gameType, nextState);

  await prisma.gameSession.update({
    where: { id: sessionId },
    data: {
      state: nextState as object,
      status: complete ? "COMPLETED" : "IN_PROGRESS",
      endedAt: complete ? new Date() : undefined,
    },
  });

  if (complete) {
    const scores = (nextState as { scores?: Record<string, number> }).scores;
    if (scores) {
      await Promise.all(
        Object.entries(scores).map(([pid, score]) =>
          prisma.gameParticipant
            .update({
              where: { gameSessionId_userId: { gameSessionId: sessionId, userId: pid } },
              data: { score },
            })
            .catch(() => undefined),
        ),
      );
    }
    await Promise.all(
      currentState.participantIds.map(async (pid) => {
        await awardXp(pid, 15).catch(() => undefined);
        await unlockAchievement(pid, "first_game").catch(() => undefined);
      }),
    );
  }

  return {
    state: nextState,
    participantIds: currentState.participantIds,
    gameType,
    roundEnded,
    gameComplete: complete,
  };
}

/** Called ~2.5s after a round reveal to move to the next question/word. */
export async function advanceSessionRound(sessionId: string) {
  const session = await prisma.gameSession.findUnique({ where: { id: sessionId }, include: { game: true } });
  if (!session || session.status !== "IN_PROGRESS") return null;

  const gameType = session.game.type as GameType;
  const nextState = advanceRoundIfNeeded(gameType, session.state as Record<string, unknown>);

  await prisma.gameSession.update({
    where: { id: sessionId },
    data: { state: nextState as object },
  });

  return { state: nextState, gameType };
}

export function publicStateFor(gameType: GameType, state: Record<string, unknown>, userId: string) {
  return GAME_ENGINES[gameType].toPublicState(state, userId);
}
