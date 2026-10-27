import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: LucideIcon;
  disabled?: boolean;
  /** Tooltip-ish title attribute. */
  title?: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  size?: "xs" | "sm" | "md";
  "aria-label": string;
  fullWidth?: boolean;
  className?: string;
}

const sizes = {
  xs: "h-6 px-2 text-[11px] [&_svg]:size-3",
  sm: "h-7 px-2.5 text-xs [&_svg]:size-3.5",
  md: "h-8 px-3 text-dense [&_svg]:size-3.5",
};

/**
 * Single-choice segmented control (timeframes, ranges, views) with a sliding highlight.
 *
 *   <SegmentedControl aria-label="Timeframe" value={tf} onValueChange={setTf}
 *     options={TIMEFRAMES.map((t) => ({ value: t, label: t }))} />
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  size = "sm",
  fullWidth,
  className,
  ...aria
}: SegmentedControlProps<T>) {
  const layoutId = useId();
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(next as T);
      }}
      aria-label={aria["aria-label"]}
      className={cn(
        "relative inline-flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5 ring-1 ring-line ring-inset",
        fullWidth && "flex w-full",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <ToggleGroup.Item
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            title={option.title}
            className={cn(
              "relative inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors duration-150",
              "text-fg-subtle hover:text-fg-muted disabled:pointer-events-none disabled:opacity-40",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent/70",
              active && "text-fg hover:text-fg",
              fullWidth && "flex-1",
              sizes[size],
            )}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                aria-hidden
                className="absolute inset-0 rounded-md bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.14),0_0_0_1px_var(--line)] dark:bg-surface-3"
                transition={{ type: "tween", duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
              />
            ) : null}
            <span className="relative inline-flex items-center gap-1.5">
              {Icon ? <Icon aria-hidden /> : null}
              {option.label}
            </span>
          </ToggleGroup.Item>
        );
      })}
    </ToggleGroup.Root>
  );
}
