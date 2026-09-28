import type { GameEngine, GameActionResult } from "../types";

const QUESTIONS: Array<{ question: string; options: string[]; correctIndex: number }> = [
  { question: "What planet is known as the Red Planet?", options: ["Venus", "Mars", "Jupiter", "Saturn"], correctIndex: 1 },
  { question: "What is the largest ocean on Earth?", options: ["Atlantic", "Indian", "Arctic", "Pacific"], correctIndex: 3 },
  { question: "How many strings does a standard guitar have?", options: ["4", "5", "6", "7"], correctIndex: 2 },
  { question: "Which language runs in a web browser?", options: ["Java", "C", "Python", "JavaScript"], correctIndex: 3 },
  { question: "What is the smallest prime number?", options: ["0", "1", "2", "3"], correctIndex: 2 },
  { question: "Which country hosted the 2016 Summer Olympics?", options: ["China", "UK", "Brazil", "Japan"], correctIndex: 2 },
  { question: "What gas do plants primarily absorb?", options: ["Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen"], correctIndex: 2 },
  { question: "How many continents are there?", options: ["5", "6", "7", "8"], correctIndex: 2 },
];

export interface TriviaState {
  round: number;
  totalRounds: number;
  question: { question: string; options: string[]; correctIndex: number };
  answers: Record<string, number>;
  scores: Record<string, number>;
  revealed: boolean;
  participantIds: string[];
}

function randomQuestion(excludeQuestion?: string) {
  const pool = excludeQuestion ? QUESTIONS.filter((q) => q.question !== excludeQuestion) : QUESTIONS;
  return pool[Math.floor(Math.random() * pool.length)];
}

export const triviaEngine: GameEngine<TriviaState> = {
  type: "TRIVIA",
  minPlayers: 2,
  maxPlayers: 8,

  createInitialState(participantIds) {
    const scores: Record<string, number> = {};
    participantIds.forEach((id) => (scores[id] = 0));
    return {
      round: 1,
      totalRounds: 5,
      question: randomQuestion(),
      answers: {},
      scores,
      revealed: false,
      participantIds,
    };
  },

  applyAction(state, userId, action): GameActionResult<TriviaState> {
    if (!state.participantIds.includes(userId) || state.revealed) return { state, complete: false };
    const optionIndex = action.optionIndex;
    if (typeof optionIndex !== "number") return { state, complete: false };

    const answers = { ...state.answers, [userId]: optionIndex };
    const allAnswered = state.participantIds.every((id) => answers[id] !== undefined);

    if (!allAnswered) {
      return { state: { ...state, answers }, complete: false };
    }

    const scores = { ...state.scores };
    for (const id of state.participantIds) {
      if (answers[id] === state.question.correctIndex) {
        scores[id] = (scores[id] ?? 0) + 10;
      }
    }

    const revealedState = { ...state, answers, scores, revealed: true };
    const isLastRound = state.round >= state.totalRounds;

    if (isLastRound) {
      return { state: revealedState, complete: true };
    }

    // Caller (game handler) advances to the next round on a short delay by
    // calling applyAction again with a synthetic "advance" — kept simple
    // here: the handler schedules the transition.
    return { state: revealedState, complete: false };
  },

  toPublicState(state) {
    if (state.revealed) return { ...state };
    const safeQuestion = { question: state.question.question, options: state.question.options };
    return { ...state, question: safeQuestion };
  },
};

export function advanceTriviaRound(state: TriviaState): TriviaState {
  return {
    ...state,
    round: state.round + 1,
    question: randomQuestion(state.question.question),
    answers: {},
    revealed: false,
  };
}
