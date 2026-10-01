import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { SplitSquareHorizontal, Brain, Puzzle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdSection } from "@/components/ads/ad-section";
import { GAME_META } from "@/lib/games/registry";
import type { GameType } from "@/lib/games/types";

export const metadata: Metadata = pageMetadata({
  title: "Mini-games",
  description:
    "Play Would You Rather, Trivia, Guess the Word and Draw & Guess with the people you meet on Wisp, right inside the chat.",
  path: "/games",
});

const ICONS: Record<GameType, typeof SplitSquareHorizontal> = {
  WOULD_YOU_RATHER: SplitSquareHorizontal,
  TRIVIA: Brain,
  GUESS_THE_WORD: Puzzle,
  DRAWING_GUESS: Pencil,
};

export default function GamesPage() {
  const games = Object.entries(GAME_META) as [GameType, (typeof GAME_META)[GameType]][];

  return (
    <>
      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
      <h1 className="type-poster text-5xl sm:text-6xl">Mini-games</h1>
      <p className="mt-4 max-w-[46ch] text-lg leading-relaxed text-muted-foreground">
        Games run inside a chat or a group room. During a chat, tap the controller icon at the top
        to invite the other person.
      </p>

      <ul className="mt-10 border-t border-border">
        {games.map(([type, meta]) => {
          const Icon = ICONS[type];
          return (
            <li key={type} className="flex items-start gap-4 border-b border-border py-5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-[0.875rem] bg-accent text-primary">
                <Icon className="size-5" />
              </span>
              <div>
                <h2 className="font-display text-xl font-semibold">{meta.name}</h2>
                <p className="mt-1 text-muted-foreground">{meta.description}</p>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-10 flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href="/discover">Start a chat</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/rooms">Join a group room</Link>
        </Button>
      </div>
      </div>
      <AdSection placement="games" width="max-w-3xl" />
    </>
  );
}
