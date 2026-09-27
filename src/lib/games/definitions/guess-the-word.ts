import type { GameEngine, GameActionResult } from "../types";

const WORDS = [
  "GALAXY", "PENGUIN", "VOLCANO", "GUITAR", "PYRAMID", "OCTOPUS",
  "COMPASS", "LANTERN", "GLACIER", "MARATHON", "CACTUS", "TELESCOPE",
];

export interface GuessTheWordState {
  round: number;
  totalRounds: number;
  word: string;
  revealedHints: number;
  guesses: Array<{ userId: string; guess: string; correct: boolean }>;
  solvedBy: string | null;
  scores: Record<string, number>;
  drawerId?: string;
  participantIds: string[];
}

function randomWord(exclude?: string) {
  const pool = exclude ? WORDS.filter((w) => w !== exclude) : WORDS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function maskWord(word: string, revealedHints: number): string {
  return word
    .split("")
    .map((ch, i) => (i < revealedHints ? ch : "_"))
    .join(" ");
}

function buildEngine(type: "GUESS_THE_WORD" | "DRAWING_GUESS"): GameEngine<GuessTheWordState> {
  return {
    type,
    minPlayers: 2,
    maxPlayers: 8,

    createInitialState(participantIds) {
      const scores: Record<string, number> = {};
      participantIds.forEach((id) => (scores[id] = 0));
      return {
        round: 1,
        totalRounds: 4,
        word: randomWord(),
        revealedHints: 1,
        guesses: [],
        solvedBy: null,
        scores,
        drawerId: type === "DRAWING_GUESS" ? participantIds[0] : undefined,
        participantIds,
      };
    },

    applyAction(state, userId, action): GameActionResult<GuessTheWordState> {
      if (!state.participantIds.includes(userId) || state.solvedBy) {
        return { state, complete: false };
      }

      if (action.type === "hint") {
        const revealedHints = Math.min(state.word.length - 1, state.revealedHints + 1);
        return { state: { ...state, revealedHints }, complete: false };
      }

      if (type === "DRAWING_GUESS" && userId === state.drawerId) {
        // The drawer can't submit guesses for their own word.
        return { state, complete: false };
      }

      const guessText = typeof action.guess === "string" ? action.guess.trim().toUpperCase() : "";
      if (!guessText) return { state, complete: false };

      const correct = guessText === state.word;
      const guesses = [...state.guesses, { userId, guess: guessText, correct }];

      if (!correct) {
        return { state: { ...state, guesses }, complete: false };
      }

      const scores = { ...state.scores, [userId]: (state.scores[userId] ?? 0) + 10 };
      const solvedState = { ...state, guesses, solvedBy: userId, scores };
      const isLastRound = state.round >= state.totalRounds;

      return { state: solvedState, complete: isLastRound };
    },

    toPublicState(state, forUserId) {
      const isDrawer = type === "DRAWING_GUESS" && forUserId === state.drawerId;
      const wordVisible = state.solvedBy !== null || isDrawer;
      return {
        ...state,
        word: wordVisible ? state.word : maskWord(state.word, state.revealedHints),
      };
    },
  };
}

export const guessTheWordEngine = buildEngine("GUESS_THE_WORD");
export const drawingGuessEngine = buildEngine("DRAWING_GUESS");

export function advanceGuessRound(state: GuessTheWordState): GuessTheWordState {
  const participantIds = state.participantIds;
  const nextDrawerIndex = state.drawerId
    ? (participantIds.indexOf(state.drawerId) + 1) % participantIds.length
    : 0;
  return {
    ...state,
    round: state.round + 1,
    word: randomWord(state.word),
    revealedHints: 1,
    guesses: [],
    solvedBy: null,
    drawerId: state.drawerId ? participantIds[nextDrawerIndex] : undefined,
  };
}
