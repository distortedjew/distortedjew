import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** On/off toggle (Radix). Pair with <Label htmlFor> or wrap in <Field>. */
export function Switch({
  className,
  size = "md",
  ...props
}: ComponentProps<typeof SwitchPrimitive.Root> & { size?: "sm" | "md" }) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors duration-150",
        "bg-fg/15 disabled:cursor-not-allowed disabled:opacity-45 data-[state=checked]:bg-accent-solid",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/70",
        size === "sm" ? "h-4 w-7" : "h-5 w-9",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.3)] transition-transform duration-150 ease-out",
          size === "sm"
            ? "size-3 translate-x-0.5 data-[state=checked]:translate-x-[13px]"
            : "size-4 translate-x-0.5 data-[state=checked]:translate-x-[17px]",
        )}
      />
    </SwitchPrimitive.Root>
  );
}
