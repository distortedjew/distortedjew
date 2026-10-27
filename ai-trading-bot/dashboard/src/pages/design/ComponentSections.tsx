import { Bell, Download, Ellipsis, Inbox, Layers, Pencil, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ApiError } from "@/lib/api";
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatPnl,
  formatPrice,
  formatR,
  formatSize,
  formatUsd,
  splitSymbol,
} from "@/lib/format";
import { TIMEFRAMES } from "@/lib/constants";
import type { Kpi, PortfolioKpis, Position, Timeframe } from "@/types";
import {
  BAR_RADIUS_SIGNED,
  CHART_MARGIN,
  ChartCard,
  ChartTooltipContent,
  MAX_BAR_SIZE,
  Sparkline,
  barCursor,
  gridProps,
  lineCursor,
  signColor,
  tickFormatters,
  useChartAnimation,
  useChartTheme,
  xAxisProps,
  yAxisProps,
  zeroLineProps,
} from "@/components/charts";
import {
  AnimatedNumber,
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Checkbox,
  ConfidenceMeter,
  ConfirmDialog,
  CopyButton,
  DataTable,
  DeltaBadge,
  Dialog,
  Drawer,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  EnumBadge,
  ErrorState,
  Field,
  FilterBar,
  FilterBarSpacer,
  IconButton,
  Input,
  KeyValue,
  NumberInput,
  Pagination,
  PnlText,
  Popover,
  PopoverContent,
  PopoverTrigger,
  PriceText,
  ProgressBar,
  SectionHeader,
  SegmentedControl,
  Select,
  Skeleton,
  SkeletonCard,
  SkeletonChart,
  SkeletonKpi,
  SkeletonTable,
  Slider,
  Spinner,
  StatGrid,
  Switch,
  SymbolLabel,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Timestamp,
  Tooltip,
  type Column,
} from "@/components/ui";
import { KpiCard } from "@/features/overview/KpiCard";
import { KPI_DEFINITIONS, KPI_ORDER } from "@/features/overview/kpi-definitions";
import { Section } from "@/pages/design/FoundationSections";
import { LightweightSample } from "@/pages/design/LightweightSample";
import {
  NULL_KPI,
  SAMPLE_COMPARISON,
  SAMPLE_DAILY_PNL,
  SAMPLE_EQUITY,
  SAMPLE_KPIS,
  SAMPLE_POSITIONS,
  walk,
} from "@/pages/design/sample-data";

/** Module-level so renders stay pure. */
const LOADED_AT = Date.now();

