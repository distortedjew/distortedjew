import { OctagonAlert, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDateTime, formatNumber, formatUsd } from "@/lib/format";
import { TONE_TEXT } from "@/lib/tones";
import { toMs, useNow } from "@/lib/time";
import type { RiskSnapshot } from "@/types";
import { LiveTag } from "@/components/layout/LiveTag";
import { RelativeTime } from "@/components/ui/Timestamp";
import {
  formatCountdown,
  formatMeterValue,
  deriveRiskState,
  secondsUntil,
  type RiskState,
} from "./risk-logic";

const LOOK: Record<RiskState, { box: string; chip: string; text: string; Icon: typeof ShieldCheck }> = {
  ok: { box: "bg-surface ring-line", chip: "bg-up/12 text-up", text: "text-up", Icon: ShieldCheck },
  caution: {
    box: "bg-warning/[0.05] ring-warning/30",
    chip: "bg-warning/14 text-warning",
    text: "text-warning",
    Icon: ShieldAlert,
  },
  limit: {
    box: "bg-down/[0.07] ring-down/45",
    chip: "bg-down/16 text-down",
    text: "text-down",
    Icon: TriangleAlert,
  },
  halted: {
    box: "bg-down/[0.10] ring-down/60",
    chip: "bg-down text-white",
    text: "text-down",
    Icon: OctagonAlert,
  },
};

/** Trading-allowed / halted status for the top of the Risk page. */
export function StatusHero({ risk }: { risk: RiskSnapshot }) {
  const now = useNow();
  const { state, breached, elevated } = deriveRiskState(risk);
  const look = LOOK[state];
  const remaining = secondsUntil(risk.halted_until, now);
  const untilMs = toMs(risk.halted_until);
  const halted = state === "halted";

  const title =
    state === "halted"
      ? "TRADING HALTED"
      : state === "limit"
        ? "Risk limit reached"
        : state === "caution"
          ? "Trading allowed — limits tightening"
          : "Trading allowed";

  const detail =
    state === "halted"
      ? (risk.halt_reason ?? "The risk manager has halted trading.")
      : state === "limit"
        ? `${breached.map((m) => `${m.label} ${formatMeterValue(m)}`).join(" · ")} — at the limit; the risk manager is enforcing it.`
        : state === "caution"
          ? `${elevated.map((m) => `${m.label} ${formatMeterValue(m)}`).join(" · ")} — approaching the limit.`
          : "Every risk limit is within bounds. The bot may open new positions that pass the risk checks.";

  return (
    <section
      aria-label="Trading status"
      role={halted ? "alert" : "status"}
      className={cn("relative overflow-hidden rounded-xl p-4 ring-1 ring-inset sm:p-5", look.box)}
    >
      {halted ? <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-down" /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", look.chip)}>
            <look.Icon className={cn("size-6", halted && "animate-pulse")} aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2
                className={cn(
                  "leading-7 font-semibold",
                  halted ? "text-xl tracking-[0.04em] sm:text-2xl" : "text-lg sm:text-xl",
                  state === "ok" ? "text-fg" : look.text,
                )}
              >
                {title}
              </h2>
              <LiveTag />
            </div>
            <p className="mt-1 max-w-2xl text-dense text-fg-muted">{detail}</p>
            {halted ? (
              <p className="mt-2 text-dense text-fg-muted">
                {remaining !== null ? (
                  <>
                    <span className={cn("num text-base font-semibold", TONE_TEXT.down)}>
                      Resumes in {formatCountdown(remaining)}
                    </span>
                    {untilMs ? (
                      <span className="num text-fg-subtle">
                        {" "}
                        · {formatDateTime(untilMs, { seconds: false })}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-fg-subtle">
                    No resume time set: trading stays halted until the condition clears.
                  </span>
                )}
                <span className="mt-1 block text-xs text-fg-subtle">
                  The engine will not open new positions while halted.
                </span>
              </p>
            ) : null}
          </div>
        </div>
        <dl className="grid shrink-0 grid-cols-3 gap-x-6 gap-y-1 text-xs sm:text-right">
          <div>
            <dt className="text-fg-subtle">Equity</dt>
            <dd className="num text-dense font-medium text-fg">{formatUsd(risk.equity)}</dd>
          </div>
          <div>
            <dt className="text-fg-subtle">Positions</dt>
            <dd className="num text-dense font-medium text-fg">
              {formatNumber(risk.open_positions, 0)} / {formatNumber(risk.max_positions, 0)}
            </dd>
          </div>
          <div>
            <dt className="text-fg-subtle">Updated</dt>
            <dd className="num text-dense font-medium text-fg">
              {toMs(risk.updated_at) ? <RelativeTime ms={toMs(risk.updated_at) as number} /> : "—"}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
