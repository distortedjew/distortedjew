import { BarChart3 } from "lucide-react";
import { Bar, BarChart, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useIsMobile } from "@/hooks/use-media-query";
import { formatInt } from "@/lib/format";
import type { DistributionBin, PerformanceReport } from "@/types";
import {
  BAR_RADIUS,
  CHART_MARGIN,
  ChartCard,
  ChartTooltipContent,
  MAX_BAR_SIZE,
  barCursor,
  gridProps,
  toneColor,
  useChartAnimation,
  useChartTheme,
  xAxisProps,
  yAxisProps,
} from "@/components/charts";
import { ChartTable } from "./parts";
import { binTone, shortBinLabel } from "./performance-logic";

/** Histogram of per-trade return (% of notional); losses red, gains green, split at zero. */
export function DistributionCard({
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
  const bins = (report?.distribution ?? []).map((b) => ({ ...b, short: shortBinLabel(b) }));
  const total = bins.reduce((n, b) => n + b.count, 0);

  return (
    <ChartCard
      title="P&L distribution"
      subtitle="Closed trades by return (% of notional)"
      info="How many trades ended in each return bucket. A healthy bot has its mass right of zero or a few big winners on the right tail; a long left tail means occasional large losses."
      icon={BarChart3}
      height={mobile ? 210 : 230}
      loading={loading}
      fetching={fetching}
      error={error}
      onRetry={onRetry}
      empty={
        total === 0
          ? {
              title: "No closed trades in this range yet",
              description: "The histogram fills in as trades close.",
            }
          : false
      }
      table={
        <ChartTable<DistributionBin>
          caption="Trade return distribution"
          rows={report?.distribution ?? []}
          rowKey={(b) => b.label}
          columns={[
            { header: "Return bucket", cell: (b) => b.label },
            { header: "Trades", align: "right", cell: (b) => formatInt(b.count) },
          ]}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={bins} margin={CHART_MARGIN} barCategoryGap={mobile ? 2 : 4}>
          <CartesianGrid {...gridProps(theme)} />
          <XAxis
            dataKey="short"
            {...xAxisProps(theme)}
            interval="preserveStartEnd"
            minTickGap={mobile ? 14 : 8}
          />
          <YAxis {...yAxisProps(theme)} width={36} allowDecimals={false} />
          <Tooltip
            cursor={barCursor(theme)}
            isAnimationActive={false}
            content={
              <ChartTooltipContent
                indicator="square"
                hideLabel={false}
                valueFormatter={(v) => `${formatInt(v)} ${v === 1 ? "trade" : "trades"}`}
                labelFormatter={(_, payload) =>
                  String((payload[0]?.payload as { label?: string } | undefined)?.label ?? "")
                }
              />
            }
          />
          <Bar dataKey="count" name="Trades" radius={BAR_RADIUS} maxBarSize={MAX_BAR_SIZE} {...anim}>
            {bins.map((b) => (
              <Cell key={b.label} fill={toneColor(theme, binTone(b))} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
