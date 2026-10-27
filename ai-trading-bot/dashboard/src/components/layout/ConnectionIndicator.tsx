import { RotateCw } from "lucide-react";
import { useConnection, type ConnectionInfo } from "@/hooks/live";
import { cn } from "@/lib/cn";
import { CONNECTION_META } from "@/lib/constants";
import { formatAgo, formatDuration } from "@/lib/format";
import { useNow } from "@/lib/time";
import type { ConnectionStatus } from "@/types";
import { Button } from "@/components/ui/Button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { Spinner } from "@/components/ui/Spinner";
import { StatusDot } from "@/components/ui/StatusDot";

const LABEL: Record<ConnectionStatus, string> = {
  live: "LIVE",
  connecting: "CONNECTING…",
  reconnecting: "RECONNECTING…",
  offline: "OFFLINE",
};

const STYLE: Record<ConnectionStatus, string> = {
  live: "text-up",
  connecting: "text-fg-subtle",
  reconnecting: "text-warning",
  offline: "text-down",
};

/**
 * "LIVE ●" / "RECONNECTING…" / "OFFLINE" (pure view of the trigger). `compact` (phones) keeps
 * "LIVE" and "OFFLINE" but shows only the spinner while (re)connecting — the connection banner
 * under the top bar spells that state out — and drops to the dot alone below 375 px.
 */
export function ConnectionBadge({
  status,
  compact,
  dotOnly,
  className,
}: {
  status: ConnectionStatus;
  compact?: boolean;
  /** Visually just the dot / spinner (label kept for screen readers). */
  dotOnly?: boolean;
  className?: string;
}) {
  const pending = status === "connecting" || status === "reconnecting";
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 text-[11px] font-semibold tracking-[0.1em] whitespace-nowrap",
        STYLE[status],
        className,
      )}
    >
      {pending ? <Spinner className="size-3" label={LABEL[status]} /> : null}
      <span className={cn((dotOnly || (compact && pending)) && "sr-only", compact && "max-[374px]:sr-only")}>
        {LABEL[status]}
      </span>
      {status === "live" ? <StatusDot tone="up" pulse size="xs" /> : null}
      {status === "offline" ? <StatusDot tone="down" size="xs" /> : null}
    </span>
  );
}

function Details({ info }: { info: ConnectionInfo }) {
  const now = useNow();
  const meta = CONNECTION_META[info.status];
  const retryIn = info.nextRetryAt ? Math.max(0, Math.ceil((info.nextRetryAt - now) / 1_000)) : null;
  const lastFrame = info.lastFrameAt ? (now - info.lastFrameAt) / 1_000 : null;
  const connectedFor = info.connectedAt && info.status === "live" ? (now - info.connectedAt) / 1_000 : null;

  return (
    <div className="space-y-3 text-xs">
      <div>
        <p className="text-dense font-medium text-fg">Real-time connection: {meta.label.replace("…", "")}</p>
        <p className="mt-0.5 text-fg-muted">
          {info.unauthorized
            ? "The API rejected the dashboard token. Open the dashboard with ?token=<DASHBOARD_TOKEN>."
            : meta.description}
        </p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-fg-subtle">Last message</dt>
        <dd className="text-right num text-fg">{lastFrame === null ? "—" : formatAgo(lastFrame)}</dd>
        {connectedFor !== null ? (
          <>
            <dt className="text-fg-subtle">Connected for</dt>
            <dd className="text-right num text-fg">{formatDuration(connectedFor)}</dd>
          </>
        ) : null}
        <dt className="text-fg-subtle">Reconnects</dt>
        <dd className="text-right num text-fg">{info.reconnects}</dd>
        {info.status !== "live" ? (
          <>
            <dt className="text-fg-subtle">Failed attempts</dt>
            <dd className="text-right num text-fg">{info.attempt}</dd>
            <dt className="text-fg-subtle">Next retry</dt>
            <dd className="text-right num text-fg">{retryIn === null ? "now" : `in ${retryIn}s`}</dd>
          </>
        ) : null}
      </dl>
      {info.status !== "live" ? (
        <>
          <p className="text-fg-subtle">
            Data keeps refreshing every few seconds by polling while the stream is down.
          </p>
          <Button size="xs" variant="secondary" leftIcon={RotateCw} onClick={info.retryNow} fullWidth>
            Retry now
          </Button>
        </>
      ) : null}
    </div>
  );
}

/** WebSocket status with a details popover (last message, retries, "Retry now"). */
export function ConnectionIndicator({
  compact,
  dotOnly,
  className,
}: {
  compact?: boolean;
  /** See ConnectionBadge — used on phones in live-trading mode so two "LIVE" labels never sit side by side. */
  dotOnly?: boolean;
  className?: string;
}) {
  const info = useConnection();
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Real-time connection: ${CONNECTION_META[info.status].label}`}
        className={cn("rounded-md px-1.5 transition-colors hover:bg-fg/[0.05]", className)}
      >
        <ConnectionBadge status={info.status} compact={compact} dotOnly={dotOnly} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <Details info={info} />
      </PopoverContent>
    </Popover>
  );
}
