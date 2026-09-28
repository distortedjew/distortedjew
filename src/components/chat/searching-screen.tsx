"use client";

import { motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { MatchChannel, MatchMode } from "@/types/ws";

const MODE_LABELS: Record<MatchMode, string> = {
  RANDOM: "Random",
  INTERESTS: "Shared interests",
  SAME_LANGUAGE: "Same language",
  LANGUAGE_EXCHANGE: "Language exchange",
  SAME_COUNTRY: "Same country",
  WORLDWIDE: "Worldwide",
  GAMING: "Gaming",
  MUSIC: "Music",
  JUST_TALKING: "Just talking",
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
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="relative flex size-28 items-center justify-center">
        <span className="absolute inset-0 rounded-full border border-primary/30 animate-pulse-ring" />
        <span className="absolute inset-0 rounded-full border border-primary/30 animate-pulse-ring [animation-delay:0.6s]" />
        <span className="absolute inset-0 rounded-full border border-primary/30 animate-pulse-ring [animation-delay:1.2s]" />
        <div className="flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-lg">
          <Search className="size-6" />
        </div>
      </div>

      <div>
        <motion.h1
          key="searching-title"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-display text-2xl font-semibold"
        >
          Finding someone…
        </motion.h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Matching you on {channel.toLowerCase()} chat
        </p>
      </div>

      <Badge variant="secondary">{MODE_LABELS[mode]}</Badge>

      <Button variant="outline" onClick={onCancel}>
        <X className="size-4" />
        Cancel
      </Button>
    </div>
  );
}