export function FormsSection() {
  const [tf, setTf] = useState<Timeframe>("5m");
  const [symbol, setSymbol] = useState("BTC/USDT");
  const [risk, setRisk] = useState<number | null>(1);
  const [confidence, setConfidence] = useState(65);
  const [shorts, setShorts] = useState(true);
  const [email, setEmail] = useState(false);
  const [maxPositions, setMaxPositions] = useState<number | null>(25);
  return (
    <Section
      id="forms"
      title="Form controls"
      description="Settings forms and filters. NumberInput clamps on blur, ↑/↓ steps (Shift ×10)."
    >
      <Card>
        <CardBody className="grid gap-5 pt-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Search" htmlFor="ds-search" hint="Symbol, id or reason">
            <Input id="ds-search" leftIcon={Search} placeholder="Search trades…" />
          </Field>
          <Field label="Symbol" htmlFor="ds-symbol">
            <Select
              id="ds-symbol"
              value={symbol}
              onValueChange={setSymbol}
              options={["BTC/USDT", "ETH/USDT", "SOL/USDT"].map((s) => ({ value: s, label: s }))}
            />
          </Field>
          <Field label="Timeframe" htmlFor="ds-tf">
            <SegmentedControl
              aria-label="Timeframe"
              value={tf}
              onValueChange={setTf}
              options={TIMEFRAMES.map((t) => ({ value: t, label: t }))}
            />
          </Field>
          <Field
            label="Risk per trade"
            htmlFor="ds-risk"
            info="Of equity, lost if the stop is hit."
            hint="0.1 – 5 %"
          >
            <NumberInput
              id="ds-risk"
              value={risk}
              onValueChange={setRisk}
              min={0.1}
              max={5}
              step={0.1}
              unit="%"
            />
          </Field>
          <Field
            label="Max positions"
            htmlFor="ds-maxpos"
            error={maxPositions !== null && maxPositions > 20 ? "Must be 20 or less" : undefined}
          >
            <NumberInput
              id="ds-maxpos"
              value={maxPositions}
              onValueChange={setMaxPositions}
              step={1}
              unit="pos"
              invalid={maxPositions !== null && maxPositions > 20}
            />
          </Field>
          <Field
            label="Minimum AI confidence"
            htmlFor="ds-conf"
            aside={<span className="num">{confidence}%</span>}
          >
            <Slider
              aria-label="Minimum AI confidence"
              value={confidence}
              onValueChange={setConfidence}
              min={0}
              max={100}
              step={1}
            />
          </Field>
          <Field
            label="Allow short positions"
            htmlFor="ds-shorts"
            layout="inline"
            hint="Trade both directions"
          >
            <Switch id="ds-shorts" checked={shorts} onCheckedChange={setShorts} />
          </Field>
          <Field
            label="Email alerts"
            htmlFor="ds-email"
            layout="inline"
            hint="SMTP not configured"
            aside={<Badge tone="muted">Off</Badge>}
          >
            <Checkbox id="ds-email" checked={email} onCheckedChange={(v) => setEmail(v === true)} />
          </Field>
          <Field label="Notes" htmlFor="ds-notes">
            <Textarea id="ds-notes" placeholder="Why this change…" />
          </Field>
        </CardBody>
        <CardFooter>
          <span>Unsaved changes</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost">
              Reset
            </Button>
            <Button size="sm" variant="primary">
              Save settings
            </Button>
          </div>
        </CardFooter>
      </Card>
      <Card>
        <CardBody className="pt-4">
          <Tabs defaultValue="history">
            <TabsList>
              <TabsTrigger value="history">Decision history</TabsTrigger>
              <TabsTrigger value="accuracy">Accuracy</TabsTrigger>
              <TabsTrigger value="usage">Usage & cost</TabsTrigger>
            </TabsList>
            <TabsContent value="history" className="pt-3 text-dense text-fg-muted">
              Underline tabs for page sections.
            </TabsContent>
            <TabsContent value="accuracy" className="pt-3 text-dense text-fg-muted">
              Accuracy content.
            </TabsContent>
            <TabsContent value="usage" className="pt-3 text-dense text-fg-muted">
              Usage content.
            </TabsContent>
          </Tabs>
          <Tabs defaultValue="1" className="mt-5">
            <TabsList variant="pills">
              <TabsTrigger value="1">Chart</TabsTrigger>
              <TabsTrigger value="2">Table</TabsTrigger>
              <TabsTrigger value="3">Raw</TabsTrigger>
            </TabsList>
          </Tabs>
          <FilterBar className="mt-5 mb-0">
            <SegmentedControl
              aria-label="Range"
              size="sm"
              value="7d"
              onValueChange={() => {}}
              options={["24h", "7d", "30d", "90d", "all"].map((v) => ({ value: v, label: v.toUpperCase() }))}
            />
            <Select
              size="sm"
              className="w-36"
              aria-label="Side"
              value="all"
              onValueChange={() => {}}
              options={[
                { value: "all", label: "All sides" },
                { value: "LONG", label: "Long" },
                { value: "SHORT", label: "Short" },
              ]}
            />
            <FilterBarSpacer />
            <Button size="sm" leftIcon={Download}>
              Export
            </Button>
          </FilterBar>
        </CardBody>
      </Card>
    </Section>
  );
}

