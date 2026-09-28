import type { GameEngine, GameType } from "./types";
import { wouldYouRatherEngine } from "./definitions/would-you-rather";
import { triviaEngine, advanceTriviaRound } from "./definitions/trivia";
import {
  guessTheWordEngine,
  drawingGuessEngine,
  advanceGuessRound,
} from "./definitions/guess-the-word";

// Each engine has its own concrete State type; the registry necessarily
// type-erases them (state round-trips through Postgres JSON anyway, so
// there is no real type safety to preserve across this boundary).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GAME_ENGINES: Record<GameType, GameEngine<any>> = {
  WOULD_YOU_RATHER: wouldYouRatherEngine,
  TRIVIA: triviaEngine,
  GUESS_THE_WORD: guessTheWordEngine,
  DRAWING_GUESS: drawingGuessEngine,
};

export const GAME_META: Record<GameType, { name: string; description: string; icon: string }> = {
  WOULD_YOU_RATHER: {
    name: "Would You Rather",
    description: "Pick a side on playful dilemmas and see how you match.",
    icon: "split",
  },
  TRIVIA: {
    name: "Trivia",
    description: "Answer quick trivia questions and race for points.",
    icon: "brain",
  },
  GUESS_THE_WORD: {
    name: "Guess the Word",
    description: "Reveal hints and race to guess the hidden word first.",
    icon: "puzzle",
  },
  DRAWING_GUESS: {
    name: "Draw & Guess",
    description: "One player draws, everyone else races to guess it.",
    icon: "pencil",
  },
};

/**
 * Rounds that end in a "reveal, then advance" beat (trivia, guess-the-word)
 * need a follow-up transform after applyAction reports completion of a
 * round-but-not-the-game. This keeps that transform out of the generic
 * GameEngine interface since only some games need it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function advanceRoundIfNeeded(type: GameType, state: any): any {
  if (type === "TRIVIA") return advanceTriviaRound(state);
  if (type === "GUESS_THE_WORD" || type === "DRAWING_GUESS") return advanceGuessRound(state);
  return state;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function roundJustEnded(type: GameType, state: any): boolean {
  if (type === "TRIVIA") return state.revealed === true;
  if (type === "GUESS_THE_WORD" || type === "DRAWING_GUESS") return state.solvedBy != null;
  return false;
}
