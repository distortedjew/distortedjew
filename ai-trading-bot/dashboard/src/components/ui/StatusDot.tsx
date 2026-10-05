import { cn } from "@/lib/cn";
import { TONE_BG } from "@/lib/tones";
import type { Tone } from "@/types";

/**
 * Colored status dot with an optional pulse ring (live / online indicators).
 * Always pair it with a text label — color alone never carries meaning.
 */
export function StatusDot({
  tone = "neutral",
  pulse = false,
  size = "sm",
  className,
}: {
  tone?: Tone;
  pulse?: boolean;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const dim = size === "xs" ? "size-1.5" : size === "sm" ? "size-2" : "size-2.5";
  return (
    <span aria-hidden className={cn("relative inline-flex shrink-0", dim, className)}>
      {pulse ? <span className={cn("absolute inset-0 animate-pulse-ring rounded-full", TONE_BG[tone])} /> : null}
      <span className={cn("relative inline-flex rounded-full", dim, TONE_BG[tone])} />
    </span>
  );
}
