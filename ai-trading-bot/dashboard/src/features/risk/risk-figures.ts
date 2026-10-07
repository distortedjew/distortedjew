import { formatInt, formatPct, formatUsd } from "@/lib/format";
import type { RiskSnapshot } from "@/types";
import type { StatItem } from "@/components/ui/KeyValue";
import { effectiveStatus } from "./risk-logic";

export interface RiskFigureGroup {
  title: string;
  items: StatItem[];
}

/** Every risk figure as a labelled number (the meters show the same data against its limits). */
export function riskMetricGroups(risk: RiskSnapshot): RiskFigureGroup[] {
  const meter = (key: string) => risk.meters.find((m) => m.key === key);
  const dailyRisk = meter("daily_risk")?.current ?? risk.daily_loss + risk.open_risk;
  const lossStreak = meter("consecutive_losses");
  const streakTone = lossStreak && effectiveStatus(lossStreak) !== "ok" ? "down" : undefined;
  return [
    {
      title: "Exposure and risk",
      items: [
        {
          label: "Current exposure",
          info: "Total notional of open positions. The percentage is relative to equity and may exceed 100 % because the paper account can hold leveraged positions.",
          value: formatUsd(risk.current_exposure),
          sub: `${formatPct(risk.current_exposure_pct, { decimals: 1 })} of equity · limit ${formatPct(risk.max_exposure_pct, { decimals: 0 })}`,
        },
        {
          label: "Risk per trade",
          info: "How much equity the bot risks on each new trade (distance to the stop × size).",
          value: formatPct(risk.risk_per_trade_pct),
          sub: `≈ ${formatUsd((risk.equity * risk.risk_per_trade_pct) / 100)} at current equity`,
        },
        {
          label: "Open risk",
          info: "Sum of the money at risk on open positions: what would be lost if every stop were hit.",
          value: formatUsd(risk.open_risk),
          sub: `${formatPct(risk.open_risk_pct)} of equity`,
        },
        {
          label: "Daily risk",
          info: "Today's loss plus open risk, measured against the daily loss budget.",
          value: formatUsd(dailyRisk),
          sub: `of ${formatUsd(risk.max_daily_loss, { decimals: 0 })} budget`,
        },
      ],
    },
    {
      title: "Loss limits",
      items: [
        {
          label: "Daily loss",
          info: "Loss since 00:00 UTC: max(0, −today's P&L).",
          value: formatUsd(risk.daily_loss),
          tone: risk.daily_loss > 0 ? "down" : undefined,
          sub: `today's P&L ${formatUsd(risk.daily_pnl, { signed: true })}`,
        },
        {
          label: "Maximum daily loss",
          info: "At this loss the bot closes everything and halts until the next UTC day.",
          value: formatUsd(risk.max_daily_loss, { decimals: 0 }),
        },
        {
          label: "Drawdown",
          info: "Current distance of equity below its peak (0 % at a new high).",
          value: formatPct(risk.drawdown_pct),
          tone: risk.drawdown_pct < -0.005 ? "down" : undefined,
          sub: `halts new entries at −${formatPct(risk.max_drawdown_limit_pct, { decimals: 0 })}`,
        },
        {
          label: "Maximum drawdown",
          info: "The worst drawdown observed so far (not the limit; the limit is shown underneath).",
          value: formatPct(risk.max_drawdown_pct),
          tone: risk.max_drawdown_pct < -0.005 ? "down" : undefined,
          sub: `limit −${formatPct(risk.max_drawdown_limit_pct, { decimals: 0 })}`,
        },
      ],
    },
    {
      title: "Positions and streaks",
      items: [
        { label: "Open positions", info: "Positions currently open.", value: formatInt(risk.open_positions) },
        {
          label: "Maximum positions",
          info: "The most positions the bot may hold at once.",
          value: formatInt(risk.max_positions),
        },
        {
          label: "Consecutive losses",
          info: "Losing trades in a row; a win resets the count.",
          value: formatInt(risk.consecutive_losses),
          tone: streakTone,
        },
        {
          label: "Max consecutive losses",
          info: "Reaching this streak pauses new entries for the cooldown period.",
          value: formatInt(risk.max_consecutive_losses),
        },
      ],
    },
  ];
}
