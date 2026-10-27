import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Scroll container with a thin overlay scrollbar (Radix). Give it a height:
 *   <ScrollArea className="h-80">…long list…</ScrollArea>
 */
export function ScrollArea({
  children,
  className,
  viewportClassName,
  orientation = "vertical",
}: {
  children: ReactNode;
  className?: string;
  viewportClassName?: string;
  orientation?: "vertical" | "horizontal" | "both";
}) {
  return (
    <ScrollAreaPrimitive.Root className={cn("relative overflow-hidden", className)} type="hover">
      <ScrollAreaPrimitive.Viewport className={cn("size-full rounded-[inherit]", viewportClassName)}>
        {children}
      </ScrollAreaPrimitive.Viewport>
      {orientation !== "horizontal" ? <Bar orientation="vertical" /> : null}
      {orientation !== "vertical" ? <Bar orientation="horizontal" /> : null}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function Bar({ orientation }: { orientation: "vertical" | "horizontal" }) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      orientation={orientation}
      className={cn(
        "flex touch-none p-0.5 transition-colors select-none",
        orientation === "vertical" ? "h-full w-2" : "h-2 flex-col",
      )}
    >
      <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-fg/20 hover:bg-fg/30" />
    </ScrollAreaPrimitive.Scrollbar>
  );
}
