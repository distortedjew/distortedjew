import { describe, expect, it } from "vitest";
import { triviaEngine, advanceTriviaRound } from "./trivia";

const PLAYERS = ["p1", "p2"];

describe("trivia game engine", () => {
  it("starts with zero scores and an unrevealed question for all participants", () => {
    const state = triviaEngine.createInitialState(PLAYERS);
    expect(state.scores).toEqual({ p1: 0, p2: 0 });
    expect(state.revealed).toBe(false);
    expect(state.round).toBe(1);
  });

  it("does not reveal until every participant has answered", () => {
    const state = triviaEngine.createInitialState(PLAYERS);
    const { state: afterOne, complete } = triviaEngine.applyAction(state, "p1", { optionIndex: 0 });
    expect(afterOne.revealed).toBe(false);
    expect(complete).toBe(false);
  });

  it("reveals and scores once all participants have answered", () => {
    let state = triviaEngine.createInitialState(PLAYERS);
    const correct = state.question.correctIndex;
    const wrong = (correct + 1) % state.question.options.length;

    ({ state } = triviaEngine.applyAction(state, "p1", { optionIndex: correct }));
    const result = triviaEngine.applyAction(state, "p2", { optionIndex: wrong });

    expect(result.state.revealed).toBe(true);
    expect(result.state.scores.p1).toBe(10);
    expect(result.state.scores.p2).toBe(0);
  });

  it("ignores actions from participants not in the session", () => {
    const state = triviaEngine.createInitialState(PLAYERS);
    const { state: unchanged } = triviaEngine.applyAction(state, "intruder", { optionIndex: 0 });
    expect(unchanged.answers).toEqual({});
  });

  it("ignores a malformed action payload", () => {
    const state = triviaEngine.createInitialState(PLAYERS);
    const { state: unchanged } = triviaEngine.applyAction(state, "p1", {});
    expect(unchanged.answers).toEqual({});
  });

  it("ignores further answers once the round is revealed", () => {
    let state = triviaEngine.createInitialState(PLAYERS);
    ({ state } = triviaEngine.applyAction(state, "p1", { optionIndex: 0 }));
    ({ state } = triviaEngine.applyAction(state, "p2", { optionIndex: 0 }));
    expect(state.revealed).toBe(true);

    const { state: stillRevealed } = triviaEngine.applyAction(state, "p1", { optionIndex: 1 });
    expect(stillRevealed).toBe(state);
  });

  it("marks the game complete only after the final round", () => {
    let state = triviaEngine.createInitialState(PLAYERS);
    state = { ...state, round: state.totalRounds };
    const correct = state.question.correctIndex;

    ({ state } = triviaEngine.applyAction(state, "p1", { optionIndex: correct }));
    const result = triviaEngine.applyAction(state, "p2", { optionIndex: correct });

    expect(result.complete).toBe(true);
  });

  it("advanceTriviaRound resets per-round fields and picks a different question", () => {
    const state = triviaEngine.createInitialState(PLAYERS);
    const advanced = advanceTriviaRound({ ...state, revealed: true, answers: { p1: 0, p2: 1 } });
    expect(advanced.round).toBe(state.round + 1);
    expect(advanced.revealed).toBe(false);
    expect(advanced.answers).toEqual({});
  });

  it("toPublicState hides the correct answer index until revealed", () => {
    const state = triviaEngine.createInitialState(PLAYERS);
    const publicState = triviaEngine.toPublicState(state, "p1") as { question: Record<string, unknown> };
    expect(publicState.question.correctIndex).toBeUndefined();
  });

  it("toPublicState reveals full question details once answered", () => {
    let state = triviaEngine.createInitialState(PLAYERS);
    const correct = state.question.correctIndex;
    ({ state } = triviaEngine.applyAction(state, "p1", { optionIndex: correct }));
    ({ state } = triviaEngine.applyAction(state, "p2", { optionIndex: correct }));
    const publicState = triviaEngine.toPublicState(state, "p1") as { question: { correctIndex: number } };
    expect(publicState.question.correctIndex).toBe(correct);
  });
});
