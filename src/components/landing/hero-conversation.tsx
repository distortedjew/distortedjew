"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";

type Line =
  | { kind: "status"; text: string; tone: "you" | "match" }
  | { kind: "message"; from: "you" | "them"; text: string };

// The first thirty seconds of a real Wisp: searching, a match, a first exchange.
const SCRIPT: Line[] = [
  { kind: "status", tone: "you", text: "Looking for someone who likes music" },
  { kind: "status", tone: "match", text: "Matched with someone in Lisbon" },
  { kind: "message", from: "them", text: "olá! first time on here?" },
  { kind: "message", from: "you", text: "yes, hi! Toronto here" },
  { kind: "message", from: "them", text: "nice. what are you listening to right now?" },
];

// Seconds at which each line appears; one sequence on load, then it rests.
const TIMING = [0.2, 1.3, 2.2, 3.3, 4.6];

const item: Variants = {
  hidden: { opacity: 0, y: 10 },
  shown: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: TIMING[i], duration: 0.35, ease: [0.2, 0.7, 0.2, 1] },
  }),
};

export function HeroConversation() {
  const reduceMotion = useReducedMotion();

  return (
    <div
      role="img"
      aria-label="An example Wisp conversation: two strangers from Lisbon and Toronto matched by their interest in music say hello."
      className="flex flex-col gap-3 sm:gap-3.5"
    >
      {SCRIPT.map((line, i) => (
        <motion.div
          key={i}
          custom={i}
          variants={item}
          initial={reduceMotion ? "shown" : "hidden"}
          animate="shown"
          aria-hidden
          className={cn(
            "flex",
            line.kind === "message" && line.from === "you" ? "justify-end" : "justify-start",
            line.kind === "status" && i === 1 && "mb-2",
          )}
        >
          {line.kind === "status" && (
            <span className="flex items-center gap-2.5 text-sm text-muted-foreground sm:text-base">
              {line.tone === "you" ? (
                <span className="size-2.5 rounded-full bg-primary" />
              ) : (
                <span className="flex">
                  <span className="size-2.5 rounded-full bg-primary" />
                  <span className="-ml-1 size-2.5 rounded-full bg-glow ring-2 ring-background" />
                </span>
              )}
              {line.text}
            </span>
          )}
          {line.kind === "message" && (
            <span
              className={cn(
                "max-w-[85%] px-5 py-3 text-lg leading-snug sm:text-[1.4rem] sm:leading-snug",
                line.from === "you"
                  ? "rounded-[1.4rem] rounded-br-[0.375rem] bg-primary text-primary-foreground"
                  : "rounded-[1.4rem] rounded-bl-[0.375rem] bg-glow text-glow-foreground",
              )}
            >
              {line.text}
            </span>
          )}
        </motion.div>
      ))}
    </div>
  );
}
