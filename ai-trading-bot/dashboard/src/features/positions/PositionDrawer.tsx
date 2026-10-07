import { ArrowRight, History } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { usePosition, usePositions } from "@/hooks/queries";
import { useUrlState } from "@/hooks/use-url-state";
import { TIMEFRAMES } from "@/lib/constants";
import {
  formatDateTime,
  formatNumber,
  formatPct,
  formatPnl,
  formatPrice,
  formatR,
  formatSize,
  formatUsd,
  splitSymbol,
  toneOf,
} from "@/lib/format";
import { TONE_TEXT } from "@/lib/tones";
import { Button } from "@/components/ui/Button";
import { ConfidenceMeter } from "@/components/ui/ConfidenceMeter";
import { Drawer } from "@/components/ui/Drawer";
import { EnumBadge } from "@/components/ui/EnumBadge";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatGrid, type StatItem } from "@/components/ui/KeyValue";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton, SkeletonChart } from "@/components/ui/Skeleton";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import type { AIAnalysis, Position, Timeframe } from "@/types";
import { DetailAnalysis, DetailChart, DrawerSection, RiskChecks } from "./drawer-parts";
import { LiveDuration, PnlFlash } from "./PositionCard";
import { levelsFor, riskBreakdown, sideSign } from "./position-math";
import { SltpProgress } from "./SltpProgress";

const CHART_TIMEFRAMES = TIMEFRAMES.filter((t) => t !== "1m" && t !== "1d");

/**
 * Drawer driven by the `?position=<id>` URL parameter. Mount it on any page that lists positions
 * (Positions, Overview); opening and closing only touch that one parameter.
 */
export function PositionDrawerHost() {
  const [id, setId] = useUrlState("position", "");
  return <PositionDrawer id={id || null} onClose={() => setId("")} />;
}

export function PositionDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const positions = usePositions();
  const [timeframe, setTimeframe] = useState<Timeframe | undefined>(undefined);
  const detail = usePosition(id ?? undefined, timeframe, { enabled: id !== null });

  const live = id ? positions.data?.find((p) => p.id === id) : undefined;
  const position = live ?? (detail.data?.position.id === id ? detail.data.position : undefined);
  const closedMeanwhile = id !== null && positions.data !== undefined && live === undefined;
  const analysis = detail.data?.analysis ?? null;
  const chartTf = timeframe ?? detail.data?.timeframe ?? "5m";

  return (
    <Drawer
      open={id !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="lg"
      title={
        position ? (
          <span className="inline-flex items-center gap-2">
            {splitSymbol(position.symbol).base}
            <span className="text-fg-subtle">/{splitSymbol(position.symbol).quote}</span>
            <EnumBadge kind="side" value={position.side} size="sm" />
          </span>
        ) : (
          "Position"
        )
      }
      description={
        position ? (
          <>
            Opened {formatDateTime(position.opened_at, { seconds: false })} ·{" "}
            <EnumBadge kind="strategy" value={position.strategy} size="xs" noIcon />
          </>
        ) : undefined
      }
      headerExtra={position ? <Headline p={position} /> : undefined}
    >
      {closedMeanwhile ? <ClosedNotice id={id} /> : null}
      {position ? (
        <Body
          p={position}
          analysis={analysis}
          chartTf={chartTf}
          onTimeframe={setTimeframe}
          chart={detail.data}
          chartLoading={detail.isPending}
          analysisLoading={detail.isPending}
          live={!closedMeanwhile}
        />
      ) : closedMeanwhile ? null : detail.error ? (
        <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
      ) : (
        <DrawerSkeleton />
      )}
    </Drawer>
  );
}

function Headline({ p }: { p: Position }) {
  const tone = toneOf(p.unrealized_pnl);
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        <div className="label-caps">Unrealized P&amp;L</div>
        <div className={`mt-0.5 flex items-baseline gap-2 ${TONE_TEXT[tone]}`}>
          <PnlFlash value={p.unrealized_pnl} plain className="text-kpi font-semibold" />
          <PnlFlash value={p.unrealized_pnl_pct} pct plain className="text-sm" />
        </div>
      </div>
      <dl className="flex gap-5 text-right">
        <Mini
          label="R multiple"
          info="Unrealized P&L divided by the amount risked at entry. +1R means the profit equals the original risk."
          value={formatR(p.r_multiple)}
          tone={toneOf(p.r_multiple)}
        />
        <Mini label="Duration" value={<LiveDuration position={p} />} />
        <Mini label="AI confidence" value={<ConfidenceMeter value={p.ai_confidence} variant="text" />} />
      </dl>
    </div>
  );
}

