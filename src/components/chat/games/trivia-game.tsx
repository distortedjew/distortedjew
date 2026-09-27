"use client";

import { cn } from "@/lib/utils";

export interface TriviaPublicState {
  round: number;
  totalRounds: number;
  question: { question: string; options: string[]; correctIndex?: number };
  answers: Record<string, number>;
  scores: Record<string, number>;
  revealed: boolean;
  participantIds: string[];
}

export function TriviaGame({
  state,
  selfId,
  onAnswer,
}: {
  state: TriviaPublicState;
  selfId: string;
  onAnswer: (optionIndex: number) => void;
}) {
  const myAnswer = state.answers[selfId];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Round {state.round} of {state.totalRounds}</span>
        <span>
          {state.participantIds.map((id) => `${id === selfId ? "You" : "Them"}: ${state.scores[id] ?? 0}`).join(" · ")}
        </span>
      </div>
      <div className="text-center font-display text-base font-medium">{state.question.question}</div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {state.question.options.map((option, index) => {
          const isMine = myAnswer === index;
          const isCorrect = state.revealed && state.question.correctIndex === index;
          const isWrongPick = state.revealed && isMine && !isCorrect;
          return (
            <button
              key={option}
              disabled={myAnswer !== undefined}
              onClick={() => onAnswer(index)}
              className={cn(
                "rounded-xl border p-3 text-left text-sm transition-colors disabled:opacity-70",
                isCorrect && "border-success bg-success/10",
                isWrongPick && "border-destructive bg-destructive/10",
                !state.revealed && isMine && "border-primary bg-primary/10",
                !isCorrect && !isWrongPick && !(isMine && !state.revealed) && "border-border/60 bg-card/60",
              )}
            >
              {option}
            </button>
          );
        })}
      </div>

      {myAnswer !== undefined && !state.revealed && (
        <div className="text-center text-xs text-muted-foreground">Waiting for your partner…</div>
      )}
    </div>
  );
}
