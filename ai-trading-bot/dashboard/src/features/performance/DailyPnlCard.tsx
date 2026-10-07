import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartColumn } from "lucide-react";
import { useIsMobile } from "@/hooks/use-media-query";
import { formatDate, formatInt, formatPct, formatPnl } from "@/lib/format";
import type { DailyPnl, PerformanceReport } from "@/types";
import {
  BAR_RADIUS_SIGNED,
  CHART_MARGIN,
  ChartCard,
  ChartTooltipContent,
  MAX_BAR_SIZE,
  barCursor,
  gridProps,
  signColor,
  tickFormatters,
  useChartAnimation,
  useChartTheme,
  xAxisProps,
  yAxisProps,
  zeroLineProps,
} from "@/components/charts";
import { PnlText } from "@/components/ui/PnlText";
import { ChartTable } from "./parts";

/** Daily realised P&L bars, green above zero and red below (tooltip: trades and equity return). */
export function DailyPnlCard({
  report,
  loading,
  fetching,
  error,
  onRetry,
}: {
  report: PerformanceReport | undefined;
  loading?: boolean;
  fetching?: boolean;
  error?: unknown;
  onRetry?: () => void;
}) {
  const theme = useChartTheme();
  const anim = useChartAnimation();
  const mobile = useIsMobile();
  const days = report?.daily_pnl ?? [];
  const green = days.filter((d) => d.pnl > 0).length;
  const red = days.filter((d) => d.pnl < 0).length;
  const best = days.reduce<DailyPnl | undefined>((b, d) => (!b || d.pnl > b.pnl ? d : b), undefined);
  const worst = days.reduce<DailyPnl | undefined>((b, d) => (!b || d.pnl < b.pnl ? d : b), undefined);

  return (
    <ChartCard
      title="Daily P&L"
      subtitle={days.length ? `${green} green · ${red} red days` : undefined}
      info="Realised profit and loss of the trades that closed on each UTC day, net of fees. The tooltip also shows that day's equity return and trade count."
      icon={ChartColumn}
      height={mobile ? 220 : 250}
      loading={loading}
      fetching={fetching}
      error={error}
      onRetry={onRetry}
      empty={
        days.length === 0
          ? {
              title: "No closed trades in this range yet",
              description: "Daily results appear after the bot closes its first trade.",
            }
          : false
      }
      table={
        <ChartTable<DailyPnl>
          caption="Daily profit and loss"
          rows={[...days].reverse()}
          rowKey={(d) => d.date}
          columns={[
            { header: "Date", cell: (d) => formatDate(d.date) },
            { header: "Trades", align: "right", cell: (d) => formatInt(d.trades) },
            { header: "P&L", align: "right", cell: (d) => <PnlText value={d.pnl} /> },
            { header: "Return", align: "right", cell: (d) => formatPct(d.return_pct, { signed: true }) },
          ]}
        />
      }
      footer={
        best && worst ? (
          <span className="flex flex-wrap gap-x-4 gap-y-1 num">
            <span>
              Best day {formatDate(best.date)} <PnlText value={best.pnl} />
            </span>
            <span>
              Worst day {formatDate(worst.date)} <PnlText value={worst.pnl} />
            </span>
          </span>
        ) : undefined
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={days} margin={CHART_MARGIN}>
          <CartesianGrid {...gridProps(theme)} />
          <XAxis dataKey="date" {...xAxisProps(theme)} tickFormatter={tickFormatters.dateFromIso} />
          <YAxis {...yAxisProps(theme)} tickFormatter={tickFormatters.pnlCompact} />
          <ReferenceLine {...zeroLineProps(theme)} />
          <Tooltip
            cursor={barCursor(theme)}
            isAnimationActive={false}
            content={
              <ChartTooltipContent
                indicator="square"
                valueFormatter={(v) => formatPnl(v)}
                labelFormatter={(d) => formatDate(String(d))}
                footer={(items) => {
                  const d = items[0]?.payload as DailyPnl | undefined;
                  if (!d) return null;
                  return (
                    <span className="num">
                      {formatPct(d.return_pct, { signed: true })} return · {formatInt(d.trades)}{" "}
                      {d.trades === 1 ? "trade" : "trades"}
                    </span>
                  );
                }}
              />
            }
          />
          <Bar dataKey="pnl" name="P&L" radius={BAR_RADIUS_SIGNED} maxBarSize={MAX_BAR_SIZE} {...anim}>
            {days.map((d) => (
              <Cell key={d.date} fill={signColor(theme, d.pnl)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
