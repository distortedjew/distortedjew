"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSocket, useSocketMessage } from "@/hooks/socket-provider";
import type { DrawStroke } from "@/types/ws";

export interface GuessTheWordPublicState {
  round: number;
  totalRounds: number;
  word: string; // masked unless solved or you're the drawer
  revealedHints: number;
  guesses: Array<{ userId: string; guess: string; correct: boolean }>;
  solvedBy: string | null;
  scores: Record<string, number>;
  drawerId?: string;
  participantIds: string[];
}

function DrawCanvas({
  sessionId,
  isDrawer,
}: {
  sessionId: string;
  isDrawer: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { send } = useSocket();
  const drawing = useRef(false);

  function applyStroke(stroke: DrawStroke) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    if (stroke.kind === "clear") {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const x = (stroke.x ?? 0) * canvas.width;
    const y = (stroke.y ?? 0) * canvas.height;
    if (stroke.kind === "start") {
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else if (stroke.kind === "move") {
      ctx.lineTo(x, y);
      ctx.strokeStyle = "currentColor";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.stroke();
    }
  }

  useSocketMessage("game:draw", (msg) => {
    if (msg.sessionId !== sessionId) return;
    applyStroke(msg.stroke);
  });

  function pointerToStroke(e: React.PointerEvent<HTMLCanvasElement>, kind: DrawStroke["kind"]): DrawStroke {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      kind,
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawer) return;
    drawing.current = true;
    const stroke = pointerToStroke(e, "start");
    applyStroke(stroke);
    send({ type: "game:draw", sessionId, stroke });
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawer || !drawing.current) return;
    const stroke = pointerToStroke(e, "move");
    applyStroke(stroke);
    send({ type: "game:draw", sessionId, stroke });
  }

  function onPointerUp() {
    drawing.current = false;
  }

  function clear() {
    const stroke: DrawStroke = { kind: "clear" };
    applyStroke(stroke);
    send({ type: "game:draw", sessionId, stroke });
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.clientWidth * 2;
    canvas.height = canvas.clientHeight * 2;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(2, 2);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        className="h-56 w-full touch-none rounded-xl border border-border/60 bg-card text-foreground"
        style={{ cursor: isDrawer ? "crosshair" : "default" }}
      />
      {isDrawer && (
        <Button variant="outline" size="sm" onClick={clear} className="self-end">
          <Eraser className="size-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}

export function GuessWordGame({
  sessionId,
  state,
  selfId,
  isDrawingVariant,
  onGuess,
  onHint,
}: {
  sessionId: string;
  state: GuessTheWordPublicState;
  selfId: string;
  isDrawingVariant: boolean;
  onGuess: (guess: string) => void;
  onHint: () => void;
}) {
  const [guess, setGuess] = useState("");
  const isDrawer = isDrawingVariant && state.drawerId === selfId;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Round {state.round} of {state.totalRounds}</span>
        <button onClick={onHint} className="flex items-center gap-1 hover:text-foreground" disabled={isDrawer}>
          <Lightbulb className="size-3.5" /> Hint
        </button>
      </div>

      <div className="text-center font-display text-2xl font-semibold tracking-[0.3em]">
        {state.word}
      </div>

      {isDrawingVariant && <DrawCanvas sessionId={sessionId} isDrawer={isDrawer} />}

      {!isDrawer && !state.solvedBy && (
        <div className="flex gap-2">
          <input
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && guess.trim()) {
                onGuess(guess.trim());
                setGuess("");
              }
            }}
            placeholder="Type your guess…"
            className="h-10 flex-1 rounded-full border border-input bg-input/30 px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <Button
            size="sm"
            onClick={() => {
              if (guess.trim()) {
                onGuess(guess.trim());
                setGuess("");
              }
            }}
          >
            Guess
          </Button>
        </div>
      )}

      {state.solvedBy && (
        <div className="text-center text-sm font-medium text-success-foreground dark:text-success">
          {state.solvedBy === selfId ? "You got it! 🎉" : "Solved!"}
        </div>
      )}

      <div className="flex flex-col gap-1">
        {state.guesses.slice(-4).map((g, i) => (
          <div key={i} className="text-xs text-muted-foreground">
            {g.userId === selfId ? "You" : "Them"}: {g.guess}
          </div>
        ))}
      </div>
    </div>
  );
}