export function NumbersSection() {
  const [price, setPrice] = useState(97123.45);
  const [equity, setEquity] = useState(10482.31);
  useEffect(() => {
    const id = setInterval(() => {
      setPrice((p) => Math.round((p + (Math.random() - 0.5) * 40) * 100) / 100);
    }, 1200);
    return () => clearInterval(id);
  }, []);
  return (
    <Section
      id="numbers"
      title="Live numbers"
      description="Tabular figures; prices flash on change, KPIs count smoothly (instant with reduced motion)."
    >
      <Card>
        <CardBody className="grid gap-6 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <KeyValue label="PriceText (ticking)" value={<PriceText value={price} className="text-lg" />} />
          <KeyValue
            label="AnimatedNumber"
            value={
              <div className="flex items-center gap-2">
                <AnimatedNumber
                  value={equity}
                  format={(n) => formatUsd(n)}
                  className="text-lg font-semibold"
                />
                <Button
                  size="xs"
                  onClick={() => setEquity((e) => Math.round((e + (Math.random() - 0.45) * 300) * 100) / 100)}
                >
                  Update
                </Button>
              </div>
            }
          />
          <KeyValue
            label="PnlText"
            value={
              <div className="flex flex-col items-start gap-1">
                <PnlText value={482.31} pct={4.82} />
                <PnlText value={-120.5} pct={-1.2} />
                <PnlText value={0} pct={0} />
              </div>
            }
          />
          <KeyValue
            label="DeltaBadge"
            value={
              <div className="flex flex-col items-start gap-1.5">
                <DeltaBadge change={482.31} changePct={4.82} format="currency" />
                <DeltaBadge change={-1.32} format="pp" />
                <DeltaBadge change={-0.08} format="ratio" variant="pill" />
                <DeltaBadge change={0} format="count" />
              </div>
            }
          />
          <KeyValue
            label="ConfidenceMeter (threshold 65 %)"
            mono={false}
            value={
              <div className="flex flex-col items-start gap-2">
                <ConfidenceMeter value={82} threshold={65} />
                <ConfidenceMeter value={58} threshold={65} />
                <ConfidenceMeter value={74} threshold={65} variant="bar" className="w-40" />
                <ConfidenceMeter value={91} variant="text" />
              </div>
            }
          />
          <KeyValue
            label="SymbolLabel"
            mono={false}
            value={
              <div className="flex flex-col items-start gap-2">
                <SymbolLabel symbol="BTC/USDT" size="lg" />
                <SymbolLabel symbol="ETH/USDT" />
                <SymbolLabel symbol="SOL/USDT" size="sm" />
                <SymbolLabel symbol="BTC/USDT" monogram={false} quote={false} />
              </div>
            }
          />
        </CardBody>
      </Card>
    </Section>
  );
}

