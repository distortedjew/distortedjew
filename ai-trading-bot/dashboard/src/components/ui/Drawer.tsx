import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useDragControls, type PanInfo } from "framer-motion";
import { X } from "lucide-react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useBreakpoint } from "@/hooks/use-media-query";
import { cn } from "@/lib/cn";
import { motionPresets, sheetMotion, sheetTransition } from "@/lib/motion";

const widths = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-[480px]",
  lg: "sm:max-w-[640px]",
  xl: "sm:max-w-[860px]",
};

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** "auto" (default): right panel from md up, bottom sheet on phones/tablets portrait. */
  side?: "auto" | "right" | "left" | "bottom";
  size?: keyof typeof widths;
  /** Extra header content under the title (badges, key numbers). */
  headerExtra?: ReactNode;
  /** Sticky footer (actions). */
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Classes for the scrollable body. */
  bodyClassName?: string;
}

/**
 * Side sheet for details (position, trade, AI decision). Right side on desktop, bottom sheet on
 * small screens (drag down to dismiss). Controlled:
 *
 *   <Drawer open={!!selected} onOpenChange={(o) => !o && setSelected(null)} title="BTC/USDT long">…</Drawer>
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  side = "auto",
  size = "md",
  headerExtra,
  footer,
  children,
  className,
  bodyClassName,
}: DrawerProps) {
  const isDesktop = useBreakpoint("md");
  const resolved = side === "auto" ? (isDesktop ? "right" : "bottom") : side;
  const isBottom = resolved === "bottom";
  // Drag-to-dismiss starts only from the handle / header so the body can scroll normally.
  const dragControls = useDragControls();
  const startDrag = (event: ReactPointerEvent) => {
    if (isBottom) dragControls.start(event);
  };

  const onDragEnd = (_event: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onOpenChange(false);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-50 bg-overlay backdrop-blur-[1px]" {...motionPresets.overlay} />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild forceMount>
              <motion.div
                {...sheetMotion[resolved]}
                transition={sheetTransition}
                drag={isBottom ? "y" : false}
                dragListener={false}
                dragControls={dragControls}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.6 }}
                onDragEnd={isBottom ? onDragEnd : undefined}
                className={cn(
                  "surface-elevated fixed z-50 flex flex-col overflow-hidden outline-none",
                  resolved === "right" && cn("inset-y-0 right-0 w-full rounded-l-2xl border-r-0", widths[size]),
                  resolved === "left" && cn("inset-y-0 left-0 w-full rounded-r-2xl border-l-0", widths[size]),
                  isBottom && "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-2xl border-b-0",
                  className,
                )}
              >
                {isBottom ? (
                  <div
                    className="flex shrink-0 cursor-grab touch-none justify-center pt-2.5 pb-1 active:cursor-grabbing"
                    onPointerDown={startDrag}
                    aria-hidden
                  >
                    <span className="h-1 w-10 rounded-full bg-fg/20" />
                  </div>
                ) : null}
                <div
                  className={cn("shrink-0 border-b border-line px-5 pb-3.5", isBottom ? "touch-none pt-1.5" : "pt-4.5")}
                  onPointerDown={startDrag}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <DialogPrimitive.Title className="truncate text-base font-semibold tracking-[-0.01em] text-fg">
                        {title}
                      </DialogPrimitive.Title>
                      {description ? (
                        <DialogPrimitive.Description className="mt-0.5 text-dense text-fg-muted">
                          {description}
                        </DialogPrimitive.Description>
                      ) : (
                        <DialogPrimitive.Description className="sr-only">Details</DialogPrimitive.Description>
                      )}
                    </div>
                    <DialogPrimitive.Close
                      aria-label="Close"
                      className="-mt-0.5 -mr-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-fg/[0.07] hover:text-fg"
                    >
                      <X className="size-4" aria-hidden />
                    </DialogPrimitive.Close>
                  </div>
                  {headerExtra ? <div className="mt-3">{headerExtra}</div> : null}
                </div>
                <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4", bodyClassName)}>
                  {children}
                </div>
                {footer ? (
                  <div className="safe-bottom flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3">
                    {footer}
                  </div>
                ) : null}
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

/** Alias: some teams call it a Sheet. */
export const Sheet = Drawer;
