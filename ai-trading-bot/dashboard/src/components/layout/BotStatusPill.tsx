import { Link } from "react-router";
import { useBotStatus, type EffectiveBotState } from "@/hooks/live";
import { cn } from "@/lib/cn";
import { AI_PROVIDER_META, BOT_STATE_META, FEED_META, STRATEGY_META } from "@/lib/constants";
import { formatAgo, formatDuration } from "@/lib/format";
import { secondsSince, useNow } from "@/lib/time";
import type { BotStatus } from "@/types";
import { StatusDot } from "@/components/ui/StatusDot";
import { Tooltip } from "@/components/ui/Tooltip";

const LABEL: Record<EffectiveBotState, string> = {
  online: "BOT ONLINE",
  degraded: "DEGRADED",
  offline: "BOT OFFLINE",
  unknown: "STATUS UNKNOWN",
};
const SHORT: Record<EffectiveBotState, string> = {
  online: "ONLINE",
  degraded: "DEGRADED",
  offline: "OFFLINE",
  unknown: "UNKNOWN",
};
const STYLE: Record<EffectiveBotState, string> = {
  online: "text-up ring-up/30 bg-up/[0.08]",
  degraded: "text-warning ring-warning/35 bg-warning/[0.08]",
  offline: "text-down ring-down/35 bg-down/[0.08]",
  unknown: "text-fg-subtle ring-line-strong bg-fg/[0.03]",
};

export interface BotStatusPillProps {
  state: EffectiveBotState;
  heartbeatAgeSec: number | null;
  status?: BotStatus;
  compact?: boolean;
  /** Render without the link (design showcase). */
  static?: boolean;
  className?: string;
}

function Details({ state, heartbeatAgeSec, status }: Pick<BotStatusPillProps, "state" | "heartbeatAgeSec" | "status">) {
  const now = useNow();
  const engine = status?.engine;
  const uptime = engine ? secondsSince(engine.started_at, now) : null;
  return (
    <div className="space-y-1.5 py-0.5">
      <p className="font-medium text-fg">
        {heartbeatAgeSec === null ? "No heartbeat received yet" : `Last heartbeat: ${formatAgo(heartbeatAgeSec, "long")}`}
      </p>
      <p className="text-fg-muted">{BOT_STATE_META[state].description}</p>
      {engine ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 pt-1 text-[11px]">
          <dt className="text-fg-subtle">Strategy</dt>
          <dd>{STRATEGY_META[engine.strategy].label}</dd>
          <dt className="text-fg-subtle">AI</dt>
          <dd className="truncate">
            {AI_PROVIDER_META[engine.ai_provider].label} · {engine.ai_model}
          </dd>
          <dt className="text-fg-subtle">Market data</dt>
          <dd>
            {FEED_META[engine.feed].label}
            {engine.feed_connected ? "" : " (disconnected)"}
          </dd>
          <dt className="text-fg-subtle">Uptime</dt>
          <dd className="num">{formatDuration(uptime)}</dd>
          <dt className="text-fg-subtle">Version</dt>
          <dd className="num">{engine.version}</dd>
        </dl>
      ) : null}
    </div>
  );
}

/** "● BOT ONLINE" pill (pure view). Use <ConnectedBotStatusPill /> in the app. */
export function BotStatusPill({ state, heartbeatAgeSec, status, compact, static: isStatic, className }: BotStatusPillProps) {
  const tone = BOT_STATE_META[state].tone;
  const classes = cn(
    "inline-flex h-7 items-center gap-2 rounded-full px-2.5 text-[11px] font-semibold tracking-[0.08em] whitespace-nowrap ring-1 ring-inset transition-colors",
    STYLE[state],
    !isStatic && "hover:brightness-110",
    className,
  );
  const content = (
    <>
      <StatusDot tone={tone} pulse={state === "online"} size="sm" />
      <span>{compact ? SHORT[state] : LABEL[state]}</span>
    </>
  );
  return (
    <Tooltip content={<Details state={state} heartbeatAgeSec={heartbeatAgeSec} status={status} />} side="bottom" className="max-w-80">
      {isStatic ? (
        <span tabIndex={0} role="status" className={classes}>
          {content}
        </span>
      ) : (
        <Link to="/system" role="status" aria-label={`${LABEL[state]} — open system health`} className={classes}>
          {content}
        </Link>
      )}
    </Tooltip>
  );
}

/** Bot status from the live heartbeat (WS `status` frames, REST fallback). */
export function ConnectedBotStatusPill({ compact, className }: { compact?: boolean; className?: string }) {
  const bot = useBotStatus();
  return (
    <BotStatusPill
      state={bot.state}
      heartbeatAgeSec={bot.heartbeatAgeSec}
      status={bot.status}
      compact={compact}
      className={className}
    />
  );
}
