"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Mic, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  { value: "TEXT", label: "Text", icon: MessageCircle, description: "Type messages. Nobody hears or sees you." },
  { value: "VOICE", label: "Voice", icon: Mic, description: "Talk out loud. Your camera stays off." },
  { value: "VIDEO", label: "Video", icon: Video, description: "See each other. Uses your camera and mic." },
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
    <div className="mx-auto flex max-w-2xl flex-col gap-10 px-5 pt-8 sm:pt-12">
      <h1 className="type-poster text-5xl sm:text-6xl">Start a chat</h1>

      <section aria-labelledby="channel-heading">
        <h2 id="channel-heading" className="mb-3 font-display text-lg font-semibold">
          Talk by
        </h2>
        <div className="grid grid-cols-3 gap-1 rounded-full bg-secondary p-1">
          {CHANNELS.map((c) => {
            const active = channel === c.value;
            return (
              <button
                key={c.value}
                type="button"
                aria-pressed={active}
                onClick={() => setChannel(c.value)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <c.icon className="size-4" />
                {c.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2.5 text-sm text-muted-foreground">
          {CHANNELS.find((c) => c.value === channel)?.description}
        </p>
      </section>

      <section aria-labelledby="mode-heading">
        <h2 id="mode-heading" className="mb-1 font-display text-lg font-semibold">
          Match me with
        </h2>
        <div role="radiogroup" aria-labelledby="mode-heading" className="grid sm:grid-cols-2 sm:gap-x-6">
          {MODE_OPTIONS.map((m) => {
            const active = mode === m.value;
            return (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setMode(m.value)}
                className="group flex items-start gap-3 border-b border-border py-3 text-left focus-visible:outline-none"
              >
                <span
                  className={cn(
                    "mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors group-focus-visible:ring-2 group-focus-visible:ring-ring/50",
                    active ? "border-primary" : "border-input",
                  )}
                  aria-hidden
                >
                  {active && <span className="size-2 rounded-full bg-primary" />}
                </span>
                <span>
                  <span className="block font-medium">{m.label}</span>
                  <span className="block text-sm text-muted-foreground">{m.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {needsInterests && (
        <section aria-labelledby="interests-heading">
          <h2 id="interests-heading" className="mb-3 font-display text-lg font-semibold">
            Interests{" "}
            <span className="font-sans text-sm font-normal text-muted-foreground">
              {interests.length > 0 ? `${interests.length} picked` : "pick at least one"}
            </span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {INTEREST_OPTIONS.map((interest) => {
              const active = interests.includes(interest);
              return (
                <button
                  key={interest}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleInterest(interest)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input hover:border-foreground/40",
                  )}
                >
                  {interest}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {needsLanguage && (
        <section aria-labelledby="language-heading">
          <h2 id="language-heading" className="mb-3 font-display text-lg font-semibold">
            {mode === "LANGUAGE_EXCHANGE" ? "Your language" : "Language"}
          </h2>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger aria-labelledby="language-heading">
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
        <section aria-labelledby="country-heading">
          <h2 id="country-heading" className="mb-3 font-display text-lg font-semibold">
            Your country
          </h2>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger aria-labelledby="country-heading">
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

      <div className="sticky bottom-16 -mx-5 border-t border-border bg-background/95 px-5 py-3 backdrop-blur md:bottom-0 md:border-t-0 md:pb-6">
        <Button size="lg" className="w-full" disabled={disabled} onClick={startMatching}>
          Start matching
        </Button>
      </div>
    </div>
  );
}
