import { Cpu, Database, HardDrive, MemoryStick, Radio, RotateCw, ShieldAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useBotStatus, useConnection } from "@/hooks/live";
import { cn } from "@/lib/cn";
import { CONNECTION_META, HEALTH_STATE_META } from "@/lib/constants";
import {
  DASH,
  formatAgo,
  formatCompact,
  formatInt,
  formatMb,
  formatMs,
  formatNumber,
  formatPct,
  formatRelativeTime,
} from "@/lib/format";
import { TONE_CHIP, TONE_TEXT } from "@/lib/tones";
import { useNow } from "@/lib/time";
import type { ComponentHealth, SystemHealth } from "@/types";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CopyButton,
  EmptyState,
  ErrorState,
  InfoTooltip,
  KeyValue,
  ProgressBar,
  Skeleton,
  StatusDot,
  Tooltip,
} from "@/components/ui";
import { EventRow } from "@/features/system/EventRow";
import { eventDataRows } from "@/features/system/event-data";
import { COMPONENT_META, HEALTH_GLYPH } from "@/features/system/health-meta";

// ---------------------------------------------------------------- component health grid

export function HealthGrid({ system, isPending, error, onRetry }: PanelProps) {
  if (error && !system) {
    return (
      <Card>
        <ErrorState error={error} onRetry={onRetry} />
      </Card>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {isPending || !system
        ? Array.from({ length: 6 }, (_, i) => <HealthSkeleton key={i} />)
        : system.components.map((c) => <HealthCard key={c.key} component={c} />)}
    </div>
  );
}

const DETAIL_PREVIEW = 3;

function HealthCard({ component }: { component: ComponentHealth }) {
  const [expanded, setExpanded] = useState(false);
  const now = useNow();
  const meta = COMPONENT_META[component.key];
  const state = HEALTH_STATE_META[component.state];
  const Icon = meta.icon;
  const details = eventDataRows(component.details);
  const shown = expanded ? details : details.slice(0, DETAIL_PREVIEW);
  const problem = component.state === "error" || component.state === "warning";

  return (
    <Card
      className={cn(
        "flex flex-col",
        component.state === "error" && "ring-1 ring-down/35 ring-inset",
        component.state === "warning" && "ring-1 ring-warning/35 ring-inset",
      )}
    >
      <div className="flex items-start gap-3 px-4 pt-3.5">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            component.state === "disabled" ? TONE_CHIP.muted : TONE_CHIP[state.tone],
          )}
          aria-hidden
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <h3 className="truncate text-[13.5px] font-semibold text-fg">{meta.label}</h3>
              <InfoTooltip content={meta.description} />
            </div>
            <Tooltip content={HEALTH_GLYPH[component.state]}>
              <span
                tabIndex={0}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 text-xs font-medium",
                  TONE_TEXT[state.tone],
                )}
              >
                <StatusDot tone={state.tone} pulse={component.state === "operational"} size="sm" />
                {state.label}
              </span>
            </Tooltip>
          </div>
          <p className="truncate text-xs text-fg-subtle">{component.name}</p>
        </div>
      </div>
      <p className={cn("px-4 pt-2.5 text-dense leading-5", problem ? "text-fg" : "text-fg-muted")}>
        {component.message}
      </p>
      {details.length ? (
        <dl className="mx-4 mt-2.5 space-y-0.5 border-t border-line-subtle pt-2 text-xs">
          {shown.map((row) => (
            <div key={row.key} className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 text-fg-subtle">{row.label}</dt>
              <dd
                className={cn(
                  "min-w-0 truncate text-right num text-fg-muted",
                  row.tone && TONE_TEXT[row.tone],
                )}
              >
                {Array.isArray(row.value) ? row.value.join(", ") : row.value}
              </dd>
            </div>
          ))}
          {details.length > DETAIL_PREVIEW ? (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
              className="mt-0.5 rounded text-xs text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent/70"
            >
              {expanded ? "Show less" : `Show ${details.length - DETAIL_PREVIEW} more`}
            </button>
          ) : null}
        </dl>
      ) : null}
      <div className="mt-auto flex items-center justify-between gap-3 px-4 pt-3 pb-3 text-xs text-fg-subtle">
        <span className="num">
          {component.latency_ms !== null && component.latency_ms !== undefined ? (
            <>Latency {formatMs(component.latency_ms)}</>
          ) : (
            " "
          )}
        </span>
        <span className="num">
          {component.last_ok
            ? `Last OK ${formatRelativeTime(component.last_ok, now)}`
            : component.state === "disabled"
              ? "Off"
              : "Never OK"}
        </span>
      </div>
    </Card>
  );
}

function HealthSkeleton() {
  return (
    <div className="space-y-3 rounded-xl surface-card p-4" aria-hidden>
      <div className="flex items-center gap-3">
        <Skeleton className="size-8 rounded-lg" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-2.5 w-20" />
        </div>
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-3 w-3/5" />
    </div>
  );
}

// ---------------------------------------------------------------- resources

