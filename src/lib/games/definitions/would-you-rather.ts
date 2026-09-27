import type { GameEngine, GameActionResult } from "../types";

const PROMPTS: Array<{ optionA: string; optionB: string }> = [
  { optionA: "Have the ability to fly", optionB: "Have the ability to become invisible" },
  { optionA: "Always be 10 minutes late", optionB: "Always be 20 minutes early" },
  { optionA: "Explore space", optionB: "Explore the deep ocean" },
  { optionA: "Only eat pizza forever", optionB: "Never eat pizza again" },
  { optionA: "Have unlimited books", optionB: "Have unlimited movies" },
  { optionA: "Live without music", optionB: "Live without television" },
  { optionA: "Be able to speak every language", optionB: "Be able to talk to animals" },
  { optionA: "Time travel to the past", optionB: "Time travel to the future" },
];

export interface WouldYouRatherState {
  round: number;
  totalRounds: number;
  prompt: { optionA: string; optionB: string };
  votes: Record<string, "A" | "B">;
  history: Array<{ prompt: { optionA: string; optionB: string }; votes: Record<string, "A" | "B"> }>;
  participantIds: string[];
}

function randomPrompt(exclude?: { optionA: string; optionB: string }) {
  const pool = exclude ? PROMPTS.filter((p) => p.optionA !== exclude.optionA) : PROMPTS;
  return pool[Math.floor(Math.random() * pool.length)];
}

export const wouldYouRatherEngine: GameEngine<WouldYouRatherState> = {
  type: "WOULD_YOU_RATHER",
  minPlayers: 2,
  maxPlayers: 8,

  createInitialState(participantIds) {
    return {
      round: 1,
      totalRounds: 5,
      prompt: randomPrompt(),
      votes: {},
      history: [],
      participantIds,
    };
  },

  applyAction(state, userId, action): GameActionResult<WouldYouRatherState> {
    if (!state.participantIds.includes(userId)) return { state, complete: false };
    const choice = action.choice;
    if (choice !== "A" && choice !== "B") return { state, complete: false };

    const votes: Record<string, "A" | "B"> = { ...state.votes, [userId]: choice };
    const allVoted = state.participantIds.every((id) => votes[id]);

    if (!allVoted) {
      return { state: { ...state, votes }, complete: false };
    }

    const history = [...state.history, { prompt: state.prompt, votes }];
    const isLastRound = state.round >= state.totalRounds;

    if (isLastRound) {
      return {
        state: { ...state, votes, history },
        complete: true,
      };
    }

    return {
      state: {
        ...state,
        round: state.round + 1,
        prompt: randomPrompt(state.prompt),
        votes: {},
        history,
      },
      complete: false,
    };
  },

  toPublicState(state) {
    return { ...state };
  },
};
