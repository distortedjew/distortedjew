import {
  Activity,
  Gauge,
  Layers,
  Percent,
  Repeat,
  TrendingDown,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { RISK_METER_STATUS_META } from "@/lib/constants";
import { TONE_BG, TONE_TEXT } from "@/lib/tones";
import type { RiskMeter, RiskMeterStatus } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import {
  CRITICAL_AT_PCT,
  METER_INFO,
  WARNING_AT_PCT,
  effectiveStatus,
  formatMeterValue,
  formatUtilization,
  meterFill,
  meterMessage,
  statusTone,
} from "./risk-logic";

const METER_ICON: Record<RiskMeter["key"], LucideIcon> = {
  daily_loss: Wallet,
  daily_risk: Gauge,
  drawdown: TrendingDown,
  exposure: Layers,
  positions: Activity,
  consecutive_losses: Repeat,
};

/** Track = a lighter step of the fill's own hue, so the state reads across the whole bar. */
const TRACK: Record<RiskMeterStatus, string> = {
  ok: "bg-accent/15",
  warning: "bg-warning/15",
  critical: "bg-down/15",
  breached: "bg-down/20",
};

/** The bar with threshold ticks at 70 % and 90 % (warning / critical) and, optionally, their labels. */
export function MeterTrack({
  meter,
  size = "md",
  showScale = false,
}: {
  meter: RiskMeter;
  size?: "sm" | "md";
  showScale?: boolean;
}) {
  const status = effectiveStatus(meter);
  const tone = statusTone(status);
  const fill = meterFill(meter.utilization_pct);
  return (
    <div>
      <div
        role="progressbar"
        aria-label={meter.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fill)}
        aria-valuetext={`${formatMeterValue(meter)}, ${formatUtilization(meter.utilization_pct)} of the limit, ${RISK_METER_STATUS_META[status].label}`}
        className={cn(
          "relative w-full rounded-full",
          size === "md" ? "h-3" : "h-2",
          TRACK[status],
          status === "breached" && "ring-1 ring-down/50",
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width,background-color] duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]",
            TONE_BG[tone],
            status === "breached" &&
              "bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(255_255_255/0.22)_6px_9px)]",
          )}
          style={{ width: `${fill}%` }}
        />
        {[WARNING_AT_PCT, CRITICAL_AT_PCT].map((at) => (
          <span
            key={at}
            aria-hidden
            className="absolute inset-y-[-2px] w-px bg-fg/45"
            style={{ left: `${at}%` }}
          />
        ))}
      </div>
      {showScale ? (
        <div aria-hidden className="relative mt-1 h-3 text-[10px] leading-3 text-fg-subtle">
          <span className="absolute left-0">0</span>
          {[WARNING_AT_PCT, CRITICAL_AT_PCT].map((at) => (
            <span key={at} className="absolute -translate-x-1/2 num" style={{ left: `${at}%` }}>
              {at}%
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One risk meter in the spirit of
 *   DAILY LOSS  $180 / $200  ███████████░░  90%  ⚠ APPROACHING DAILY LIMIT
 * Tone follows the status (ok · warning · critical · breached); a breached meter turns the whole
 * card red with an icon and the engine's message so it cannot be missed.
 */
export function RiskMeterBar({ meter, className }: { meter: RiskMeter; className?: string }) {
  const status = effectiveStatus(meter);
  const tone = statusTone(status);
  const meta = RISK_METER_STATUS_META[status];
  const message = meterMessage(meter);
  const Icon = METER_ICON[meter.key] ?? Percent;
  const MessageIcon = meta.icon;
  const breached = status === "breached";
  return (
    <div
      data-status={status}
      className={cn(
        "rounded-xl p-3.5 ring-1 transition-colors duration-300 ring-inset",
        breached
          ? "bg-down/10 ring-down/50"
          : status === "critical"
            ? "bg-down/[0.06] ring-down/30"
            : status === "warning"
              ? "bg-warning/[0.06] ring-warning/30"
              : "bg-surface-2/60 ring-line-subtle",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-md",
              status === "ok" ? "bg-fg/[0.06] text-fg-muted" : cn("bg-fg/[0.06]", TONE_TEXT[tone]),
            )}
          >
            <Icon className="size-3.5" aria-hidden />
          </span>
          <h4 className="truncate label-caps">{meter.label}</h4>
          <InfoTooltip content={METER_INFO[meter.key]} label={`About ${meter.label}`} />
        </div>
        <Badge tone={status === "ok" ? "up" : tone} size="xs" icon={meta.icon} caps>
          {meta.label}
        </Badge>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <span className="num text-[19px] leading-7 font-semibold text-fg">{formatMeterValue(meter)}</span>
        <span
          className={cn(
            "num text-lg leading-7 font-semibold",
            status === "ok" ? "text-fg-muted" : TONE_TEXT[tone],
          )}
        >
          {formatUtilization(meter.utilization_pct)}
        </span>
      </div>

      <div className="mt-2">
        <MeterTrack meter={meter} showScale />
      </div>

      <div className="mt-2 min-h-5 text-xs" aria-live={breached ? "assertive" : "off"}>
        {message ? (
          <p className={cn("flex items-center gap-1.5 font-semibold tracking-[0.02em]", TONE_TEXT[tone])}>
            <MessageIcon className={cn("size-3.5 shrink-0", breached && "animate-pulse")} aria-hidden />
            <span>{message}</span>
          </p>
        ) : (
          <p className="text-fg-subtle">Within limit</p>
        )}
      </div>
    </div>
  );
}

/** Compact meter row (Overview card): label, value, thin bar with ticks, message when not ok. */
export function RiskMeterRow({ meter }: { meter: RiskMeter }) {
  const status = effectiveStatus(meter);
  const tone = statusTone(status);
  const message = meterMessage(meter);
  const meta = RISK_METER_STATUS_META[status];
  return (
    <div data-status={status}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
        <span className="flex min-w-0 items-center gap-1.5 text-fg-muted">
          {status !== "ok" ? (
            <meta.icon className={cn("size-3 shrink-0", TONE_TEXT[tone])} aria-hidden />
          ) : null}
          <span className="truncate">{meter.label}</span>
        </span>
        <span className="shrink-0 num text-fg">
          {formatMeterValue(meter)}
          <span className={cn("ml-1.5", status === "ok" ? "text-fg-subtle" : TONE_TEXT[tone])}>
            {formatUtilization(meter.utilization_pct)}
          </span>
        </span>
      </div>
      <MeterTrack meter={meter} size="sm" />
      {message ? (
        <p className={cn("mt-1 text-[11px] font-semibold tracking-[0.02em]", TONE_TEXT[tone])}>{message}</p>
      ) : null}
    </div>
  );
}