interface PanelProps {
  system: SystemHealth | undefined;
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
}

function Gauge({
  icon: Icon,
  label,
  value,
  max = 100,
  valueLabel,
  info,
}: {
  icon: typeof Cpu;
  label: string;
  value: number | null | undefined;
  max?: number;
  valueLabel: ReactNode;
  info?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
        <span className="flex items-center gap-1.5 text-fg-muted">
          <Icon className="size-3.5 text-fg-subtle" aria-hidden />
          {label}
          {info ? <InfoTooltip content={info} /> : null}
        </span>
        <span className="num text-fg">{valueLabel}</span>
      </div>
      <ProgressBar
        value={value}
        max={max}
        size="sm"
        aria-label={label}
        thresholds={{ warning: 75, critical: 90 }}
      />
    </div>
  );
}

function ResourceColumn({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 space-y-3.5 rounded-lg border border-line-subtle bg-surface-2/50 p-3.5">
      <div>
        <h4 className="label-caps">{title}</h4>
        {sub ? <p className="mt-0.5 truncate text-xs text-fg-subtle">{sub}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function ResourcesCard({ system, isPending, error, onRetry }: PanelProps) {
  const bot = useBotStatus();
  const engine = bot.status?.engine ?? null;
  const engineDown = bot.state === "offline";
  const host = system?.host;
  const ramTotal = host?.ram_total_mb;
  return (
    <Card className="h-full">
      <CardHeader
        title="Resources"
        icon={Cpu}
        subtitle="CPU and memory of the engine, the API process and the host"
        info="Process CPU is the share of one core (it can exceed 100 % on several cores). Process memory is resident set size (RSS), shown against the host's RAM."
      />
      <CardBody>
        {error && !system ? (
          <ErrorState compact error={error} onRetry={onRetry} />
        ) : isPending || !system || !host ? (
          <div className="grid gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="space-y-4 rounded-lg border border-line-subtle p-3.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-2 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            <ResourceColumn
              title="Trading engine"
              sub={
                engine
                  ? engineDown
                    ? "Offline — last reported values"
                    : `pid ${engine.pid}`
                  : "Not reporting"
              }
            >
              <Gauge
                icon={Cpu}
                label="CPU"
                value={engineDown ? null : engine?.cpu_pct}
                valueLabel={engine && !engineDown ? formatPct(engine.cpu_pct, { decimals: 1 }) : DASH}
              />
              <Gauge
                icon={MemoryStick}
                label="RAM"
                value={engineDown ? null : engine?.rss_mb}
                max={ramTotal}
                valueLabel={engine && !engineDown ? formatMb(engine.rss_mb) : DASH}
              />
            </ResourceColumn>
            <ResourceColumn title="API server" sub={`pid ${system.api.pid}`}>
              <Gauge
                icon={Cpu}
                label="CPU"
                value={system.api.cpu_pct}
                valueLabel={formatPct(system.api.cpu_pct, { decimals: 1 })}
              />
              <Gauge
                icon={MemoryStick}
                label="RAM"
                value={system.api.rss_mb}
                max={ramTotal}
                valueLabel={formatMb(system.api.rss_mb)}
              />
            </ResourceColumn>
            <ResourceColumn title="Host" sub={`${host.cpu_count} cores · Python ${host.python}`}>
              <Gauge
                icon={Cpu}
                label="CPU"
                value={host.cpu_pct}
                valueLabel={formatPct(host.cpu_pct, { decimals: 1 })}
              />
              <Gauge
                icon={MemoryStick}
                label="RAM"
                value={host.ram_pct}
                valueLabel={`${formatMb(host.ram_used_mb)} / ${formatMb(host.ram_total_mb)}`}
              />
              <Gauge
                icon={HardDrive}
                label="Disk"
                value={host.disk_pct}
                valueLabel={formatPct(host.disk_pct, { decimals: 0 })}
              />
              <p className="flex items-center justify-between gap-2 text-xs text-fg-subtle">
                <span className="flex items-center gap-1">
                  Load average
                  <InfoTooltip content="Runnable processes averaged over 1, 5 and 15 minutes. Compare with the core count." />
                </span>
                <span className="num text-fg-muted">
                  {host.load_avg.map((l) => formatNumber(l, 2)).join(" · ")}
                </span>
              </p>
            </ResourceColumn>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------- database

export function DatabaseCard({ system, isPending, error, onRetry }: PanelProps) {
  const db = system?.database;
  const tables = db ? Object.entries(db.tables).sort((a, b) => b[1] - a[1]) : [];
  const maxRows = tables[0]?.[1] ?? 0;
  return (
    <Card>
      <CardHeader
        title="Database"
        icon={Database}
        subtitle="SQLite (WAL) shared by engine and API"
        info="The engine writes trading state; the API reads it and writes only settings, notification flags and backtest jobs. Query latency is a probe query timed by the API."
      />
      <CardBody>
        {error && !db ? (
          <ErrorState compact error={error} onRetry={onRetry} />
        ) : isPending || !db ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-3 w-full" />
            ))}
          </div>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <KeyValue label="Size" value={formatMb(db.size_mb)} />
              <KeyValue
                label="Query latency"
                value={formatMs(db.query_latency_ms)}
                info="Round trip of a probe query from the API."
              />
            </dl>
            <div className="mt-3 flex items-center gap-1.5 rounded-md bg-fg/[0.03] px-2 py-1 text-xs text-fg-subtle">
              <span className="min-w-0 flex-1 truncate num" title={db.path}>
                {db.path}
              </span>
              <CopyButton value={db.path} label="Copy database path" />
            </div>
            <h4 className="mt-4 mb-1.5 label-caps">Rows per table</h4>
            <ul className="space-y-1">
              {tables.map(([name, rows]) => (
                <li
                  key={name}
                  className="relative flex items-center justify-between gap-3 overflow-hidden rounded px-1.5 py-0.5 text-xs"
                >
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 rounded bg-fg/[0.05]"
                    style={{ width: `${maxRows ? Math.max(1, (rows / maxRows) * 100) : 0}%` }}
                  />
                  <span className="relative num text-fg-muted">{name}</span>
                  <Tooltip content={`${formatInt(rows)} rows`}>
                    <span tabIndex={0} className="relative num text-fg">
                      {formatCompact(rows)}
                    </span>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------- websocket

export function WebSocketCard({ system }: { system: SystemHealth | undefined }) {
  const connection = useConnection();
  const now = useNow();
  const meta = CONNECTION_META[connection.status];
  const ws = system?.components.find((c) => c.key === "websocket");
  const dropped = ws?.details.frames_dropped;
  return (
    <Card>
      <CardHeader
        title="Live updates"
        icon={Radio}
        subtitle="WebSocket hub and this browser's connection"
        info="The API pushes every event, status, price and portfolio change over one WebSocket per dashboard. After a drop the browser reconnects with backoff and replays the events it missed."
      />
      <CardBody className="space-y-4">
        <dl className="grid grid-cols-3 gap-3">
          <KeyValue
            label="Clients"
            value={system ? formatInt(system.websocket_clients) : DASH}
            info="Dashboards connected right now."
          />
          <KeyValue
            label="Frames sent"
            value={system ? formatCompact(system.websocket_messages_sent) : DASH}
            info="Since the API started."
          />
          <KeyValue
            label="Dropped"
            value={typeof dropped === "number" ? formatInt(dropped) : DASH}
            info="Ticker / candle frames dropped for slow clients (prices catch up on the next frame)."
          />
        </dl>
        <div className="rounded-lg border border-line-subtle bg-surface-2/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="label-caps">This browser</span>
            <Badge
              tone={meta.tone}
              icon={meta.icon}
              size="sm"
              className={
                connection.status === "connecting" || connection.status === "reconnecting"
                  ? "[&_svg]:animate-spin"
                  : undefined
              }
            >
              {meta.label}
            </Badge>
          </div>
          <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2.5">
            <KeyValue
              label="Connected"
              value={
                connection.connectedAt
                  ? formatAgo((now - connection.connectedAt) / 1_000).replace(" ago", "")
                  : DASH
              }
              sub={connection.connectedAt ? "session length" : undefined}
            />
            <KeyValue
              label="Last frame"
              value={
                connection.lastFrameAt ? formatAgo(Math.max(0, (now - connection.lastFrameAt) / 1_000)) : DASH
              }
            />
            <KeyValue label="Reconnects" value={formatInt(connection.reconnects)} />
            <KeyValue
              label="Next retry"
              value={
                connection.nextRetryAt && connection.status !== "live"
                  ? formatAgo((now - connection.nextRetryAt) / 1_000)
                  : DASH
              }
            />
          </dl>
          {connection.status !== "live" ? (
            <Button
              size="xs"
              variant="secondary"
              leftIcon={RotateCw}
              className="mt-3"
              onClick={connection.retryNow}
            >
              Reconnect now
            </Button>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------- recent issues

export function RecentIssuesCard({ system, isPending, error, onRetry }: PanelProps) {
  const issues = system?.recent_issues ?? [];
  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title="Recent issues"
        icon={ShieldAlert}
        subtitle="Latest warnings and errors"
        badge={
          issues.length ? (
            <Badge tone="warning" size="xs">
              {issues.length}
            </Badge>
          ) : undefined
        }
      />
      <div className="max-h-[360px] min-h-0 overflow-y-auto px-2 pb-2">
        {error && !system ? (
          <ErrorState compact error={error} onRetry={onRetry} className="mx-2" />
        ) : isPending || !system ? (
          <div className="space-y-3 px-2.5 py-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : issues.length === 0 ? (
          <EmptyState
            size="sm"
            icon={HEALTH_STATE_META.operational.icon}
            title="All quiet"
            description="No warnings or errors recently. Risk warnings, API errors and system warnings show up here."
          />
        ) : (
          issues.map((event) => <EventRow key={event.id} event={event} compact showDate />)
        )}
      </div>
    </Card>
  );
}
