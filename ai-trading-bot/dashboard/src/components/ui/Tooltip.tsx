import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Mounted once at the app root (App.tsx). */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={180} skipDelayDuration={250}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** Max width class, default max-w-72. */
  className?: string;
  delayDuration?: number;
  disabled?: boolean;
  /** Controlled open state (rarely needed). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Hover / focus tooltip. The child must be a focusable element (button, link) or forward a ref.
 *
 *   <Tooltip content="Last heartbeat: 2 seconds ago"><button>…</button></Tooltip>
 */
export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  className,
  delayDuration,
  disabled,
  open,
  onOpenChange,
}: TooltipProps) {
  if (disabled || content === null || content === undefined || content === "") return <>{children}</>;
  return (
    <TooltipPrimitive.Root delayDuration={delayDuration} open={open} onOpenChange={onOpenChange}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            "popper-motion surface-elevated z-50 max-w-72 rounded-lg px-2.5 py-1.5 text-xs leading-[1.45] text-fg",
            "origin-(--radix-tooltip-content-transform-origin)",
            className,
          )}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
