"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { MessageCircle, Mic, Video, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { MODE_OPTIONS } from "./mode-options";
import { INTEREST_OPTIONS, LANGUAGE_OPTIONS } from "@/lib/validation/profile";
import { COUNTRIES } from "@/lib/countries";
import type { MatchChannel, MatchMode } from "@/types/ws";

const CHANNELS: Array<{ value: MatchChannel; label: string; icon: typeof MessageCircle; description: string }> = [
  { value: "TEXT", label: "Text", icon: MessageCircle, description: "Type your way into a conversation." },
  { value: "VOICE", label: "Voice", icon: Mic, description: "Talk it out, no camera needed." },
  { value: "VIDEO", label: "Video", icon: Video, description: "Face to face, worldwide." },
];

export function DiscoverForm({
  defaultInterests,
  defaultLanguage,
  defaultCountry,
}: {
  defaultInterests: string[];
  defaultLanguage: string | null;
  defaultCountry: string | null;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState<MatchChannel>("TEXT");
  const [mode, setMode] = useState<MatchMode>("RANDOM");
  const [interests, setInterests] = useState<string[]>(defaultInterests);
  const [language, setLanguage] = useState<string>(defaultLanguage ?? "");
  const [country, setCountry] = useState<string>(defaultCountry ?? "");

  const needsInterests = mode === "INTERESTS" || mode === "GAMING" || mode === "MUSIC";
  const needsLanguage = mode === "SAME_LANGUAGE" || mode === "LANGUAGE_EXCHANGE";
  const needsCountry = mode === "SAME_COUNTRY";

  function toggleInterest(interest: string) {
    setInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest].slice(-8),
    );
  }

  function startMatching() {
    const params = new URLSearchParams({ channel, mode });
    if (interests.length) params.set("interests", interests.join(","));
    if (language) params.set("language", language);
    if (country) params.set("country", country);
    router.push(`/chat?${params.toString()}`);
  }

  const disabled =
    (needsInterests && interests.length === 0) ||
    (needsLanguage && !language) ||
    (needsCountry && !country);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-12">
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Find your next conversation
        </h1>
        <p className="mt-2 text-muted-foreground">
          Pick how you want to connect — we&apos;ll handle the rest.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">How do you want to talk?</h2>
        <div className="grid grid-cols-3 gap-3">
          {CHANNELS.map((c) => {
            const active = channel === c.value;
            return (
              <button
                key={c.value}
                onClick={() => setChannel(c.value)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-all",
                  active
                    ? "border-primary/50 bg-primary/10 shadow-[0_0_0_1px] shadow-primary/30"
                    : "border-border/60 bg-card/60 hover:border-border",
                )}
              >
                <c.icon className={cn("size-5", active ? "text-primary" : "text-muted-foreground")} />
                <span className="text-sm font-medium">{c.label}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {CHANNELS.find((c) => c.value === channel)?.description}
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">What kind of match?</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MODE_OPTIONS.map((m) => {
            const active = mode === m.value;
            return (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-left text-xs transition-all",
                  active
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border/60 bg-card/40 text-muted-foreground hover:border-border",
                )}
              >
                <div className="font-medium text-foreground">{m.label}</div>
                <div className="mt-0.5 line-clamp-1 text-[11px] opacity-80">{m.description}</div>
              </button>
            );
          })}
        </div>
      </section>

      {needsInterests && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Pick a few interests {interests.length > 0 && `(${interests.length} selected)`}
          </h2>
          <div className="flex flex-wrap gap-2">
            {INTEREST_OPTIONS.map((interest) => {
              const active = interests.includes(interest);
              return (
                <button key={interest} onClick={() => toggleInterest(interest)}>
                  <Badge variant={active ? "default" : "outline"} className="cursor-pointer px-3 py-1.5">
                    {interest}
                  </Badge>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {needsLanguage && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Language</h2>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a language" />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>
      )}

      {needsCountry && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Country</h2>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a country" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>
      )}

      <motion.div whileTap={{ scale: 0.98 }}>
        <Button size="lg" className="w-full group" disabled={disabled} onClick={startMatching}>
          Start matching
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </motion.div>
    </div>
  );
}
