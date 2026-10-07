import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { EMPTY_ICON } from "@/lib/constants";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  /** Primary action (button / link). */
  action?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Explains why there is nothing to show and what happens next. Write it for a person:
 * "No open positions — the bot opens one when a signal passes every risk check."
 */
export function EmptyState({
  icon: Icon = EMPTY_ICON,
  title,
  description,
  action,
  size = "md",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        size === "sm" && "gap-2 px-4 py-6",
        size === "md" && "gap-3 px-6 py-10",
        size === "lg" && "gap-3.5 px-6 py-16",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-xl bg-fg/[0.04] text-fg-subtle ring-1 ring-line ring-inset",
          size === "sm" ? "size-8" : "size-10",
        )}
      >
        <Icon className={size === "sm" ? "size-4" : "size-5"} strokeWidth={1.75} aria-hidden />
      </div>
      <div className="max-w-sm space-y-1">
        <p className={cn("font-medium text-fg", size === "sm" ? "text-dense" : "text-sm")}>{title}</p>
        {description ? <p className="text-dense leading-5 text-fg-subtle">{description}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
