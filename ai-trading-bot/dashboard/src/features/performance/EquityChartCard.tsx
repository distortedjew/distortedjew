import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LineChart } from "lucide-react";
import { useMemo } from "react";
import { useIsMobile } from "@/hooks/use-media-query";
import { formatDateTime, formatPct, formatPnl, formatUsd } from "@/lib/format";
import type { EquityPoint, PerformanceReport } from "@/types";
import {
  CHART_MARGIN,
  ChartCard,
  ChartTooltipContent,
  gridProps,
  lineCursor,
  tickFormatters,
  useChartAnimation,
  useChartTheme,
  xAxisProps,
  yAxisProps,
} from "@/components/charts";
import { curveSpanDays, thinRows } from "./performance-logic";
import { ChartTable } from "./parts";

const Y_AXIS_WIDTH = 58;

/**
 * Equity curve (area, crosshair tooltip, starting-balance reference line) with the drawdown
 * ("underwater") curve in a second, synced chart underneath — one y-axis per chart.
 */
export function EquityChartCard({
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
  const curve = useMemo(() => report?.equity_curve ?? [], [report]);
  const start = report?.starting_equity ?? 0;
  const last = curve[curve.length - 1];
  const spanDays = curveSpanDays(curve);
  const xTick = spanDays <= 1.5 ? tickFormatters.timeFromUnix : tickFormatters.dateFromUnix;
  const totalHeight = mobile ? 330 : 400;
  const drawdownHeight = mobile ? 96 : 118;

  const worst = useMemo(() => Math.min(0, ...curve.map((p) => p.drawdown_pct)), [curve]);
  const tableRows = useMemo(() => thinRows(curve, 200), [curve]);

  const net = report ? report.metrics.net_profit : 0;
  const subtitle = report
    ? `${formatPnl(net)} (${formatPct(report.metrics.total_return_pct, { signed: true })}) from ${formatUsd(start, { decimals: 0 })}`
    : undefined;

  return (
    <ChartCard
      title="Equity curve"
      subtitle={subtitle}
      info="Portfolio value over time: cash plus unrealised P&L, snapshotted every minute and on every closed trade. The lower chart shows how far equity sits below its running peak."
      icon={LineChart}
      height={totalHeight}
      loading={loading}
      fetching={fetching}
      error={error}
      onRetry={onRetry}
      empty={
        curve.length < 2
          ? {
              title: "No equity history in this range yet",
              description:
                "Equity is recorded every minute and on each closed trade; the curve appears after the first points.",
            }
          : false
      }
      table={
        <ChartTable<EquityPoint>
          caption="Equity and drawdown over time"
          rows={tableRows}
          rowKey={(p) => String(p.time)}
          columns={[
            { header: "Time", cell: (p) => formatDateTime(p.time * 1000, { seconds: false }) },
            { header: "Equity", align: "right", cell: (p) => formatUsd(p.equity) },
            { header: "Drawdown", align: "right", cell: (p) => formatPct(p.drawdown_pct) },
          ]}
        />
      }
    >
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1" role="img" aria-label={`Equity curve, ${subtitle ?? ""}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={curve} syncId="equity" margin={{ ...CHART_MARGIN, top: 10 }}>
              <CartesianGrid {...gridProps(theme)} />
              <XAxis dataKey="time" type="number" domain={["dataMin", "dataMax"]} hide />
              <YAxis
                {...yAxisProps(theme)}
                width={Y_AXIS_WIDTH}
                domain={["auto", "auto"]}
                tickFormatter={tickFormatters.usdCompact}
              />
              <ReferenceLine
                y={start}
                stroke={theme.textMuted}
                strokeOpacity={0.55}
                strokeWidth={1}
                ifOverflow="extendDomain"
                label={{
                  value: `Start ${formatUsd(start, { decimals: 0 })}`,
                  position: "insideBottomLeft",
                  fill: theme.axis,
                  fontSize: 10.5,
                  fontFamily: theme.monoFamily,
                }}
              />
              <Tooltip
                cursor={lineCursor(theme)}
                isAnimationActive={false}
                content={
                  <ChartTooltipContent
                    valueFormatter={(v) => formatUsd(v)}
                    labelFormatter={(t) => formatDateTime(Number(t) * 1000, { seconds: false })}
                    footer={(items) => {
                      const p = items[0]?.payload as EquityPoint | undefined;
                      if (!p) return null;
                      const diff = p.equity - start;
                      return (
                        <div className="space-y-0.5 num">
                          <div className="flex justify-between gap-4">
                            <span className="text-fg-subtle">vs start</span>
                            <span>{formatPnl(diff)}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-fg-subtle">Drawdown</span>
                            <span>{formatPct(p.drawdown_pct)}</span>
                          </div>
                        </div>
                      );
                    }}
                  />
                }
              />
              <Area
                type="linear"
                dataKey="equity"
                name="Equity"
                stroke={theme.series[0]}
                fill={theme.series[0]}
                fillOpacity={0.1}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: theme.series[0], stroke: theme.background, strokeWidth: 2 }}
                {...anim}
              />
              {last ? (
                <ReferenceDot
                  x={last.time}
                  y={last.equity}
                  r={4}
                  fill={theme.series[0]}
                  stroke={theme.background}
                  strokeWidth={2}
                  ifOverflow="extendDomain"
                />
              ) : null}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div
          className="shrink-0"
          style={{ height: drawdownHeight }}
          role="img"
          aria-label={`Drawdown, worst ${formatPct(worst)}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={curve} syncId="equity" margin={{ ...CHART_MARGIN, top: 4 }}>
              <CartesianGrid {...gridProps(theme)} />
              <XAxis
                dataKey="time"
                type="number"
                domain={["dataMin", "dataMax"]}
                {...xAxisProps(theme)}
                tickFormatter={xTick}
              />
              <YAxis
                {...yAxisProps(theme)}
                width={Y_AXIS_WIDTH}
                domain={[(min: number) => Math.min(min, -1), 0]}
                tickCount={3}
                tickFormatter={tickFormatters.pct}
              />
              <Tooltip cursor={lineCursor(theme)} isAnimationActive={false} content={() => null} />
              <Area
                type="linear"
                dataKey="drawdown_pct"
                name="Drawdown"
                baseValue={0}
                stroke={theme.down}
                fill={theme.down}
                fillOpacity={0.14}
                strokeWidth={1.5}
                dot={false}
                activeDot={false}
                {...anim}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </ChartCard>
  );
}
