import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { motionPresets } from "@/lib/motion";
import { Button } from "@/components/ui/Button";

const sizes = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  size?: keyof typeof sizes;
  /** Sticky footer (actions). */
  footer?: ReactNode;
  children?: ReactNode;
  /** Hide the × button (e.g. while a request is pending). */
  hideClose?: boolean;
  className?: string;
}

/**
 * Centered modal (Radix Dialog + framer-motion). Controlled:
 *
 *   <Dialog open={open} onOpenChange={setOpen} title="Run backtest" footer={<Button …>Run</Button>}>…</Dialog>
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  footer,
  children,
  hideClose,
  className,
}: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px]" {...motionPresets.overlay} />
            </DialogPrimitive.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
              <DialogPrimitive.Content asChild forceMount>
                <motion.div
                  {...motionPresets.dialog}
                  className={cn(
                    "surface-elevated pointer-events-auto flex max-h-[min(88dvh,820px)] w-full flex-col overflow-hidden rounded-2xl outline-none",
                    sizes[size],
                    className,
                  )}
                >
                  <div className="flex items-start justify-between gap-4 px-5 pt-4.5 pb-3">
                    <div className="min-w-0">
                      <DialogPrimitive.Title className="text-base font-semibold tracking-[-0.01em] text-fg">
                        {title}
                      </DialogPrimitive.Title>
                      {description ? (
                        <DialogPrimitive.Description className="mt-1 text-dense text-fg-muted">
                          {description}
                        </DialogPrimitive.Description>
                      ) : (
                        <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
                      )}
                    </div>
                    {hideClose ? null : (
                      <DialogPrimitive.Close
                        aria-label="Close"
                        className="-mt-0.5 -mr-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-fg/[0.07] hover:text-fg"
                      >
                        <X className="size-4" aria-hidden />
                      </DialogPrimitive.Close>
                    )}
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
                  {footer ? (
                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3">
                      {footer}
                    </div>
                  ) : null}
                </motion.div>
              </DialogPrimitive.Content>
            </div>
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  loading?: boolean;
  onConfirm: () => void;
}

/** Small confirm / cancel dialog (destructive actions like deleting a backtest). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  loading,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      hideClose={loading}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} size="sm" loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
