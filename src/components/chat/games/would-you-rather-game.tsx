"use client";

import { motion } from "framer-motion";

export interface WouldYouRatherPublicState {
  round: number;
  totalRounds: number;
  prompt: { optionA: string; optionB: string };
  votes: Record<string, "A" | "B">;
  participantIds: string[];
}

export function WouldYouRatherGame({
  state,
  selfId,
  onChoose,
}: {
  state: WouldYouRatherPublicState;
  selfId: string;
  onChoose: (choice: "A" | "B") => void;
}) {
  const myVote = state.votes[selfId];
  const bothVoted = state.participantIds.every((id) => state.votes[id]);

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center text-xs text-muted-foreground">
        Round {state.round} of {state.totalRounds}
      </div>
      <div className="text-center font-display text-base font-medium">Would you rather…</div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(["A", "B"] as const).map((key) => {
          const label = key === "A" ? state.prompt.optionA : state.prompt.optionB;
          const selected = myVote === key;
          return (
            <motion.button
              key={key}
              whileTap={{ scale: 0.97 }}
              disabled={!!myVote}
              onClick={() => onChoose(key)}
              className={`rounded-2xl border p-4 text-sm font-medium transition-colors ${
                selected
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border/60 bg-card/60 hover:border-border disabled:opacity-60"
              }`}
            >
              {label}
            </motion.button>
          );
        })}
      </div>

      {myVote && !bothVoted && (
        <div className="text-center text-xs text-muted-foreground">Waiting for your partner…</div>
      )}
    </div>
  );
}