function Mini({
  label,
  value,
  info,
  tone,
}: {
  label: string;
  value: ReactNode;
  info?: string;
  tone?: "up" | "down" | "neutral";
}) {
  return (
    <div>
      <dt className="flex items-center justify-end gap-1 text-xs text-fg-subtle">
        {label}
        {info ? <InfoTooltip content={info} /> : null}
      </dt>
      <dd className={`num text-sm font-medium ${tone ? TONE_TEXT[tone] : "text-fg"}`}>{value}</dd>
    </div>
  );
}

function ClosedNotice({ id }: { id: string }) {
  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2/60 px-3.5 py-3"
    >
      <div className="flex items-start gap-2.5">
        <History className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
        <div>
          <p className="text-dense font-medium text-fg">This position has been closed</p>
          <p className="text-xs text-fg-subtle">
            It is no longer open; the closed trade has the final result.
          </p>
        </div>
      </div>
      <Button asChild size="sm" variant="outline" rightIcon={ArrowRight}>
        <Link to={`/trades?trade=${encodeURIComponent(id)}`}>View closed trade</Link>
      </Button>
    </div>
  );
}

function DrawerSkeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      <SkeletonChart height={260} />
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </div>
      <Skeleton className="h-28" />
    </div>
  );
}

function Body({
  p,
  analysis,
  chartTf,
  onTimeframe,
  chart,
  chartLoading,
  analysisLoading,
  live,
}: {
  p: Position;
  analysis: AIAnalysis | null;
  chartTf: Timeframe;
  onTimeframe: (tf: Timeframe) => void;
  chart: ReturnType<typeof usePosition>["data"];
  chartLoading: boolean;
  analysisLoading: boolean;
  live: boolean;
}) {
  const { base } = splitSymbol(p.symbol);
  const levels = useMemo(() => levelsFor(p), [p]);
  const rb = riskBreakdown(p);
  const sign = sideSign(p.side);

  const info: StatItem[] = [
    { label: "Size", value: formatSize(p.size, base) },
    { label: "Notional", value: formatUsd(p.notional), info: "Size × entry price, in USDT." },
    { label: "Entry", value: formatPrice(p.entry_price) },
    { label: "Current", value: formatPrice(p.current_price) },
    {
      label: "Stop loss",
      value: formatPrice(p.stop_loss),
      sub: `${formatPct(p.distance_to_sl_pct)} away`,
    },
    {
      label: "Take profit",
      value: formatPrice(p.take_profit),
      sub: `${formatPct(p.distance_to_tp_pct)} away`,
    },
    {
      label: "Fees paid",
      value: formatUsd(p.fees_paid),
      info: "Entry fee already paid; the exit fee is added on close.",
    },
    {
      label: "MFE",
      value: formatPct(p.mfe_pct, { signed: true }),
      tone: "up",
      info: "Max favourable excursion: the best unrealized move since entry, as % of the entry price.",
    },
    {
      label: "MAE",
      value: formatPct(p.mae_pct, { signed: true }),
      tone: p.mae_pct < 0 ? "down" : "neutral",
      info: "Max adverse excursion: the worst unrealized move since entry, as % of the entry price.",
    },
    { label: "Strategy", value: <EnumBadge kind="strategy" value={p.strategy} size="xs" />, mono: false },
    { label: "Regime", value: <EnumBadge kind="regime" value={p.regime} size="xs" short />, mono: false },
    {
      label: "Order type",
      value: <EnumBadge kind="orderType" value={p.order_type} size="xs" />,
      mono: false,
    },
    { label: "Opened", value: formatDateTime(p.opened_at, { seconds: false }) },
    { label: "Duration", value: <LiveDuration position={p} /> },
    { label: "AI confidence", value: <ConfidenceMeter value={p.ai_confidence} variant="text" /> },
  ];

  return (
    <div className="divide-y divide-line-subtle">
      <DrawerSection
        title="Chart"
        actions={
          <SegmentedControl
            size="xs"
            aria-label="Chart timeframe"
            value={chartTf}
            onValueChange={onTimeframe}
            options={CHART_TIMEFRAMES.map((t) => ({ value: t, label: t }))}
          />
        }
      >
        {chart ? (
          <DetailChart
            candles={chart.candles}
            timeframe={chart.timeframe}
            markers={chart.markers}
            levels={levels}
            live={live ? { symbol: p.symbol, timeframe: chart.timeframe } : undefined}
            viewKey={`${p.id}:${chart.timeframe}`}
          />
        ) : chartLoading ? (
          <SkeletonChart height={280} />
        ) : (
          <p className="rounded-lg border border-line-subtle px-3 py-6 text-center text-dense text-fg-subtle">
            The chart could not be loaded.
          </p>
        )}
        <SltpProgress position={p} className="mt-4" labels />
      </DrawerSection>

      <DrawerSection title="Trade information">
        <StatGrid items={info} columns={3} />
      </DrawerSection>

      <DrawerSection
        title="Risk calculation"
        info="How much this trade puts at risk and how the position size follows from the stop distance."
      >
        <StatGrid
          columns={3}
          items={[
            {
              label: "Amount at risk",
              value: formatUsd(p.risk_amount),
              sub: `${formatPct(p.risk_pct)} of equity`,
              info: "What the account loses if the stop fills at its level.",
            },
            {
              label: "Stop distance",
              value: formatPrice(rb.stopDistance),
              sub: `${formatPct(rb.stopDistancePct)} of entry`,
            },
            {
              label: "Reward : risk",
              value: rb.rewardRisk === null ? "—" : `${formatNumber(rb.rewardRisk, 2)} : 1`,
              sub: `${formatPct(rb.targetDistancePct)} to target`,
              info: "Target distance divided by stop distance, measured from the entry.",
            },
            { label: "Loss at stop", value: formatPnl(-rb.lossAtStop), tone: "down" },
            { label: "Gain at target", value: formatPnl(rb.gainAtTarget), tone: "up" },
            {
              label: "Equity at entry",
              value: rb.equityAtEntry === null ? "—" : formatUsd(rb.equityAtEntry, { decimals: 0 }),
            },
          ]}
        />
        <div className="mt-4 rounded-lg border border-line-subtle bg-surface-2/50 px-3.5 py-3 text-dense leading-6 text-fg-muted">
          <p className="mb-1 label-caps">How the size was derived</p>
          <p className="num">
            <span className="text-fg">{formatUsd(p.risk_amount)}</span> risk budget ÷{" "}
            <span className="text-fg">{formatPrice(rb.stopDistance)}</span> stop distance per {base} ={" "}
            <span className="text-fg">
              {rb.sizeFromRisk === null ? "—" : formatSize(rb.sizeFromRisk, base)}
            </span>
          </p>
          <p className="num">
            Actual size <span className="text-fg">{formatSize(p.size, base)}</span> · {formatUsd(p.notional)}{" "}
            notional
            {rb.capped
              ? " — smaller than the risk-derived size because a position-size or exposure limit applied."
              : "."}
          </p>
          <p className="mt-1 text-xs text-fg-subtle">
            Currently {sign > 0 ? "long" : "short"}: {formatR(p.r_multiple)} against the amount risked.
          </p>
        </div>
        <div className="mt-4">
          <p className="mb-2 label-caps">Risk checks at entry</p>
          {analysisLoading && !analysis ? <Skeleton className="h-32" /> : <RiskChecks analysis={analysis} />}
        </div>
      </DrawerSection>

      <DrawerSection title="AI reasoning">
        {p.entry_reason ? <p className="mb-3 text-dense leading-5 text-fg-muted">{p.entry_reason}</p> : null}
        {analysis ? (
          <DetailAnalysis analysis={analysis} />
        ) : analysisLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <p className="text-dense text-fg-subtle">No stored AI decision is linked to this position.</p>
        )}
      </DrawerSection>
    </div>
  );
}
