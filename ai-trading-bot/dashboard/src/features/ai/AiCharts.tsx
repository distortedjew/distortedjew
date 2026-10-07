import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { ChartCard } from "@/components/charts/ChartCard";
import { useChartTheme } from "@/components/charts/chart-theme";
import { ChartTooltipContent } from "@/components/charts/ChartTooltip";
import {
  BAR_RADIUS,
  CHART_MARGIN,
  gridProps,
  lineCursor,
  MAX_BAR_SIZE,
  tickFormatters,
  useChartAnimation,
  xAxisProps,
  yAxisProps,
  zeroLineProps,
} from "@/components/charts/recharts-config";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, formatInt, formatPct, formatPnl, formatSignedPct, isNum } from "@/lib/format";
import type { AIPerformancePoint, CalibrationPoint, ConfidenceBucket, ConfidencePoint } from "@/types";

const tableCls = "w-full text-xs [&_td]:py-1 [&_th]:pb-1 [&_th]:text-left [&_th]:font-medium [&_th]:text-fg-subtle";

// ---------------------------------------------------------------- confidence buckets

/**
 * "CONFIDENCE 90–100% ███████ 72% win rate" — one bar per bucket, highest confidence first,
 * with the sample size (closed trades / signals) and the shadow accuracy beside it.
 */
