/**
 * Tone → Tailwind classes. Every colored primitive (Badge, StatusDot, ProgressBar, icon chips)
 * maps a semantic `Tone` through these tables, so meaning and color stay consistent.
 * Static strings on purpose: Tailwind only generates classes it can see in source.
 */
import type { Tone } from "@/types";

/** Text color. */
export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-fg",
  muted: "text-fg-subtle",
  up: "text-up",
  down: "text-down",
  warning: "text-warning",
  info: "text-info",
  accent: "text-accent",
  ai: "text-ai",
};

/** Soft tinted background + matching text + hairline ring (badges, chips). */
export const TONE_SOFT: Record<Tone, string> = {
  neutral: "bg-fg/[0.06] text-fg-muted ring-line-strong",
  muted: "bg-fg/[0.04] text-fg-subtle ring-line",
  up: "bg-up/10 text-up ring-up/25",
  down: "bg-down/10 text-down ring-down/25",
  warning: "bg-warning/10 text-warning ring-warning/30",
  info: "bg-info/10 text-info ring-info/25",
  accent: "bg-accent/12 text-accent ring-accent/30",
  ai: "bg-ai/12 text-ai ring-ai/30",
};

/** Solid fill with readable text (high-emphasis pills). */
export const TONE_SOLID: Record<Tone, string> = {
  neutral: "bg-fg text-fg-inverse",
  muted: "bg-surface-3 text-fg-muted",
  up: "bg-up text-fg-inverse",
  down: "bg-down-solid text-white",
  warning: "bg-warning text-black",
  info: "bg-info text-white",
  accent: "bg-accent-solid text-accent-fg",
  ai: "bg-ai text-fg-inverse",
};

/** Background color only (dots, bars, meter fills). */
export const TONE_BG: Record<Tone, string> = {
  neutral: "bg-fg-muted",
  muted: "bg-fg-disabled",
  up: "bg-up",
  down: "bg-down",
  warning: "bg-warning",
  info: "bg-info",
  accent: "bg-accent",
  ai: "bg-ai",
};

/** Border color (left accent rules, outlines). */
export const TONE_BORDER: Record<Tone, string> = {
  neutral: "border-line-strong",
  muted: "border-line",
  up: "border-up/40",
  down: "border-down/40",
  warning: "border-warning/40",
  info: "border-info/40",
  accent: "border-accent/40",
  ai: "border-ai/40",
};

/** Faint tinted surface for icon chips. */
export const TONE_CHIP: Record<Tone, string> = {
  neutral: "bg-fg/[0.06] text-fg-muted",
  muted: "bg-fg/[0.04] text-fg-subtle",
  up: "bg-up/12 text-up",
  down: "bg-down/12 text-down",
  warning: "bg-warning/12 text-warning",
  info: "bg-info/12 text-info",
  accent: "bg-accent/14 text-accent",
  ai: "bg-ai/14 text-ai",
};
