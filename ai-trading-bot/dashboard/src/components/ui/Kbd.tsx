import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Keyboard key hint: <Kbd>Esc</Kbd>. */
export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-line-strong bg-surface-2 px-1 font-mono text-[10.5px] font-medium text-fg-muted shadow-[0_1px_0_var(--line-strong)]",
        className,
      )}
      {...props}
    />
  );
}
