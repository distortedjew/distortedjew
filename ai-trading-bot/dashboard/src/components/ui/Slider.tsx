import * as SliderPrimitive from "@radix-ui/react-slider";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SliderProps extends Omit<ComponentProps<typeof SliderPrimitive.Root>, "value" | "onValueChange" | "defaultValue"> {
  value: number;
  onValueChange: (value: number) => void;
  /** Called when the user releases the thumb. */
  onValueCommit?: (value: number) => void;
  /** Render the current value to the right of the track. */
  formatValue?: (value: number) => ReactNode;
  "aria-label"?: string;
}

/** Single-value slider (Radix) with an optional value readout. */
export function Slider({ value, onValueChange, onValueCommit, formatValue, className, ...props }: SliderProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <SliderPrimitive.Root
        value={[value]}
        onValueChange={([v]) => onValueChange(v)}
        onValueCommit={onValueCommit ? ([v]) => onValueCommit(v) : undefined}
        className="relative flex h-5 w-full touch-none items-center select-none data-[disabled]:opacity-45"
        {...props}
      >
        <SliderPrimitive.Track className="relative h-1 grow overflow-hidden rounded-full bg-fg/12">
          <SliderPrimitive.Range className="absolute h-full rounded-full bg-accent-solid" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-label={props["aria-label"]}
          className={cn(
            "block size-4 rounded-full border-2 border-accent-solid bg-white shadow-[0_1px_3px_rgb(0_0_0/0.35)] transition-transform",
            "hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/70",
          )}
        />
      </SliderPrimitive.Root>
      {formatValue ? (
        <span className="num min-w-12 shrink-0 text-right text-dense text-fg">{formatValue(value)}</span>
      ) : null}
    </div>
  );
}
