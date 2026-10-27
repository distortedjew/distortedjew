import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** Checkbox (Radix); supports `checked="indeterminate"`. */
export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "peer inline-flex size-4 shrink-0 items-center justify-center rounded-[5px] border border-line-strong bg-surface-2 transition-colors",
        "hover:border-fg/30 data-[state=checked]:border-accent-solid data-[state=checked]:bg-accent-solid data-[state=checked]:text-accent-fg",
        "data-[state=indeterminate]:border-accent-solid data-[state=indeterminate]:bg-accent-solid data-[state=indeterminate]:text-accent-fg",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/70 disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        {props.checked === "indeterminate" ? (
          <Minus className="size-3" strokeWidth={3} aria-hidden />
        ) : (
          <Check className="size-3" strokeWidth={3} aria-hidden />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
