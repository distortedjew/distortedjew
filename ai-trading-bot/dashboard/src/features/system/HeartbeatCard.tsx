import {
  Activity,
  BrainCircuit,
  ChartCandlestick,
  Clock,
  HeartPulse,
  Power,
  Server,
  TriangleAlert,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useBotStatus, type EffectiveBotState } from "@/hooks/live";
import { cn } from "@/lib/cn";
import {
  AI_PROVIDER_META,
  BOT_STATE_META,
  FEED_META,
  STRATEGY_META,
  TRADING_MODE_META,
} from "@/lib/constants";
import { DASH, formatAgo, formatDateTime, formatDuration, formatRelativeTime } from "@/lib/format";
import { TONE_TEXT } from "@/lib/tones";
import { secondsSince, toMs, useNow } from "@/lib/time";
import type { SystemHealth } from "@/types";
import { Badge, Card, InfoTooltip, Kbd, Skeleton, StatusDot, Tooltip } from "@/components/ui";

const FRAME: Record<EffectiveBotState, string> = {
  online: "",
  degraded: "ring-1 ring-warning/35 ring-inset",
  offline: "ring-1 ring-down/40 ring-inset",
  unknown: "",
};

const GLOW: Record<EffectiveBotState, string> = {
  online: "from-up/[0.07]",
  degraded: "from-warning/[0.08]",
  offline: "from-down/[0.09]",
  unknown: "from-fg/[0.03]",
};

/**
 * Hero of the System page: bot state with a live "Last heartbeat: 2 seconds ago", the last
 * market update / AI analysis / trade (ticking), the next analysis countdown and both uptimes.
 * When the engine stops, it turns red and explains what that means and how to recover.
 */
