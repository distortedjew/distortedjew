import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * Popover (Radix), styled as an elevated panel.
 *
 *   <Popover>
 *     <PopoverTrigger asChild><Button>Filters</Button></PopoverTrigger>
 *     <PopoverContent align="end" className="w-80">…</PopoverContent>
 *   </Popover>
 */
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({
  className,
  sideOffset = 8,
  align = "center",
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={8}
        className={cn(
          "popper-motion z-50 w-72 rounded-xl surface-elevated p-3 outline-none",
          "origin-(--radix-popover-content-transform-origin)",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
