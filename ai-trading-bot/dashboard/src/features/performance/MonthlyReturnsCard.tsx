import { CalendarDays } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { formatInt, formatPct, formatPnl } from "@/lib/format";
import type { MonthlyReturn, PerformanceReport } from "@/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tooltip } from "@/components/ui/Tooltip";
import { MONTH_NAMES, groupMonthly, heatIntensity, type MonthCell } from "./performance-logic";

function cellStyle(value: number, maxAbs: number) {
  const strength = Math.round(heatIntensity(value, maxAbs) * 48);
  const token = value >= 0 ? "--up" : "--down";
  return { backgroundColor: `color-mix(in oklab, var(${token}) ${strength}%, transparent)` };
}

/** Calendar heatmap of monthly returns (sign + colour; each cell has a tooltip with P&L and trades). */
export function MonthlyReturnsCard({
  report,
  loading,
}: {
  report: PerformanceReport | undefined;
  loading?: boolean;
}) {
  const monthly = report?.monthly;
  const { rows, maxAbs, best, worst, positive, count } = useMemo(() => {
    const all = monthly ?? [];
    const months = all.map((m) => m.month).sort();
    const first = months[0];
    const last = months[months.length - 1];
    const rows = groupMonthly(all).map((row) => ({
      ...row,
      cells: row.cells.filter((c) => c.month >= first && c.month <= last),
    }));
    const best = all.reduce<MonthlyReturn | undefined>(
      (b, m) => (!b || m.return_pct > b.return_pct ? m : b),
      undefined,
    );
    const worst = all.reduce<MonthlyReturn | undefined>(
      (b, m) => (!b || m.return_pct < b.return_pct ? m : b),
      undefined,
    );
    const positive = all.filter((m) => m.return_pct > 0).length;
    return {
      rows,
      maxAbs: Math.max(0, ...all.map((m) => Math.abs(m.return_pct))),
      best,
      worst,
      positive,
      count: all.length,
    };
  }, [monthly]);

  return (
    <Card>
      <CardHeader
        title="Monthly returns"
        icon={CalendarDays}
        subtitle="Equity change per calendar month (UTC)"
        info="Return of each calendar month: month-end equity ÷ previous month-end equity − 1 (the first month starts from the starting balance). Green is a gain, red a loss; the sign is always printed."
      />
      <CardBody>
        {loading || !report ? (
          <div
            className="grid grid-cols-3 gap-1.5 sm:grid-cols-6"
            aria-busy="true"
            aria-label="Loading monthly returns"
          >
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            size="sm"
            title="No monthly returns yet"
            description="Monthly figures appear once the bot has equity history."
          />
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.year}>
                <div className="mb-1.5 text-xs font-medium text-fg-muted">{row.year}</div>
                <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6">
                  {row.cells.map((cell) => (
                    <li key={cell.month}>
                      <MonthTile cell={cell} maxAbs={maxAbs} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {best && worst ? (
              <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-line ring-1 ring-line">
                {[
                  ["Best month", `${formatPct(best.return_pct, { signed: true, decimals: 1 })}`, best.month],
                  [
                    "Worst month",
                    `${formatPct(worst.return_pct, { signed: true, decimals: 1 })}`,
                    worst.month,
                  ],
                  ["Positive months", `${positive} / ${count}`, "of months with data"],
                ].map(([label, value, sub]) => (
                  <div key={label} className="bg-surface px-3 py-2">
                    <dt className="text-xs text-fg-subtle">{label}</dt>
                    <dd className="num text-dense font-semibold text-fg">{value}</dd>
                    <dd className="num text-2xs text-fg-subtle">{sub}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function MonthTile({ cell, maxAbs }: { cell: MonthCell; maxAbs: number }) {
  const name = MONTH_NAMES[cell.index - 1];
  const d = cell.data;
  return (
    <Tooltip
      content={
        d ? (
          <span className="block num text-[11px] leading-4">
            {name} {cell.month.slice(0, 4)}: {formatPct(d.return_pct, { signed: true })}
            <span className="block text-fg-subtle">
              {formatPnl(d.pnl)} · {formatInt(d.trades)} {d.trades === 1 ? "trade" : "trades"}
            </span>
          </span>
        ) : (
          `${name}: no data`
        )
      }
    >
      <div
        tabIndex={0}
        aria-label={
          d
            ? `${name} ${cell.month.slice(0, 4)}: ${formatPct(d.return_pct, { signed: true })}, ${formatPnl(d.pnl)} from ${d.trades} trades`
            : `${name}: no data`
        }
        className={cn(
          "flex h-14 flex-col justify-between rounded-md px-2 py-1.5 ring-1 ring-line-subtle ring-inset focus-visible:outline-2 focus-visible:outline-accent/70",
          !d && "bg-fg/[0.03]",
        )}
        style={d ? cellStyle(d.return_pct, maxAbs) : undefined}
      >
        <span className="text-2xs text-fg-muted">{name}</span>
        <span className="num text-dense font-medium text-fg">
          {d ? formatPct(d.return_pct, { signed: true, decimals: 1 }) : "—"}
        </span>
      </div>
    </Tooltip>
  );
}
