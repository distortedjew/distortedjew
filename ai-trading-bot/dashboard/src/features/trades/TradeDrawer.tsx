import { ArrowLeft } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useTrade } from "@/hooks/queries";
import { useUrlState } from "@/hooks/use-url-state";
import { TIMEFRAMES } from "@/lib/constants";
import {
  formatDateTime,
  formatDuration,
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
import { CopyButton } from "@/components/ui/CopyButton";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { EnumBadge } from "@/components/ui/EnumBadge";
import { ErrorState } from "@/components/ui/ErrorState";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { StatGrid } from "@/components/ui/KeyValue";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton, SkeletonChart } from "@/components/ui/Skeleton";
import { ApiError } from "@/lib/api";
import { DetailAnalysis, DetailChart, DrawerSection } from "@/features/positions/drawer-parts";
import { SltpProgress } from "@/features/positions/SltpProgress";
import type { PriceLevel, Timeframe, Trade } from "@/types";
import { explainExit } from "./explain-exit";

const CHART_TIMEFRAMES = TIMEFRAMES.filter((t) => t !== "1m" && t !== "1d");

function levelsFor(t: Trade): PriceLevel[] {
  const base = { position_id: t.id, side: t.side } as const;
  return [
    { ...base, kind: "entry", price: t.entry_price, label: "Entry" },
    { ...base, kind: "stop_loss", price: t.stop_loss, label: "SL" },
    { ...base, kind: "take_profit", price: t.take_profit, label: "TP" },
  ];
}

/** Drawer driven by the `?trade=<id>` URL parameter (Trades page, Overview recent trades). */
export function TradeDrawerHost() {
  const [id, setId] = useUrlState<string>("trade", "");
  return <TradeDrawer id={id || null} onClose={() => setId("")} />;
}

export function TradeDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [timeframe, setTimeframe] = useState<Timeframe | undefined>(undefined);
  const q = useTrade(id ?? undefined, timeframe, { enabled: id !== null });
  const data = q.data?.trade.id === id ? q.data : undefined;
  const trade = data?.trade;
  const notFound = q.error instanceof ApiError && q.error.status === 404;

  return (
    <Drawer
      open={id !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="lg"
      title={
        trade ? (
          <span className="inline-flex items-center gap-2">
            {splitSymbol(trade.symbol).base}
            <span className="text-fg-subtle">/{splitSymbol(trade.symbol).quote}</span>
            <EnumBadge kind="side" value={trade.side} size="sm" />
            <EnumBadge kind="result" value={trade.result} size="sm" />
          </span>
        ) : (
          "Trade"
        )
      }
      description={
        trade ? (
          <>
            Closed {formatDateTime(trade.closed_at, { seconds: false })} ·{" "}
            <EnumBadge kind="strategy" value={trade.strategy} size="xs" noIcon />
          </>
        ) : undefined
      }
      headerExtra={trade ? <Headline t={trade} /> : undefined}
    >
      {trade && data ? (
        <Body t={trade} data={data} timeframe={timeframe ?? data.timeframe} onTimeframe={setTimeframe} />
      ) : notFound ? (
        <EmptyState
          title="Trade not found"
          description="It may have been removed, or the link is wrong. If this position is still open it is listed under Positions."
          action={
            <Button asChild variant="outline" size="sm" leftIcon={ArrowLeft}>
              <Link to="/positions">Open positions</Link>
            </Button>
          }
        />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <div className="space-y-5" aria-hidden>
          <SkeletonChart height={260} />
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
          <Skeleton className="h-28" />
        </div>
      )}
    </Drawer>
  );
}

