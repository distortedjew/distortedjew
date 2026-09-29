"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { SEARCHING_TIPS } from "@/lib/brand";
import type { MatchChannel, MatchMode } from "@/types/ws";

const MODE_LABELS: Record<MatchMode, string> = {
  RANDOM: "Anyone",
  INTERESTS: "Shared interests",
  SAME_LANGUAGE: "Same language",
  LANGUAGE_EXCHANGE: "Language exchange",
  SAME_COUNTRY: "Same country",
  WORLDWIDE: "Anywhere in the world",
  GAMING: "Gaming",
  MUSIC: "Music",
  JUST_TALKING: "Just talking",
};

const CHANNEL_LABELS: Record<MatchChannel, string> = {
  TEXT: "text chat",
  VOICE: "voice call",
  VIDEO: "video call",
};

export function SearchingScreen({
  channel,
  mode,
  onCancel,
}: {
  channel: MatchChannel;
  mode: MatchMode;
  onCancel: () => void;
}) {
  // Always start at the first tip: a random initial index would render
  // different text on the server and client and break hydration.
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setTipIndex((i) => (i + 1) % SEARCHING_TIPS.length);
    }, 6000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex min-h-app flex-col items-center justify-center gap-10 px-5 text-center">
      <div className="relative flex size-32 items-center justify-center" aria-hidden>
        <span className="absolute inset-0 rounded-full border-2 border-primary/40 animate-pulse-ring motion-reduce:hidden" />
        <span className="absolute inset-0 rounded-full border-2 border-primary/40 animate-pulse-ring [animation-delay:1.1s] motion-reduce:hidden" />
        <span className="size-5 rounded-full bg-primary" />
      </div>

      <div role="status">
        <h1 className="font-display text-3xl font-bold tracking-tight">Looking for someone</h1>
        <p className="mt-2 text-muted-foreground">
          {MODE_LABELS[mode]}, {CHANNEL_LABELS[channel]}
        </p>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={tipIndex}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="min-h-[3em] max-w-[34ch] text-sm leading-relaxed text-muted-foreground"
        >
          {SEARCHING_TIPS[tipIndex]}
        </motion.p>
      </AnimatePresence>

      <Button variant="outline" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
