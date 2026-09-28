"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Gamepad2, SplitSquareHorizontal, Brain, Puzzle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useSocket, useSocketMessage } from "@/hooks/socket-provider";
import { WouldYouRatherGame, type WouldYouRatherPublicState } from "./games/would-you-rather-game";
import { TriviaGame, type TriviaPublicState } from "./games/trivia-game";
import { GuessWordGame, type GuessTheWordPublicState } from "./games/guess-word-game";
import type { GameType } from "@/lib/games/types";

const GAME_ICONS: Record<GameType, typeof Gamepad2> = {
  WOULD_YOU_RATHER: SplitSquareHorizontal,
  TRIVIA: Brain,
  GUESS_THE_WORD: Puzzle,
  DRAWING_GUESS: Pencil,
};

const GAME_LIST: Array<{ type: GameType; name: string; description: string }> = [
  { type: "WOULD_YOU_RATHER", name: "Would You Rather", description: "Pick a side, see how you match." },
  { type: "TRIVIA", name: "Trivia", description: "Race to answer trivia questions." },
  { type: "GUESS_THE_WORD", name: "Guess the Word", description: "Reveal hints, guess the word." },
  { type: "DRAWING_GUESS", name: "Draw & Guess", description: "One draws, one guesses." },
];

export function GamePanel({
  matchId,
  roomId,
  selfId,
  open,
  onOpenChange,
}: {
  matchId?: string;
  roomId?: string;
  selfId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { send } = useSocket();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [gameType, setGameType] = useState<GameType | null>(null);
  const [state, setState] = useState<Record<string, unknown> | null>(null);
  const [pendingInvite, setPendingInvite] = useState<{ sessionId: string; gameType: GameType } | null>(null);

  useSocketMessage("game:invited", (msg) => {
    setPendingInvite({ sessionId: msg.sessionId, gameType: msg.gameType as GameType });
    toast.info(`Your chat partner wants to play ${msg.gameType.replace(/_/g, " ").toLowerCase()}`, {
      action: {
        label: "Open",
        onClick: () => onOpenChange(true),
      },
    });
  });

  useSocketMessage("game:state", (msg) => {
    if (sessionId && msg.sessionId !== sessionId && !pendingInvite) return;
    setSessionId(msg.sessionId);
    setState(msg.state);
    if (pendingInvite?.sessionId === msg.sessionId) {
      setGameType(pendingInvite.gameType);
      setPendingInvite(null);
    }
  });

  function invite(type: GameType) {
    send({ type: "game:invite", matchId, roomId, gameType: type });
    setGameType(type);
    toast.success(roomId ? "Starting the game for everyone in the room…" : "Invite sent — waiting for them to accept.");
  }

  function acceptInvite() {
    if (!pendingInvite) return;
    send({ type: "game:accept", sessionId: pendingInvite.sessionId });
    setGameType(pendingInvite.gameType);
  }

  function playAgain() {
    setSessionId(null);
    setGameType(null);
    setState(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gamepad2 className="size-5" /> Mini-games
          </DialogTitle>
          <DialogDescription>Play together without leaving the conversation.</DialogDescription>
        </DialogHeader>

        {pendingInvite && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-primary/40 bg-primary/10 p-3 text-sm">
            <span>They want to play {pendingInvite.gameType.replace(/_/g, " ").toLowerCase()}</span>
            <Button size="sm" onClick={acceptInvite}>
              Accept
            </Button>
          </div>
        )}

        {!gameType && (
          <div className="grid grid-cols-2 gap-3">
            {GAME_LIST.map((g) => {
              const Icon = GAME_ICONS[g.type];
              return (
                <button
                  key={g.type}
                  onClick={() => invite(g.type)}
                  className="flex flex-col items-start gap-2 rounded-xl border border-border/60 bg-card/60 p-3 text-left hover:border-primary/40"
                >
                  <Icon className="size-5 text-primary" />
                  <div className="text-sm font-medium">{g.name}</div>
                  <div className="text-xs text-muted-foreground">{g.description}</div>
                </button>
              );
            })}
          </div>
        )}

        {gameType && !state && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Waiting for your partner to accept…
          </div>
        )}

        {gameType && state && sessionId && (
          <div>
            {gameType === "WOULD_YOU_RATHER" && (
              <WouldYouRatherGame
                state={state as unknown as WouldYouRatherPublicState}
                selfId={selfId}
                onChoose={(choice) => send({ type: "game:action", sessionId, action: { choice } })}
              />
            )}
            {gameType === "TRIVIA" && (
              <TriviaGame
                state={state as unknown as TriviaPublicState}
                selfId={selfId}
                onAnswer={(optionIndex) => send({ type: "game:action", sessionId, action: { optionIndex } })}
              />
            )}
            {(gameType === "GUESS_THE_WORD" || gameType === "DRAWING_GUESS") && (
              <GuessWordGame
                sessionId={sessionId}
                state={state as unknown as GuessTheWordPublicState}
                selfId={selfId}
                isDrawingVariant={gameType === "DRAWING_GUESS"}
                onGuess={(guess) => send({ type: "game:action", sessionId, action: { guess } })}
                onHint={() => send({ type: "game:action", sessionId, action: { type: "hint" } })}
              />
            )}

            {(() => {
              const s = state as { round?: number; totalRounds?: number; solvedBy?: string | null; revealed?: boolean };
              return s.round === s.totalRounds && (s.solvedBy || s.revealed);
            })() && (
                <div className="mt-4 flex justify-center">
                  <Button variant="outline" size="sm" onClick={playAgain}>
                    Choose another game
                  </Button>
                </div>
              )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