function Headline({ t }: { t: Trade }) {
  const tone = toneOf(t.pnl);
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        <div className="label-caps">Net P&amp;L</div>
        <div className={`mt-0.5 flex items-baseline gap-2 ${TONE_TEXT[tone]}`}>
          <span className="text-kpi font-semibold">{formatPnl(t.pnl)}</span>
          <span className="num text-sm">{formatPct(t.pnl_pct, { signed: true })}</span>
        </div>
      </div>
      <dl className="flex gap-5 text-right">
        <Mini
          label="R multiple"
          info="Net P&L divided by the amount risked at entry."
          value={formatR(t.r_multiple)}
          tone={toneOf(t.r_multiple)}
        />
        <Mini label="Duration" value={formatDuration(t.duration_sec)} />
        <Mini label="Exit" value={<EnumBadge kind="exitReason" value={t.exit_reason} short size="xs" />} />
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

function Body({
  t,
  data,
  timeframe,
  onTimeframe,
}: {
  t: Trade;
  data: NonNullable<ReturnType<typeof useTrade>["data"]>;
  timeframe: Timeframe;
  onTimeframe: (tf: Timeframe) => void;
}) {
  const { base } = splitSymbol(t.symbol);
  const levels = useMemo(() => levelsFor(t), [t]);
  const analysis = data.analysis;

  return (
    <div className="divide-y divide-line-subtle">
      <DrawerSection
        title="Chart"
        actions={
          <SegmentedControl
            size="xs"
            aria-label="Chart timeframe"
            value={timeframe}
            onValueChange={onTimeframe}
            options={CHART_TIMEFRAMES.map((tf) => ({ value: tf, label: tf }))}
          />
        }
      >
        <DetailChart
          candles={data.candles}
          timeframe={data.timeframe}
          markers={data.markers}
          levels={levels}
          viewKey={`${t.id}:${data.timeframe}`}
        />
        <SltpProgress
          position={{
            entry_price: t.entry_price,
            stop_loss: t.stop_loss,
            take_profit: t.take_profit,
            current_price: t.exit_price,
          }}
          className="mt-4"
          labels
        />
        <p className="mt-1.5 text-xs text-fg-subtle">
          Dot: where the trade exited between its stop and target.
        </p>
      </DrawerSection>

      <DrawerSection title="Why it closed">
        <div className="rounded-lg border border-line-subtle bg-surface-2/50 px-3.5 py-3">
          <EnumBadge kind="exitReason" value={t.exit_reason} size="sm" />
          <p className="mt-2 text-dense leading-5 text-fg-muted">{explainExit(t)}</p>
        </div>
      </DrawerSection>

      <DrawerSection title="Profit and loss">
        <StatGrid
          columns={3}
          items={[
            {
              label: "Gross P&L",
              value: formatPnl(t.gross_pnl),
              tone: toneOf(t.gross_pnl),
              info: "Price move × size, before fees.",
            },
            { label: "Fees", value: formatUsd(-t.fees, { signed: true }), info: "Entry plus exit fees." },
            {
              label: "Net P&L",
              value: formatPnl(t.pnl),
              tone: toneOf(t.pnl),
              sub: `${formatPct(t.pnl_pct, { signed: true })} of notional`,
            },
            { label: "R multiple", value: formatR(t.r_multiple), tone: toneOf(t.r_multiple) },
            {
              label: "MFE",
              value: formatPct(t.mfe_pct, { signed: true }),
              tone: "up",
              info: "Max favourable excursion: the best unrealized move during the trade, as % of entry.",
            },
            {
              label: "MAE",
              value: formatPct(t.mae_pct, { signed: true }),
              tone: t.mae_pct < 0 ? "down" : "neutral",
              info: "Max adverse excursion: the worst unrealized move during the trade, as % of entry.",
            },
          ]}
        />
      </DrawerSection>

      <DrawerSection title="Trade information">
        <StatGrid
          columns={3}
          items={[
            { label: "Entry", value: formatPrice(t.entry_price) },
            { label: "Exit", value: formatPrice(t.exit_price) },
            { label: "Size", value: formatSize(t.size, base) },
            { label: "Stop loss", value: formatPrice(t.stop_loss) },
            { label: "Take profit", value: formatPrice(t.take_profit) },
            { label: "Notional", value: formatUsd(t.notional) },
            { label: "Opened", value: formatDateTime(t.opened_at, { seconds: false }) },
            { label: "Closed", value: formatDateTime(t.closed_at, { seconds: false }) },
            { label: "Duration", value: formatDuration(t.duration_sec) },
            {
              label: "Strategy",
              value: <EnumBadge kind="strategy" value={t.strategy} size="xs" />,
              mono: false,
            },
            {
              label: "Regime at entry",
              value: <EnumBadge kind="regime" value={t.regime} size="xs" short />,
              mono: false,
            },
            { label: "AI confidence", value: <ConfidenceMeter value={t.ai_confidence} variant="text" /> },
          ]}
        />
        <div className="mt-4 flex items-center gap-1.5 text-xs text-fg-subtle">
          Trade id <span className="num text-fg-muted">{t.id}</span>
          <CopyButton value={t.id} label="Copy trade id" />
          {analysis ? (
            <span className="ml-auto num">
              Reward : risk planned{" "}
              {analysis.risk_reward ? `${formatNumber(analysis.risk_reward, 2)} : 1` : "—"}
            </span>
          ) : null}
        </div>
      </DrawerSection>

      <DrawerSection title="AI reasoning">
        {t.entry_reason ? <p className="mb-3 text-dense leading-5 text-fg-muted">{t.entry_reason}</p> : null}
        {analysis ? (
          <DetailAnalysis analysis={analysis} />
        ) : (
          <p className="text-dense text-fg-subtle">No stored AI decision is linked to this trade.</p>
        )}
      </DrawerSection>
    </div>
  );
}
