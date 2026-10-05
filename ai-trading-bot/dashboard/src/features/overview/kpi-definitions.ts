/**
 * The eight portfolio KPIs: how each is formatted, compared and explained.
 * Definitions follow the API (backend analytics): value, previous-period comparison
 * (`comparison_label` from the API) and the sparkline window.
 */
import { formatInt, formatPct, formatPnl, formatRatio, formatUsd } from "@/lib/format";
import type { KpiKey, Tone } from "@/types";
import type { DeltaFormat } from "@/components/ui/DeltaBadge";

export type KpiFormat = "currency" | "pnl" | "percent" | "ratio" | "count" | "drawdown";

export interface KpiDefinition {
  key: KpiKey;
  label: string;
  format: KpiFormat;
  /** How the change vs the previous period is printed. */
  deltaFormat: DeltaFormat;
  /** Also print the relative change (%) next to the absolute change. */
  showChangePct: boolean;
  /** Lower is better (flips the delta tone). */
  invertDelta?: boolean;
  /** Color the value itself by its sign (P&L). */
  signedValue?: boolean;
  sparkVariant: "line" | "bars";
  /** Sparkline color: "auto" = trend direction; a tone for neutral series (counts). */
  sparkTone: Tone | "auto";
  /** ⓘ tooltip text. */
  description: string;
  /** What the sparkline covers (shown in the tooltip). */
  sparkWindow: string;
}

export const KPI_ORDER: KpiKey[] = [
  "equity",
  "today_pnl",
  "total_pnl",
  "win_rate",
  "profit_factor",
  "max_drawdown",
  "open_positions",
  "trades_today",
];

export const KPI_DEFINITIONS: Record<KpiKey, KpiDefinition> = {
  equity: {
    key: "equity",
    label: "Portfolio equity",
    format: "currency",
    deltaFormat: "currency",
    showChangePct: true,
    sparkVariant: "line",
    sparkTone: "auto",
    description: "Current equity: cash plus the unrealized P&L of open positions, in USDT. Compared with 24 hours ago.",
    sparkWindow: "Equity over the last 24 hours.",
  },
  today_pnl: {
    key: "today_pnl",
    label: "Today's P&L",
    format: "pnl",
    deltaFormat: "currency",
    showChangePct: false,
    signedValue: true,
    sparkVariant: "bars",
    sparkTone: "auto",
    description:
      "Profit or loss today (UTC day): realized P&L of trades closed today plus the change in unrealized P&L since midnight UTC. Compared with yesterday.",
    sparkWindow: "Daily P&L over the last 14 days.",
  },
  total_pnl: {
    key: "total_pnl",
    label: "Total P&L",
    format: "pnl",
    deltaFormat: "currency",
    showChangePct: false,
    signedValue: true,
    sparkVariant: "line",
    sparkTone: "auto",
    description:
      "Everything the bot has made or lost since it started: equity minus the starting balance, after fees. Compared with 24 hours ago.",
    sparkWindow: "Total P&L over the last 30 days.",
  },
  win_rate: {
    key: "win_rate",
    label: "Win rate",
    format: "percent",
    deltaFormat: "pp",
    showChangePct: false,
    sparkVariant: "line",
    sparkTone: "auto",
    description:
      "Share of trades closed in the last 7 days that made money after fees. Compared with the prior 7 days, in percentage points (pp).",
    sparkWindow: "Daily win rate over the last 14 days.",
  },
  profit_factor: {
    key: "profit_factor",
    label: "Profit factor",
    format: "ratio",
    deltaFormat: "ratio",
    showChangePct: false,
    sparkVariant: "line",
    sparkTone: "auto",
    description:
      "Gross profit ÷ gross loss over the last 7 days. Above 1.0 means winners outweigh losers. Compared with the prior 7 days.",
    sparkWindow: "Rolling profit factor over the last 14 days.",
  },
  max_drawdown: {
    key: "max_drawdown",
    label: "Max drawdown",
    format: "drawdown",
    deltaFormat: "pp",
    showChangePct: false,
    sparkVariant: "line",
    sparkTone: "auto",
    description:
      "Worst peak-to-trough fall in equity since the bot started (0 % or below; more negative is worse). Compared with 7 days ago.",
    sparkWindow: "Max drawdown over the last 30 days.",
  },
  open_positions: {
    key: "open_positions",
    label: "Open positions",
    format: "count",
    deltaFormat: "count",
    showChangePct: false,
    sparkVariant: "bars",
    sparkTone: "accent",
    description: "Positions open right now, compared with 24 hours ago.",
    sparkWindow: "Open positions per hour over the last 24 hours.",
  },
  trades_today: {
    key: "trades_today",
    label: "Trades today",
    format: "count",
    deltaFormat: "count",
    showChangePct: false,
    sparkVariant: "bars",
    sparkTone: "accent",
    description: "Positions opened today (UTC day), compared with yesterday.",
    sparkWindow: "Entries per day over the last 14 days.",
  },
};

/** Format a KPI value for display. */
export function formatKpiValue(format: KpiFormat, value: number): string {
  switch (format) {
    case "currency":
      return formatUsd(value);
    case "pnl":
      return formatPnl(value);
    case "percent":
      return formatPct(value, { decimals: 1 });
    case "drawdown":
      return formatPct(value, { decimals: 2 });
    case "ratio":
      return formatRatio(value);
    case "count":
      return formatInt(value);
  }
}