export function KpiSection() {
  const [kpis, setKpis] = useState<PortfolioKpis>(SAMPLE_KPIS);
  const bump = () =>
    setKpis((current) => {
      const next = { ...current };
      for (const key of KPI_ORDER) {
        const k = current[key];
        if (k.value === null) continue;
        const delta =
          key === "equity"
            ? (Math.random() - 0.4) * 120
            : key === "open_positions" || key === "trades_today"
              ? 1
              : (Math.random() - 0.4) * Math.abs(k.value) * 0.1;
        const value = Math.round((k.value + delta) * 100) / 100;
        next[key] = {
          ...k,
          value,
          change: k.change === null ? null : Math.round((k.change + delta) * 100) / 100,
          sparkline: [...k.sparkline.slice(1), value],
        } as Kpi;
      }
      return next;
    });
  return (
    <Section
      id="kpis"
      title="KPI cards"
      description="KpiCard with sample props (the Overview renders them from usePortfolio().data.kpis)."
    >
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={bump}>
          Simulate update
        </Button>
        <span className="text-xs text-fg-subtle">Counts to the new values and flashes the outline.</span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {KPI_ORDER.map((key, i) => (
          <KpiCard
            key={key}
            definition={KPI_DEFINITIONS[key]}
            kpi={kpis[key]}
            valueSuffix={key === "today_pnl" ? "+0.46%" : key === "total_pnl" ? "+4.82%" : undefined}
            className={i < 2 ? "col-span-2 sm:col-span-1" : undefined}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          definition={KPI_DEFINITIONS.profit_factor}
          kpi={{ ...NULL_KPI }}
          nullHint="No losing trades in the last 7 days yet."
        />
        <KpiCard definition={KPI_DEFINITIONS.equity} kpi={undefined} loading />
        <KpiCard definition={KPI_DEFINITIONS.win_rate} kpi={kpis.win_rate} compact />
        <SkeletonKpi />
      </div>
    </Section>
  );
}

export function SparklineSection() {
  return (
    <Section
      id="sparklines"
      title="Sparklines"
      description="Stat tiles: de-emphasis gray with the current period in the accent. Ticker rows: colored by direction. Bars by sign. Hover for values."
    >
      <Card>
        <CardBody className="grid gap-6 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <KeyValue
            label="Stat tile · line"
            value={
              <Sparkline
                data={walk(30, 100, 4, 0.6, 2)}
                tone="deemphasis"
                highlightLast
                height={38}
                formatValue={(v) => formatPrice(v)}
              />
            }
          />
          <KeyValue
            label="Stat tile · bars"
            value={
              <Sparkline
                data={SAMPLE_KPIS.today_pnl.sparkline}
                variant="bars"
                tone="deemphasis"
                highlightLast
                height={38}
                formatValue={(v) => formatPnl(v)}
              />
            }
          />
          <KeyValue
            label="Up trend"
            value={<Sparkline data={walk(30, 100, 4, 0.6, 2)} formatValue={(v) => formatPrice(v)} />}
          />
          <KeyValue
            label="Down trend"
            value={<Sparkline data={walk(30, 100, 4, -0.6, 8)} formatValue={(v) => formatPrice(v)} />}
          />
          <KeyValue
            label="Daily P&L bars"
            value={
              <Sparkline
                data={SAMPLE_KPIS.today_pnl.sparkline}
                variant="bars"
                formatValue={(v) => formatPnl(v)}
              />
            }
          />
          <KeyValue
            label="Neutral counts"
            value={<Sparkline data={SAMPLE_KPIS.trades_today.sparkline} variant="bars" tone="accent" />}
          />
          <KeyValue label="Flat" value={<Sparkline data={[5, 5, 5, 5, 5]} />} />
          <KeyValue label="No data" value={<Sparkline data={[]} />} />
          <KeyValue
            label="Line, no area"
            value={<Sparkline data={walk(40, 50, 3, 0.1, 13)} area={false} tone="accent" />}
          />
          <KeyValue
            label="Tall (64px)"
            value={
              <Sparkline data={walk(48, 200, 8, 0.3, 17)} height={64} formatValue={(v) => formatPrice(v)} />
            }
          />
        </CardBody>
      </Card>
    </Section>
  );
}

export function ChartsSection() {
  const theme = useChartTheme();
  const anim = useChartAnimation();
  return (
    <Section
      id="charts"
      title="Analytics charts (Recharts)"
      description="Theme tokens, solid hairline grid, 2px lines, ~10 % area wash, ≤ 24px bars, value-first tooltips."
    >
      <LightweightSample />
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <ChartCard
          title="Equity curve"
          subtitle="Sample · 60 days"
          info="Equity at each daily close."
          table={
            <table className="w-full text-dense">
              <tbody>
                {SAMPLE_EQUITY.slice(-10).map((p) => (
                  <tr key={p.time} className="border-b border-line-subtle">
                    <td className="px-3 py-1.5 text-fg-muted">{formatDate(p.time * 1000)}</td>
                    <td className="px-3 py-1.5 text-right num">{formatUsd(p.equity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={SAMPLE_EQUITY} margin={CHART_MARGIN}>
              <defs>
                <linearGradient id="ds-equity" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.series[0]} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={theme.series[0]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridProps(theme)} />
              <XAxis dataKey="time" {...xAxisProps(theme)} tickFormatter={tickFormatters.dateFromUnix} />
              <YAxis
                {...yAxisProps(theme)}
                tickFormatter={tickFormatters.usdCompact}
                domain={["auto", "auto"]}
              />
              <ChartTooltip
                cursor={lineCursor(theme)}
                content={
                  <ChartTooltipContent
                    valueFormatter={(v) => formatUsd(v)}
                    labelFormatter={(t) => formatDateTime(Number(t) * 1000)}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="equity"
                name="Equity"
                stroke={theme.series[0]}
                strokeWidth={2}
                fill="url(#ds-equity)"
                {...anim}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Daily P&L" subtitle="Sample · 21 days">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={SAMPLE_DAILY_PNL} margin={CHART_MARGIN}>
              <CartesianGrid {...gridProps(theme)} />
              <XAxis dataKey="date" {...xAxisProps(theme)} tickFormatter={tickFormatters.dateFromIso} />
              <YAxis {...yAxisProps(theme)} tickFormatter={tickFormatters.pnlCompact} />
              <ReferenceLine {...zeroLineProps(theme)} />
              <ChartTooltip
                cursor={barCursor(theme)}
                content={
                  <ChartTooltipContent
                    indicator="square"
                    valueFormatter={(v) => formatPnl(v)}
                    labelFormatter={(d) => formatDate(String(d))}
                  />
                }
              />
              <Bar dataKey="pnl" name="P&L" radius={BAR_RADIUS_SIGNED} maxBarSize={MAX_BAR_SIZE} {...anim}>
                {SAMPLE_DAILY_PNL.map((d) => (
                  <Cell key={d.date} fill={signColor(theme, d.pnl)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard
          title="Strategy comparison"
          subtitle="Sample · normalized equity (start = 100)"
          legend={[
            { key: "ai", label: "AI", color: theme.series[0] },
            { key: "hybrid", label: "Hybrid", color: theme.series[1] },
            { key: "baseline", label: "Baseline", color: theme.series[2] },
          ]}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={SAMPLE_COMPARISON} margin={CHART_MARGIN}>
              <CartesianGrid {...gridProps(theme)} />
              <XAxis dataKey="step" {...xAxisProps(theme)} />
              <YAxis {...yAxisProps(theme)} domain={["auto", "auto"]} tickFormatter={tickFormatters.number} />
              <ChartTooltip
                cursor={lineCursor(theme)}
                content={
                  <ChartTooltipContent
                    valueFormatter={(v) => v.toFixed(2)}
                    labelFormatter={(s) => `Day ${s}`}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="ai"
                name="AI"
                stroke={theme.series[0]}
                strokeWidth={2}
                dot={false}
                {...anim}
              />
              <Line
                type="monotone"
                dataKey="hybrid"
                name="Hybrid"
                stroke={theme.series[1]}
                strokeWidth={2}
                dot={false}
                {...anim}
              />
              <Line
                type="monotone"
                dataKey="baseline"
                name="Baseline"
                stroke={theme.series[2]}
                strokeWidth={2}
                dot={false}
                {...anim}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
          <ChartCard title="Loading" height={120} loading>
            <div />
          </ChartCard>
          <ChartCard
            title="Empty"
            height={120}
            empty={{ title: "No trades in this range", description: "Pick a longer range." }}
          >
            <div />
          </ChartCard>
          <ChartCard
            title="Error"
            height={120}
            error={new Error("Request timed out after 30 s")}
            onRetry={() => {}}
          >
            <div />
          </ChartCard>
        </div>
      </div>
    </Section>
  );
}

const positionColumns: Column<Position>[] = [
  {
    id: "symbol",
    header: "Symbol",
    mobile: "title",
    sortValue: (p) => p.symbol,
    cell: (p) => <SymbolLabel symbol={p.symbol} />,
  },
  {
    id: "side",
    header: "Side",
    mobile: "subtitle",
    cell: (p) => <EnumBadge kind="side" value={p.side} size="xs" />,
  },
  {
    id: "size",
    header: "Size",
    align: "right",
    mobileLabel: "Size",
    sortValue: (p) => p.notional,
    cell: (p) => <span className="num">{formatSize(p.size, splitSymbol(p.symbol).base)}</span>,
    hideBelow: "lg",
  },
  {
    id: "entry",
    header: "Entry",
    align: "right",
    cell: (p) => <span className="num">{formatPrice(p.entry_price)}</span>,
  },
  { id: "mark", header: "Mark", align: "right", cell: (p) => <PriceText value={p.current_price} /> },
  {
    id: "pnl",
    header: "Unrealized P&L",
    align: "right",
    mobile: "value",
    sortValue: (p) => p.unrealized_pnl,
    info: "Net of the entry fee already paid.",
    cell: (p) => <PnlText value={p.unrealized_pnl} pct={p.unrealized_pnl_pct} />,
  },
  {
    id: "r",
    header: "R",
    align: "right",
    mobile: "meta",
    sortValue: (p) => p.r_multiple,
    cell: (p) => <span className="num text-fg-muted">{formatR(p.r_multiple)}</span>,
  },
  {
    id: "confidence",
    header: "AI",
    align: "right",
    info: "AI confidence at entry; the tick marks the 65 % trading threshold.",
    sortValue: (p) => p.ai_confidence,
    cell: (p) => <ConfidenceMeter value={p.ai_confidence} threshold={65} />,
    hideBelow: "2xl",
  },
  {
    id: "age",
    header: "Open for",
    align: "right",
    sortValue: (p) => p.duration_sec,
    cell: (p) => <span className="num text-fg-muted">{formatDuration(p.duration_sec)}</span>,
    hideBelow: "xl",
  },
  {
    id: "regime",
    header: "Regime",
    cell: (p) => <EnumBadge kind="regime" value={p.regime} size="xs" short />,
    hideBelow: "xl",
  },
];

export function TableSection() {
  const [selected, setSelected] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const active = SAMPLE_POSITIONS.find((p) => p.id === selected) ?? null;
  return (
    <Section
      id="table"
      title="DataTable"
      description="Sortable, sticky header, row click, skeleton / empty / error states; stacked cards on small screens."
    >
      <Card>
        <CardHeader title="Open positions" subtitle="Sample rows · click a row" icon={Layers} />
        <DataTable
          columns={positionColumns}
          data={SAMPLE_POSITIONS}
          rowKey={(p) => p.id}
          onRowClick={(p) => setSelected(p.id)}
          isRowSelected={(p) => p.id === selected}
          defaultSort={{ id: "pnl", desc: true }}
          footer={
            <Pagination offset={offset} limit={3} total={27} noun="positions" onOffsetChange={setOffset} />
          }
        />
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Card layout" subtitle="mobile roles: title · subtitle · value · meta · detail" />
          <DataTable
            columns={positionColumns}
            data={SAMPLE_POSITIONS.slice(0, 2)}
            rowKey={(p) => p.id}
            mobileBreakpoint="3xl"
          />
        </Card>
        <Card>
          <CardHeader title="Loading" />
          <DataTable
            columns={positionColumns.slice(0, 4)}
            data={undefined}
            loading
            rowKey={(p) => p.id}
            skeletonRows={4}
            mobileBreakpoint={false}
          />
        </Card>
        <Card>
          <CardHeader title="Empty" />
          <DataTable
            columns={positionColumns.slice(0, 4)}
            data={[]}
            rowKey={(p) => p.id}
            mobileBreakpoint={false}
            empty={{
              icon: Inbox,
              title: "No open positions",
              description: "The bot opens one when a signal passes every risk check.",
            }}
          />
        </Card>
      </div>
      <Drawer
        open={active !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        title={active ? `${active.symbol} · ${active.side === "LONG" ? "Long" : "Short"}` : ""}
        description={active?.entry_reason}
        headerExtra={
          active ? (
            <PnlText value={active.unrealized_pnl} pct={active.unrealized_pnl_pct} className="text-lg" />
          ) : null
        }
        footer={
          <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
            Close
          </Button>
        }
      >
        {active ? (
          <StatGrid
            divided
            columns={2}
            items={[
              { label: "Entry", value: formatPrice(active.entry_price) },
              { label: "Mark", value: <PriceText value={active.current_price} /> },
              { label: "Stop loss", value: formatPrice(active.stop_loss), tone: "down" },
              { label: "Take profit", value: formatPrice(active.take_profit), tone: "up" },
              { label: "Size", value: formatSize(active.size, splitSymbol(active.symbol).base) },
              { label: "Risk", value: formatUsd(active.risk_amount), info: "Lost if the stop is hit." },
              { label: "R multiple", value: formatR(active.r_multiple) },
              { label: "Opened", value: <Timestamp value={active.opened_at} /> },
            ]}
          />
        ) : null}
      </Drawer>
    </Section>
  );
}

export function FeedbackSection() {
  return (
    <Section id="feedback" title="Loading, empty & error states">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <EmptyState
            icon={Inbox}
            title="No trades yet"
            description="Closed trades appear here as soon as the bot exits its first position."
            action={<Button size="sm">Run a backtest</Button>}
          />
        </Card>
        <Card>
          <ErrorState error={new Error("Can't reach the API server.")} onRetry={() => {}} />
        </Card>
        <Card>
          <ErrorState
            error={
              new ApiError({
                status: 503,
                kind: "http",
                detail: "Trading engine has not published state yet",
                path: "/api/portfolio",
              })
            }
          />
        </Card>
        <Card className="space-y-3 p-4">
          <ErrorState compact error={new Error("Request timed out after 15 s")} onRetry={() => {}} />
          <div className="flex items-center gap-2 text-dense text-fg-muted">
            <Spinner /> Loading decisions…
          </div>
          <Skeleton className="h-4 w-1/2" />
          <SkeletonTable rows={3} columns={4} className="-mx-4" />
        </Card>
        <SkeletonCard />
        <Card className="p-4">
          <SkeletonChart height={150} />
        </Card>
        <Card>
          <CardHeader
            title="Risk meters"
            info="ProgressBar: fill = severity (accent → warning → down), track = same hue lighter."
          />
          <CardBody className="space-y-3.5">
            <ProgressBar label="Daily loss" valueLabel="$42 / $200" value={21} status="ok" />
            <ProgressBar label="Exposure" valueLabel="118% / 150%" value={78.7} status="warning" />
            <ProgressBar
              label="Drawdown"
              valueLabel="−13.6% / −15%"
              value={90.7}
              status="critical"
              markerPct={80}
            />
            <ProgressBar label="Positions" valueLabel="3 / 3" value={100} status="breached" />
            <ProgressBar label="Backtest progress" valueLabel="64%" value={64} tone="info" size="xs" />
          </CardBody>
        </Card>
      </div>
    </Section>
  );
}

export function OverlaysSection() {
  const [dialog, setDialog] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [columns, setColumns] = useState(true);
  return (
    <Section
      id="overlays"
      title="Overlays"
      description="Dialog, confirm, drawer (right on desktop, bottom sheet on phones), popover, menu, tooltip."
    >
      <Card>
        <CardBody className="flex flex-wrap items-center gap-2 pt-4">
          <Button onClick={() => setDialog(true)}>Open dialog</Button>
          <Button variant="danger-ghost" leftIcon={Trash2} onClick={() => setConfirm(true)}>
            Delete backtest…
          </Button>
          <Button onClick={() => setDrawer(true)}>Open drawer</Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button leftIcon={Bell}>Popover</Button>
            </PopoverTrigger>
            <PopoverContent align="start">
              <SectionHeader title="Quick stats" />
              <StatGrid
                columns={2}
                items={[
                  { label: "Signals today", value: "42" },
                  { label: "Executed", value: "7" },
                ]}
              />
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton icon={Ellipsis} label="More actions" variant="outline" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem icon={Pencil}>Rename</DropdownMenuItem>
              <DropdownMenuItem icon={Download} shortcut="⌘E">
                Export
              </DropdownMenuItem>
              <DropdownMenuCheckboxItem checked={columns} onCheckedChange={(v) => setColumns(v === true)}>
                Show all columns
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={Trash2} tone="danger">
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip content="Tooltips explain; they never hold the only copy of a value.">
            <Button variant="ghost">Hover me</Button>
          </Tooltip>
          <span className="inline-flex items-center gap-1 text-xs text-fg-subtle">
            pos_3f9a1c2b7d10 <CopyButton value="pos_3f9a1c2b7d10" label="Copy id" />
          </span>
          <span className="text-xs text-fg-subtle">
            <Timestamp value="2026-10-04T12:32:05Z" /> ·{" "}
            <Timestamp value={LOADED_AT - 42_000} mode="relative" />
          </span>
        </CardBody>
      </Card>
      <Dialog
        open={dialog}
        onOpenChange={setDialog}
        title="Run backtest"
        description="Replays the trading core on historical candles."
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setDialog(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={() => setDialog(false)}>
              Run
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Symbol" htmlFor="dlg-symbol">
            <Input id="dlg-symbol" defaultValue="BTC/USDT" />
          </Field>
          <Field label="Starting balance" htmlFor="dlg-balance">
            <NumberInput id="dlg-balance" value={10000} onValueChange={() => {}} unit="USDT" step={100} />
          </Field>
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        tone="danger"
        title="Delete this backtest?"
        description="The result and its charts are removed permanently."
        confirmLabel="Delete"
        onConfirm={() => setConfirm(false)}
      />
      <Drawer
        open={drawer}
        onOpenChange={setDrawer}
        title="AI decision · BTC/USDT"
        description="LONG · 78% confidence · 2 minutes ago"
      >
        <div className="space-y-4 text-dense text-fg-muted">
          <p>
            EMA 21 crossed above EMA 50 on the 5-minute chart with rising MACD momentum and volume 1.6× the
            20-bar average.
          </p>
          <StatGrid
            columns={3}
            items={[
              { label: "Entry", value: formatPrice(97048.5) },
              { label: "Stop", value: formatPrice(95890), tone: "down" },
              { label: "Target", value: formatPrice(99360), tone: "up" },
            ]}
          />
          {Array.from({ length: 8 }, (_, i) => (
            <p key={i}>
              Scrollable body paragraph {i + 1}: drawers keep the header and footer fixed while the content
              scrolls.
            </p>
          ))}
        </div>
      </Drawer>
    </Section>
  );
}
