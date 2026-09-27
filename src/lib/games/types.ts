export type GameType = "WOULD_YOU_RATHER" | "TRIVIA" | "GUESS_THE_WORD" | "DRAWING_GUESS";

export interface GameActionResult<State> {
  state: State;
  complete: boolean;
}

export interface GameEngine<State = Record<string, unknown>> {
  type: GameType;
  minPlayers: number;
  maxPlayers: number;
  createInitialState(participantIds: string[]): State;
  applyAction(
    state: State,
    userId: string,
    action: Record<string, unknown>,
  ): GameActionResult<State>;
  /** Strips server-only secrets (correct answers, hidden words) before broadcast. */
  toPublicState(state: State, forUserId: string): Record<string, unknown>;
}
