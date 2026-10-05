import type { LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { TONE_BG, TONE_SOFT, TONE_SOLID, TONE_TEXT } from "@/lib/tones";
import type { Tone } from "@/types";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** soft (tinted, default) · solid (high emphasis) · outline · plain (text + dot/icon only). */
  variant?: "soft" | "solid" | "outline" | "plain";
  size?: "xs" | "sm" | "md";
  /** rounded-md (default) or fully rounded pill. */
  shape?: "rounded" | "pill";
  icon?: LucideIcon;
  /** Leading colored dot. */
  dot?: boolean;
  /** Uppercase with tracking (status labels). */
  caps?: boolean;
  children?: ReactNode;
}

const sizes = {
  xs: "h-[18px] gap-1 px-1.5 text-2xs [&_svg]:size-2.5",
  sm: "h-5 gap-1 px-1.5 text-[11px] [&_svg]:size-3",
  md: "h-6 gap-1.5 px-2 text-xs [&_svg]:size-3.5",
};

/**
 * Small status / category label. Color comes from a semantic tone, never ad-hoc classes.
 *
 *   <Badge tone="up" icon={ArrowUpRight}>Long</Badge>
 *   <Badge tone="warning" variant="solid" caps>Paper</Badge>
 */
export function Badge({
  tone = "neutral",
  variant = "soft",
  size = "sm",
  shape = "rounded",
  icon: Icon,
  dot,
  caps,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full shrink-0 items-center font-medium whitespace-nowrap",
        sizes[size],
        shape === "pill" ? "rounded-full" : "rounded-md",
        variant === "soft" && cn("ring-1 ring-inset", TONE_SOFT[tone]),
        variant === "solid" && TONE_SOLID[tone],
        variant === "outline" && cn("ring-1 ring-line-strong ring-inset", TONE_TEXT[tone]),
        variant === "plain" && cn("px-0", TONE_TEXT[tone]),
        caps && "tracking-[0.06em] uppercase",
        className,
      )}
      {...props}
    >
      {dot ? (
        <span
          aria-hidden
          className={cn("size-1.5 shrink-0 rounded-full", variant === "solid" ? "bg-current" : TONE_BG[tone])}
        />
      ) : null}
      {Icon ? <Icon aria-hidden className="shrink-0" strokeWidth={2.25} /> : null}
      {children !== undefined && children !== null ? <span className="truncate">{children}</span> : null}
    </span>
  );
}

/** Fully rounded Badge. */
export function Pill(props: BadgeProps) {
  return <Badge shape="pill" {...props} />;
}