export function ConfidenceBuckets({ buckets, threshold }: { buckets: ConfidenceBucket[]; threshold?: number }) {
  const rows = [...buckets].sort((a, b) => b.min - a.min);
  return (
    <div className="space-y-2.5" role="table" aria-label="Win rate by AI confidence">
      <div role="row" className="grid grid-cols-[4.5rem_minmax(0,1fr)_4rem] gap-3 label-caps text-fg-subtle sm:grid-cols-[5rem_minmax(0,1fr)_4.5rem_7.5rem]">
        <span role="columnheader">Confidence</span>
        <span role="columnheader">Win rate (closed trades)</span>
        <span role="columnheader" className="text-right">
          Win rate
        </span>
        <span role="columnheader" className="hidden text-right sm:block">
          Sample
        </span>
      </div>
      {rows.map((b) => {
        const has = b.trades > 0 && isNum(b.win_rate);
        const small = b.trades > 0 && b.trades < 10;
        return (
          <div role="row" key={b.label} className="grid grid-cols-[4.5rem_minmax(0,1fr)_4rem] items-center gap-3 sm:grid-cols-[5rem_minmax(0,1fr)_4.5rem_7.5rem]">
            <span role="cell" className={cn("num text-dense", isNum(threshold) && b.max <= threshold ? "text-fg-subtle" : "text-fg")}>
              {b.label}
            </span>
            <span role="cell" className="relative h-4 overflow-hidden rounded-[4px] bg-fg/[0.05]">
              {has ? (
                <span
                  className={cn("absolute inset-y-0 left-0 rounded-r-[4px] bg-ai", small && "opacity-50")}
                  style={{ width: `${Math.max(1.5, Math.min(100, b.win_rate ?? 0))}%` }}
                />
              ) : null}
              <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-fg/20" title="50%" />
            </span>
            <span role="cell" className="num text-right text-dense font-medium text-fg">
              {has ? formatPct(b.win_rate, { decimals: 0 }) : <span className="font-normal text-fg-subtle">—</span>}
            </span>
            <span role="cell" className="num hidden text-right text-xs text-fg-subtle sm:block">
              n = {formatInt(b.trades)}
              <span className="text-fg-disabled"> / {formatInt(b.signals)} sig</span>
            </span>
          </div>
        );
      })}
      <p className="text-2xs leading-4 text-fg-subtle">
        Bars are the win rate of executed trades that have closed; faded bars rest on fewer than 10 trades. The hairline marks 50 %. “sig” counts every directional signal in the bucket, traded or not.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- scatter

export function ConfidenceScatter({ points, loading, error, onRetry }: { points: ConfidencePoint[] | undefined; loading?: boolean; error?: unknown; onRetry?: () => void }) {
  const theme = useChartTheme();
  const anim = useChartAnimation();
  const wins = (points ?? []).filter((p) => p.pnl_pct >= 0);
  const losses = (points ?? []).filter((p) => p.pnl_pct < 0);
  return (
    <ChartCard
      title="Confidence vs actual P&L"
      subtitle={points ? `${formatInt(points.length)} closed AI trades` : undefined}
      info="Each dot is one closed trade: the AI's confidence when it opened (x) and the trade's net return (y). If confidence were predictive, dots would drift upward to the right."
      height={280}
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={!points?.length ? { title: "No closed AI trades yet", description: "Each closed trade becomes a dot here." } : false}
      legend={[
        { key: "win", label: "Profitable ▲", color: theme.up, shape: "dot" },
        { key: "loss", label: "Losing ▼", color: theme.down, shape: "dot" },
      ]}
      table={
        <table className={tableCls}>
          <thead>
            <tr>
              <th>Closed</th>
              <th>Side</th>
              <th className="text-right!">Confidence</th>
              <th className="text-right!">Return</th>
              <th className="text-right!">P&amp;L</th>
            </tr>
          </thead>
          <tbody className="num">
            {(points ?? []).map((p) => (
              <tr key={p.trade_id} className="border-t border-line-subtle">
                <td>{formatDateTime(p.closed_at, { seconds: false })}</td>
                <td>{p.side}</td>
                <td className="text-right">{formatPct(p.confidence, { decimals: 0 })}</td>
                <td className={cn("text-right", p.pnl_pct >= 0 ? "text-up" : "text-down")}>{formatSignedPct(p.pnl_pct)}</td>
                <td className="text-right">{formatPnl(p.pnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={CHART_MARGIN}>
          <CartesianGrid {...gridProps(theme)} />
          <XAxis type="number" dataKey="confidence" name="Confidence" domain={[50, 100]} {...xAxisProps(theme)} tickFormatter={tickFormatters.pct} />
          <YAxis type="number" dataKey="pnl_pct" name="Return" {...yAxisProps(theme)} tickFormatter={tickFormatters.pctSigned} />
          <ZAxis range={[48, 48]} />
          <ReferenceLine {...zeroLineProps(theme)} />
          <Tooltip
            cursor={{ stroke: theme.crosshair, strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as ConfidencePoint | undefined;
              if (!active || !p) return null;
              return (
                <div className="rounded-lg surface-elevated px-2.5 py-2 text-xs">
                  <div className="mb-1 text-[11px] text-fg-subtle">
                    {p.side} · {formatDateTime(p.closed_at, { seconds: false })}
                  </div>
                  <div className="num">
                    <span className={p.pnl_pct >= 0 ? "text-up" : "text-down"}>{formatSignedPct(p.pnl_pct)}</span>{" "}
                    <span className="text-fg-muted">({formatPnl(p.pnl)})</span>
                  </div>
                  <div className="num text-fg-muted">Confidence {formatPct(p.confidence, { decimals: 0 })}</div>
                </div>
              );
            }}
          />
          <Scatter name="Profitable" data={wins} fill={theme.up} stroke={theme.background} strokeWidth={1.5} shape="circle" {...anim} />
          <Scatter name="Losing" data={losses} fill={theme.down} stroke={theme.background} strokeWidth={1.5} shape="diamond" {...anim} />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ---------------------------------------------------------------- calibration

export function CalibrationChart({ points, loading, error, onRetry }: { points: CalibrationPoint[] | undefined; loading?: boolean; error?: unknown; onRetry?: () => void }) {
  const theme = useChartTheme();
  const anim = useChartAnimation();
  const data = (points ?? []).filter((p) => isNum(p.actual) && p.count > 0);
  return (
    <ChartCard
      title="Confidence vs win probability"
      subtitle="Calibration: predicted confidence vs observed win rate"
      info="Each point is a confidence bucket: its average stated confidence (x) and how often those trades actually won (y). A well-calibrated model sits on the dashed diagonal; points below it are over-confident. Bigger points rest on more trades."
      height={280}
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={!data.length ? { title: "Not enough closed trades to calibrate", description: "Calibration needs closed trades in at least one confidence bucket." } : false}
      legend={[
        { key: "actual", label: "Observed win rate", color: theme.ai, shape: "dot" },
        { key: "ideal", label: "Perfect calibration", color: theme.deemphasis, shape: "line" },
      ]}
      table={
        <table className={tableCls}>
          <thead>
            <tr>
              <th>Predicted</th>
              <th className="text-right!">Observed</th>
              <th className="text-right!">Trades</th>
            </tr>
          </thead>
          <tbody className="num">
            {(points ?? []).map((p) => (
              <tr key={p.predicted} className="border-t border-line-subtle">
                <td>{formatPct(p.predicted, { decimals: 1 })}</td>
                <td className="text-right">{formatPct(p.actual, { decimals: 1 })}</td>
                <td className="text-right">{formatInt(p.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={CHART_MARGIN}>
          <CartesianGrid {...gridProps(theme)} />
          <XAxis type="number" dataKey="predicted" name="Predicted" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} {...xAxisProps(theme)} tickFormatter={tickFormatters.pct} />
          <YAxis type="number" dataKey="actual" name="Observed" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} {...yAxisProps(theme)} tickFormatter={tickFormatters.pct} />
          <ZAxis type="number" dataKey="count" range={[60, 360]} />
          <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke={theme.deemphasis} strokeDasharray="4 4" strokeWidth={1.5} ifOverflow="hidden" />
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as CalibrationPoint | undefined;
              if (!active || !p) return null;
              return (
                <div className="rounded-lg surface-elevated px-2.5 py-2 text-xs">
                  <div className="num">Predicted {formatPct(p.predicted, { decimals: 1 })}</div>
                  <div className="num font-medium text-fg">Observed {formatPct(p.actual, { decimals: 1 })}</div>
                  <div className="num text-fg-subtle">{formatInt(p.count)} trades</div>
                </div>
              );
            }}
          />
          <Scatter data={data} fill={theme.ai} stroke={theme.background} strokeWidth={2} {...anim} />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ---------------------------------------------------------------- over time

export function PredictionOverTime({ points, loading, error, onRetry }: { points: AIPerformancePoint[] | undefined; loading?: boolean; error?: unknown; onRetry?: () => void }) {
  const theme = useChartTheme();
  const anim = useChartAnimation();
  return (
    <ChartCard
      title="AI prediction performance over time"
      subtitle="Daily win rate of closed AI trades, cumulative win rate and shadow accuracy"
      info="Bars: the day's win rate of closed trades. Lines: the cumulative win rate since the start of the range, and the day's shadow accuracy (every directional signal judged by whether its target came before its stop, traded or not)."
      height={300}
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={!points?.length ? { title: "No AI activity in this range yet" } : false}
      legend={[
        { key: "daily", label: "Daily win rate", color: theme.deemphasis, shape: "rect" },
        { key: "cum", label: "Cumulative win rate", color: theme.series[0], shape: "line" },
        { key: "acc", label: "Shadow accuracy", color: theme.series[1], shape: "line" },
      ]}
      table={
        <table className={tableCls}>
          <thead>
            <tr>
              <th>Day</th>
              <th className="text-right!">Signals</th>
              <th className="text-right!">Trades</th>
              <th className="text-right!">Win rate</th>
              <th className="text-right!">Cumulative</th>
              <th className="text-right!">Accuracy</th>
              <th className="text-right!">P&amp;L</th>
            </tr>
          </thead>
          <tbody className="num">
            {(points ?? []).map((p) => (
              <tr key={p.date} className="border-t border-line-subtle">
                <td>{formatDate(p.date)}</td>
                <td className="text-right">{formatInt(p.signals)}</td>
                <td className="text-right">{formatInt(p.trades)}</td>
                <td className="text-right">{formatPct(p.win_rate, { decimals: 0 })}</td>
                <td className="text-right">{formatPct(p.cumulative_win_rate, { decimals: 0 })}</td>
                <td className="text-right">{formatPct(p.accuracy, { decimals: 0 })}</td>
                <td className="text-right">{formatPnl(p.pnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={CHART_MARGIN}>
          <CartesianGrid {...gridProps(theme)} />
          <XAxis dataKey="date" {...xAxisProps(theme)} tickFormatter={tickFormatters.dateFromIso} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} {...yAxisProps(theme)} tickFormatter={tickFormatters.pct} />
          <ReferenceLine y={50} stroke={theme.axisLine} />
          <Tooltip
            cursor={lineCursor(theme)}
            content={
              <ChartTooltipContent
                valueFormatter={(v) => formatPct(v, { decimals: 0 })}
                labelFormatter={(l, payload) => {
                  const p = payload[0]?.payload as AIPerformancePoint | undefined;
                  return `${formatDate(String(l))}${p ? ` · ${formatInt(p.trades)} trades · ${formatInt(p.signals)} signals` : ""}`;
                }}
              />
            }
          />
          <Bar dataKey="win_rate" name="Daily win rate" fill={theme.deemphasis} fillOpacity={0.55} radius={BAR_RADIUS} maxBarSize={MAX_BAR_SIZE} {...anim} />
          <Line dataKey="cumulative_win_rate" name="Cumulative win rate" stroke={theme.series[0]} strokeWidth={2} dot={false} connectNulls {...anim} />
          <Line dataKey="accuracy" name="Shadow accuracy" stroke={theme.series[1]} strokeWidth={2} dot={{ r: 2.5, strokeWidth: 0, fill: theme.series[1] }} connectNulls {...anim} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ---------------------------------------------------------------- rejection reasons

export function RejectionReasons({ reasons, total }: { reasons: { reason: string; count: number }[]; total: number }) {
  const max = Math.max(1, ...reasons.map((r) => r.count));
  if (!reasons.length) return <p className="text-dense text-fg-subtle">No signal has been rejected in this range.</p>;
  return (
    <ul className="space-y-2">
      {reasons.map((r) => (
        <li key={r.reason} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-dense">
            <span className="min-w-0 truncate text-fg">{r.reason}</span>
            <span className="num shrink-0 text-xs text-fg-muted">
              {formatInt(r.count)}
              {total ? <span className="text-fg-subtle"> · {formatPct((r.count / total) * 100, { decimals: 0 })}</span> : null}
            </span>
          </div>
          <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-fg/[0.05]">
            <span className="block h-full rounded-full bg-fg-muted/70" style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
        </li>
      ))}
      <li className="flex items-center gap-1 text-2xs text-fg-subtle">
        A rejected signal can fail several checks at once, so reasons can add up to more than the rejections.
        <InfoTooltip content="Each rejected signal lists every risk check it failed." />
      </li>
    </ul>
  );
}