export function HeartbeatCard({ system }: { system: SystemHealth | undefined }) {
  const bot = useBotStatus();
  const now = useNow();
  const engine = bot.status?.engine ?? null;
  const state = bot.state;
  const meta = BOT_STATE_META[state];

  if (bot.isPending && !bot.status) {
    return (
      <Card className="p-5">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
          <div className="space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  const heartbeat =
    bot.heartbeatAgeSec === null
      ? "No heartbeat received yet"
      : `Last heartbeat: ${formatAgo(bot.heartbeatAgeSec, "long")}`;
  const engineUptime = engine && state !== "offline" ? secondsSince(engine.started_at, now) : null;
  const apiUptime = system ? secondsSince(system.api.started_at, now) : null;
  const nextAt = toMs(engine?.next_analysis_at);
  const nextIn = nextAt === null ? null : (nextAt - now) / 1_000;

  return (
    <Card className={cn("overflow-hidden", FRAME[state])}>
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent to-45%",
          GLOW[state],
        )}
        aria-hidden
      />
      <div className="relative flex flex-col gap-5 p-4 sm:p-5 lg:flex-row lg:items-stretch lg:gap-8">
        <div className="flex min-w-0 flex-col justify-between gap-3 lg:w-[340px] lg:shrink-0">
          <div className="flex items-center gap-2">
            <span className="label-caps">Bot status</span>
            <InfoTooltip content="Online while the engine's heartbeat is under 10 s old, degraded under 60 s, offline beyond that. The heartbeat is written about every 2 seconds." />
          </div>
          <div className="flex items-center gap-3">
            <StatusDot tone={meta.tone} pulse={state === "online"} size="md" />
            <p
              className={cn("text-kpi font-semibold", state === "online" ? "text-fg" : TONE_TEXT[meta.tone])}
            >
              {meta.label}
            </p>
          </div>
          <p className="flex items-center gap-2 text-sm text-fg-muted" aria-live="off">
            <HeartPulse className={cn("size-4 shrink-0", TONE_TEXT[meta.tone])} aria-hidden />
            <Tooltip
              content={
                engine
                  ? `Heartbeat at ${formatDateTime(engine.heartbeat_at)}`
                  : "The engine has never reported"
              }
            >
              <span tabIndex={0} className="num-sans font-medium text-fg">
                {heartbeat}
              </span>
            </Tooltip>
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {bot.status ? (
              <Badge
                tone={TRADING_MODE_META[bot.status.mode].tone}
                icon={TRADING_MODE_META[bot.status.mode].icon}
                caps
                size="sm"
              >
                {TRADING_MODE_META[bot.status.mode].label}
              </Badge>
            ) : null}
            {engine ? (
              <>
                <Badge
                  tone={STRATEGY_META[engine.strategy].tone}
                  icon={STRATEGY_META[engine.strategy].icon}
                  size="sm"
                >
                  {STRATEGY_META[engine.strategy].label} strategy
                </Badge>
                <Badge tone={FEED_META[engine.feed].tone} icon={FEED_META[engine.feed].icon} size="sm">
                  {FEED_META[engine.feed].label}
                </Badge>
                <Badge tone="muted" size="sm" className="num">
                  v{engine.version} · pid {engine.pid}
                </Badge>
              </>
            ) : null}
          </div>
        </div>

        <div className="hidden w-px bg-line lg:block" aria-hidden />

        <div className="min-w-0 flex-1">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Stat
              icon={ChartCandlestick}
              label="Last market update"
              info="Latest decision-timeframe candle close processed by the engine."
              value={
                engine?.last_market_update ? formatRelativeTime(engine.last_market_update, now, "long") : DASH
              }
              sub={engine?.last_market_update ? formatDateTime(engine.last_market_update) : "Not yet"}
            />
            <Stat
              icon={BrainCircuit}
              label="Last AI analysis"
              info="When the analyst last produced a decision (on every decision-timeframe close, per symbol)."
              value={
                engine?.last_ai_analysis ? formatRelativeTime(engine.last_ai_analysis, now, "long") : DASH
              }
              sub={engine ? `${AI_PROVIDER_META[engine.ai_provider].label} · ${engine.ai_model}` : "Not yet"}
            />
            <Stat
              icon={Zap}
              label="Last trade"
              info="The most recent position opened or closed."
              value={engine?.last_trade ? formatRelativeTime(engine.last_trade, now, "long") : DASH}
              sub={engine?.last_trade ? formatDateTime(engine.last_trade) : "No trades yet"}
            />
            <Stat
              icon={Clock}
              label="Next analysis"
              info="The next decision-timeframe candle close, when every symbol is analysed again."
              value={
                state === "offline" || nextIn === null
                  ? DASH
                  : nextIn <= 0
                    ? "Due now"
                    : `in ${formatDuration(nextIn)}`
              }
              sub={engine ? `${engine.decision_timeframe} decision timeframe` : undefined}
            />
            <Stat
              icon={Activity}
              label="Engine uptime"
              value={engineUptime === null ? DASH : formatDuration(engineUptime)}
              sub={engine ? `Since ${formatDateTime(engine.started_at)}` : undefined}
            />
            <Stat
              icon={Server}
              label="API uptime"
              value={apiUptime === null ? DASH : formatDuration(apiUptime)}
              sub={system ? `v${system.status.api_version} · pid ${system.api.pid}` : undefined}
            />
          </dl>
        </div>
      </div>
      {state === "offline" || state === "degraded" ? (
        <OfflineExplainer state={state} lastBeat={engine?.heartbeat_at ?? null} />
      ) : null}
    </Card>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  info,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  info?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs text-fg-subtle">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
        {info ? <InfoTooltip content={info} /> : null}
      </dt>
      <dd className="mt-1 truncate num-sans text-sm font-medium text-fg">{value}</dd>
      {sub ? <dd className="mt-0.5 truncate text-xs text-fg-subtle">{sub}</dd> : null}
    </div>
  );
}

function OfflineExplainer({ state, lastBeat }: { state: "offline" | "degraded"; lastBeat: string | null }) {
  const offline = state === "offline";
  return (
    <div
      role="status"
      className={cn(
        "relative flex gap-3 border-t px-4 py-3.5 sm:px-5",
        offline ? "border-down/25 bg-down/[0.06]" : "border-warning/25 bg-warning/[0.06]",
      )}
    >
      {offline ? (
        <Power className="mt-0.5 size-4 shrink-0 text-down" aria-hidden />
      ) : (
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      )}
      <div className="min-w-0 space-y-1.5 text-dense leading-5">
        <p className="font-medium text-fg">
          {offline
            ? "The trading engine is not running."
            : "The engine's heartbeat is late — it is slow or stalled."}
          {lastBeat ? (
            <span className="font-normal text-fg-muted"> Last heartbeat at {formatDateTime(lastBeat)}.</span>
          ) : null}
        </p>
        <p className="text-fg-muted">
          {offline
            ? "No market data is processed, no AI decisions are made and no orders are placed or managed until it is back — open positions keep their last state but their stops and targets are not being watched. The API and this dashboard keep working and show the last known state."
            : "If it stays late for a minute the bot is reported offline. Trading continues only while heartbeats resume."}
        </p>
        {offline ? (
          <p className="text-xs text-fg-subtle">
            Start it with <Kbd>python -m tradebot.engine_main</Kbd> (or <Kbd>scripts/dev.sh</Kbd>). On start
            it restores settings, open positions and the day's statistics from the database, and this page
            turns green within seconds.
          </p>
        ) : null}
      </div>
    </div>
  );
}
