import { Hourglass, RotateCw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { ApiError, describeError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";

export interface ErrorStateProps {
  /** The thrown error (ApiError gets a friendly sentence) or a message. */
  error?: unknown;
  title?: ReactNode;
  /** Overrides the message derived from `error`. */
  description?: ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  /** Single-line variant for small cards and table rows. */
  compact?: boolean;
  className?: string;
}

/** 503 "engine has not published state yet" is a wait, not a failure: render it calmly. */
function isWaiting(error: unknown): boolean {
  return error instanceof ApiError && error.isEngineUnavailable;
}

/**
 * Graceful failure: what went wrong in plain language, plus a retry. A 503 from an endpoint
 * whose live state the engine has not published yet renders as a neutral "waiting" state.
 *
 *   if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
 */
export function ErrorState({ error, title, description, onRetry, retrying, compact, className }: ErrorStateProps) {
  const waiting = isWaiting(error);
  const heading = title ?? (waiting ? "Waiting for the trading engine" : "Couldn't load this data");
  const message = description ?? (error ? describeError(error) : "Something went wrong.");
  const code = !waiting && error instanceof ApiError && error.status ? `HTTP ${error.status}` : null;
  const Icon = waiting ? Hourglass : TriangleAlert;

  if (compact) {
    return (
      <div
        role={waiting ? "status" : "alert"}
        className={cn(
          "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-dense",
          waiting ? "border-line bg-fg/[0.03]" : "border-down/20 bg-down/[0.06]",
          className,
        )}
      >
        <Icon className={cn("size-3.5 shrink-0", waiting ? "text-fg-subtle" : "text-down")} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-fg-muted">
          {waiting && title === undefined ? <span className="font-medium text-fg">{heading}. </span> : null}
          {message}
        </span>
        {onRetry ? (
          <Button size="xs" variant="ghost" leftIcon={RotateCw} onClick={onRetry} loading={retrying}>
            Retry
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      role={waiting ? "status" : "alert"}
      className={cn("flex flex-col items-center justify-center gap-3 px-6 py-10 text-center", className)}
    >
      <div
        className={cn(
          "flex size-10 items-center justify-center rounded-xl ring-1 ring-inset",
          waiting ? "bg-fg/[0.04] text-fg-subtle ring-line" : "bg-down/10 text-down ring-down/20",
        )}
      >
        <Icon className="size-5" strokeWidth={1.75} aria-hidden />
      </div>
      <div className="max-w-md space-y-1">
        <p className="text-sm font-medium text-fg">{heading}</p>
        <p className="text-dense leading-5 text-fg-subtle">{message}</p>
        {code ? <p className="font-mono text-2xs text-fg-disabled">{code}</p> : null}
      </div>
      {onRetry ? (
        <Button size="sm" variant="secondary" leftIcon={RotateCw} onClick={onRetry} loading={retrying}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
