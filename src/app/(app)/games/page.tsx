import type { Metadata } from "next";
import Link from "next/link";
import { SplitSquareHorizontal, Brain, Puzzle, Pencil, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GAME_META } from "@/lib/games/registry";
import type { GameType } from "@/lib/games/types";

export const metadata: Metadata = { title: "Games" };

const ICONS: Record<GameType, typeof SplitSquareHorizontal> = {
  WOULD_YOU_RATHER: SplitSquareHorizontal,
  TRIVIA: Brain,
  GUESS_THE_WORD: Puzzle,
  DRAWING_GUESS: Pencil,
};

export default function GamesPage() {
  const games = Object.entries(GAME_META) as [GameType, (typeof GAME_META)[GameType]][];

  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <div className="mx-auto max-w-lg text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Mini-games</h1>
        <p className="mt-2 text-muted-foreground">
          Break the ice without ever leaving the conversation. Start any chat
          or group room, then hit the 🎮 button to play.
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {games.map(([type, meta]) => {
          const Icon = ICONS[type];
          return (
            <Card key={type}>
              <CardContent className="flex flex-col gap-3 pt-6">
                <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 text-primary">
                  <Icon className="size-5" />
                </div>
                <h3 className="font-display text-base font-semibold">{meta.name}</h3>
                <p className="text-sm text-muted-foreground">{meta.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Button asChild size="lg" className="group">
          <Link href="/discover">
            Start a random chat
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/rooms">Join a group room</Link>
        </Button>
      </div>
    </div>
  );
}
