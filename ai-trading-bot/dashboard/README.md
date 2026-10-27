# AI Trading Bot — dashboard

Real-time monitoring terminal for the trading engine: React 19 · TypeScript (strict) · Vite ·
Tailwind CSS 4 · TanStack Query · Zustand · React Router 7 · Radix primitives · Framer Motion ·
Recharts 3 · TradingView Lightweight Charts 5 · Lucide · sonner.

This file is the **contract for everyone building pages**. Read it once end to end before you
write code; the dev-only showcase at **`/_design`** shows every primitive live (dark and light).

```bash
npm run dev          # Vite on :5173 (PORT=5180 npm run dev for another port); proxies /api and /ws
npm run typecheck    # tsc -b (app + tests + configs)
npm run lint         # eslint (react-hooks v7 rules included)
npm test             # vitest (jsdom)
npm run build        # typecheck + production build into dist/
npm run gen:types    # regenerate src/types/api.ts from backend/tradebot/schemas.py
npm run e2e          # Playwright (needs a running stack, see e2e/)
```

Before you report done: `npm run typecheck && npm run lint && npm test && npm run build` must all pass,
and your files must be Prettier-formatted (`npx prettier --write src/features/<domain> src/pages/<Name>Page.tsx`;
the whole tree is formatted, so `npx prettier --check .` stays clean).

---

## 1. Ground rules (non-negotiable)

1. **No new dependencies.** Everything the dashboard needs is installed. Do not run `npm install <pkg>`.
2. **Never edit `src/types/api.ts`** — it is generated from `backend/tradebot/schemas.py`
   (`npm run gen:types`). Import contract types from `@/types`.
3. **No mock data in pages.** Pages render what the API serves, with real loading / empty / error
   states. Static sample data is allowed only in the dev showcase (`src/pages/design/`).
4. **The dashboard never controls trading.** No buttons that open, close or modify positions —
   there are no such endpoints. Settings forms (PUT `/api/settings`), notification read flags and
   backtests are the only writes.
5. **Units** (from the contract): every `*_pct`, `confidence`, `win_rate`, `*_accuracy`,
   `utilization_pct`, `progress` is **already in percent units** (`4.82` = 4.82 %, never × 100).
   Ratios (`profit_factor`, `sharpe`, `risk_reward`, `r_multiple`…) are plain numbers. Money is
   USDT. Datetimes are UTC ISO strings; chart `time` fields are **unix seconds**. Symbols are `BTC/USDT`.
6. **Shared foundation is read-only for page builders.** Do not edit `src/components/**`,
   `src/lib/**`, `src/hooks/**`, `src/stores/**`, `src/app/**`, `src/index.css`, `src/test/**`
   (several page builds run in parallel). If you need something that is missing, build it inside
   your feature folder and mention it in your report so it can be promoted later.
7. **Color only through semantic tokens.** Tailwind's default palette is removed (`bg-red-500`
   doesn't exist). Use `text-fg-muted`, `bg-surface`, `text-up`, `border-line`… (§5). No raw hex
   in components; charts take colors from `useChartTheme()`.
8. **Every number goes through `lib/format.ts`; every enum label / color / icon through
   `lib/constants.ts`** (or `<EnumBadge>`). Never hand-format a price or invent a label.
9. **Data only through the hooks** in `src/hooks/queries.ts` and `src/hooks/live.ts`. No `fetch`
   in components; never re-implement polling or WebSocket handling.

## 2. Folder structure

```
src/
  app/                 routes.ts (one lazy chunk per page), LiveDataProvider (starts the WebSocket)
  types/               api.ts GENERATED · index.ts (WsFrame helpers, filter param types, Tone)
  lib/                 api.ts (REST client) · ws.ts (WebSocket manager) · live-sync.ts (frames → cache)
                       format.ts · time.ts · constants.ts · tones.ts · motion.ts · theme.ts · cn.ts
                       query-client.ts · query-keys.ts
  stores/live.ts       Zustand: connection, heartbeat, tickers, last 500 events
  hooks/               queries.ts (one hook per endpoint) · live.ts (WebSocket hooks)
                       use-url-state · use-media-query · use-element-size · use-fallback-interval
  components/ui/       design-system primitives (import from "@/components/ui")
  components/charts/   chart theme, Recharts blocks, Sparkline, lightweight-theme.ts
  components/layout/   app shell, nav, status/mode badges, notification center, LiveTag
  features/<domain>/   YOUR CODE: market, ai, positions, trades, performance, risk, backtests,
                       system, settings (overview = KPI cards, already built)
  pages/<Name>Page.tsx one file per route — replace the placeholder of your page
  pages/design/        /_design showcase (dev only)
  test/                setup, fixtures (typed contract objects), FakeSocket
```

Routes: `/` Overview · `/markets` · `/positions` · `/trades` · `/ai` · `/performance` · `/risk` ·
`/backtests` · `/system` · `/settings` (+ `/_design` in dev). A page file default-exports its
component; the router, error boundary, Suspense skeleton, page transition and document title are
already wired. Keep pages thin: `pages/MarketsPage.tsx` composes components from
`features/market/`.

### Overview widgets (export these for the Overview composition)

The Overview (`src/pages/OverviewPage.tsx`) shows labelled placeholder slots that will be filled
with widgets from the feature folders. Export each as a self-contained card from
`features/<domain>/index.ts`: it takes at most a `symbol` / `className` prop, fetches its own
data through the hooks, handles loading / empty / error itself, and works from 320 px wide up.

| Slot                                                                      | Folder               | Suggested export                  |
| ------------------------------------------------------------------------- | -------------------- | --------------------------------- |
| Market chart (candles, overlays, signals, trade markers, position levels) | `features/market`    | `MarketChartCard({ symbol? })`    |
| Multi-timeframe alignment                                                 | `features/market`    | `MtfCard({ symbol? })`            |
| Market regime                                                             | `features/market`    | `RegimeCard({ symbol? })`         |
| Latest AI decision                                                        | `features/ai`        | `LatestDecisionCard({ symbol? })` |
| Open positions                                                            | `features/positions` | `OpenPositionsCard()`             |
| Risk summary (meters, halt)                                               | `features/risk`      | `RiskSummaryCard()`               |
| Event stream                                                              | `features/system`    | `EventStreamCard()`               |

`symbol` defaults to the engine's primary symbol (`useSymbols().primary`).

## 3. Page anatomy and layout

```tsx
export default function PositionsPage() {
  const nav = navItem("positions");                       // label, description, icon
  return (
    <>
      <PageHeader title={nav.label} description={nav.description} icon={nav.icon}
        meta={<LiveTag />} actions={<SegmentedControl … />} />
      <FilterBar>…filters that scope everything below…</FilterBar>   {/* optional, one row */}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">…main…</div>
        <div className="min-w-0 space-y-4">…side…</div>
      </div>
    </>
  );
}
```

- The shell already provides the max width (1760 px), horizontal padding and top spacing. **Do not
  add page padding or a page max-width.** The bottom tab bar space on phones is handled too.
- Spacing: `gap-4` / `space-y-4` between cards (`gap-3` for dense KPI rows); `mb-4` under a
  FilterBar; card internals use `CardHeader` + `CardBody` (px-4) — don't re-pad.
- Grids: KPI/stat rows `grid grid-cols-2 gap-3 lg:grid-cols-4`; main + side `xl:grid-cols-3` with
  `xl:col-span-2`; equal cards `grid gap-4 md:grid-cols-2 2xl:grid-cols-3`. Always `min-w-0` on
  grid children that contain charts or tables.
- Breakpoints (Tailwind): `xs` 480 · `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536 ·
  `3xl` 1792. Targets: 1920×1080, 1440×900, 1280 (MacBook), 768–1024 (tablet), 390 (phone).
- **Mobile is a reorganisation, not a shrink**: the most important numbers first (`order-*`, or
  render a different arrangement with `useIsMobile()` / `useBreakpoint("lg")`), tables become
  stacked cards (§9), secondary columns/panels collapse into tabs or drawers. Nothing may overflow
  horizontally at 390 px.
- Detail views open in a `<Drawer>` (right panel on desktop, bottom sheet on phones), not a new route.
  Keep selection in the URL with `useUrlState("position", "")` so it survives refresh.
- Linkable state (symbol, timeframe, range, tab, filters, page) goes in the URL via
  `useUrlState` / `useUrlNumber` (`src/hooks/use-url-state.ts`). The top-bar tickers link to
  `/markets?symbol=BTC%2FUSDT` — Markets must honour `?symbol=`.

## 4. Typography

| Use                                                     | Classes                                                                            |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Page title                                              | provided by `PageHeader` (20 px semibold)                                          |
| Card title                                              | provided by `CardHeader` (13.5 px semibold)                                        |
| Section label (11 px uppercase, tracked)                | `label-caps` (or `SectionHeader`)                                                  |
| Body / table text                                       | `text-dense` (13 px) · secondary `text-xs` (12 px) · base `text-sm` (14 px)        |
| Any number in a table, list, price, timestamp, log line | add `num` (JetBrains Mono, tabular figures)                                        |
| Big stat values (KPI-size, 24–28 px)                    | `text-kpi font-semibold` in Inter (**proportional** figures — no `num`)            |
| Ink                                                     | `text-fg` primary · `text-fg-muted` secondary · `text-fg-subtle` tertiary/captions |

Never use font sizes below 10 px; avoid `font-bold` except in status pills. Sentence case for labels
("Open positions"), uppercase only via `label-caps` / status pills.

## 5. Color and tone

Tokens (switch with the theme automatically): surfaces `bg-canvas` `bg-surface` `bg-surface-2`
`bg-surface-3` `bg-elevated`; ink `text-fg` `text-fg-muted` `text-fg-subtle` `text-fg-disabled`;
lines `border-line` `border-line-strong` `border-line-subtle`; semantic `up` (profit / bullish /
OK), `down` (loss / bearish / error), `warning`, `info`, `accent` (indigo: selection, active, links,
primary buttons), `ai` (violet: **only** AI-generated content — signals, confidence, model info).
Opacity modifiers work: `bg-up/10`, `ring-down/25`.

Every colored primitive takes a semantic `tone`: `"neutral" | "muted" | "up" | "down" | "warning" |
"info" | "accent" | "ai"` (class tables in `lib/tones.ts`: `TONE_TEXT`, `TONE_SOFT`, `TONE_BG`,
`TONE_CHIP`…). **Color never carries meaning alone**: pair it with a sign (+/−), an arrow (▲/▼), an
icon or a label.

Surfaces: `Card` (default) is the lifted panel; `variant="inset"` for a recessed sub-panel inside a
card; `variant="glass"` only for floating/sticky chrome. Don't nest default cards inside cards.

## 6. Primitives (`@/components/ui`)

| Component                                                                           | Use for                                    | Key props                                                                                                                                                                               |
| ----------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Card`, `CardHeader`, `CardBody`, `CardFooter`                                      | every widget                               | Card `variant` default·inset·glass·outline·ghost, `interactive`; CardHeader `title subtitle icon info actions badge borderless`                                                         |
| `PageHeader`, `SectionHeader`                                                       | page top; 11 px group labels               | `title description icon actions meta`; `title count info actions`                                                                                                                       |
| `Button`, `IconButton`                                                              | actions                                    | Button `variant` primary·secondary·outline·ghost·danger·danger-ghost·link, `size` xs·sm·md·lg, `leftIcon loading asChild`; IconButton `icon label` (required, also the tooltip) `badge` |
| `Badge` / `Pill`, `EnumBadge`, `StatusDot`                                          | labels and states                          | Badge `tone variant(soft·solid·outline·plain) size icon dot caps`; **`<EnumBadge kind="regime" value={…} short? describe? />`** for any API enum; StatusDot `tone pulse`                |
| `Tooltip`, `InfoTooltip`                                                            | hover/focus explanations                   | Tooltip `content side`; InfoTooltip `content` (ⓘ next to metric labels)                                                                                                                 |
| `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`                                       | page sections, card views                  | TabsList `variant` underline·pills                                                                                                                                                      |
| `SegmentedControl`                                                                  | timeframes, ranges, small view switches    | `options value onValueChange aria-label size fullWidth`                                                                                                                                 |
| `Select`                                                                            | symbol, filters                            | `options value onValueChange placeholder size` (values must be non-empty: use `"all"` sentinel)                                                                                         |
| `Input`/`Textarea`, `NumberInput`, `Switch`, `Checkbox`, `Slider`, `Label`, `Field` | forms                                      | NumberInput `value onValueChange min max step unit decimals allowEmpty`; Field `label htmlFor hint error info layout(stacked·inline) aside`                                             |
| `DropdownMenu*`, `Popover*`                                                         | menus, small panels                        | `DropdownMenuItem icon tone="danger" onSelect`                                                                                                                                          |
| `Dialog`, `ConfirmDialog`, `Drawer` (`Sheet`)                                       | forms, destructive confirms, detail panels | `open onOpenChange title description footer size`; Drawer `side` auto·right·left·bottom, `headerExtra`                                                                                  |
| `DataTable`                                                                         | any tabular list                           | see §9                                                                                                                                                                                  |
| `Pagination`, `FilterBar` / `FilterBarSpacer`                                       | API pages, filter rows                     | Pagination `offset limit total onOffsetChange noun`                                                                                                                                     |
| `KeyValue`, `StatGrid`                                                              | detail panels, stat blocks                 | `label value info sub tone mono orientation`; StatGrid `items columns(2·3·4·6) divided`                                                                                                 |
| `ProgressBar`                                                                       | risk meters, utilization, progress         | `value max status(ok·warning·critical·breached) thresholds label valueLabel markerPct`                                                                                                  |
| `ConfidenceMeter`                                                                   | AI confidence anywhere                     | `value threshold variant(inline·bar·text)`                                                                                                                                              |
| `SymbolLabel`                                                                       | a trading pair                             | `symbol size monogram quote`                                                                                                                                                            |
| `PriceText`                                                                         | live prices (flashes green/red on change)  | `value format flash`                                                                                                                                                                    |
| `PnlText`                                                                           | signed, colored money P&L (+ %)            | `value pct pctOnly animate compact`                                                                                                                                                     |
| `DeltaBadge`                                                                        | ▲/▼ change vs a previous period            | `change changePct format(currency·percent·pp·number·count·ratio) invert variant(text·pill)`                                                                                             |
| `AnimatedNumber`                                                                    | KPI-like numbers that count to new values  | `value format duration` (reduced-motion aware)                                                                                                                                          |
| `Timestamp`, `RelativeTime`                                                         | any time                                   | `mode` time·datetime·date·relative (local time, UTC in tooltip)                                                                                                                         |
| `Skeleton`, `SkeletonText/Kpi/Card/Chart/Table`                                     | first-load placeholders                    | size with classes                                                                                                                                                                       |
| `EmptyState`, `ErrorState`                                                          | nothing to show / failures                 | `icon title description action size`; ErrorState `error onRetry compact`                                                                                                                |
| `ScrollArea`, `Separator`, `Kbd`, `CopyButton`, `Spinner`                           | misc                                       |                                                                                                                                                                                         |

Layout components you may use (`@/components/layout/…`): `LiveTag` (CardHeader `badge` for
WebSocket-fed widgets: "LIVE ●" / "POLLING"), `BotStatusPill`, `TradingModeBadge`,
`ConnectionBadge`. The app shell (top bar, nav, banners, notification center, toasts) is done —
pages never render their own.

## 7. Data: hooks, caching and live updates

```tsx
const { data, isPending, error, refetch, isFetching } = usePositions();
```

REST hooks (`@/hooks/queries`) — one per endpoint, typed, cached under `lib/query-keys.ts`:

| Live state (kept fresh by WebSocket frames; poll every 5 s only while the socket is down) | History / analytics                                                                                                                      |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `useStatus()` `usePortfolio()` `usePositions()` `useRisk()`                               | `usePosition(id, tf?)` `useTrades(filters)` `useTrade(id, tf?)`                                                                          |
| `useAiLatest(symbol)` `useWatchlist()` `useMtf(symbol)` `useRegime(symbol)`               | `usePerformance(range)` `useAiHistory(filters)` `useAiAnalytics(range)` `useAiModels()`                                                  |
| `useNotifications(params)` `useSettings()` `useSymbols()`                                 | `useMarket(symbol, tf, limit?)` `useBacktests()` `useBacktest(id)` (polls while queued/running) `useSystem()` (5 s) `useEvents(filters)` |

Mutations: `useSaveSettings()`, `useMarkNotificationsRead()` (optimistic), `useRunBacktest()`,
`useDeleteBacktest()`; `exportTradesCsv(filters)` downloads the CSV with the auth header.

Live hooks (`@/hooks/live`):

| Hook                                             | Returns                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `useConnectionStatus()` / `useConnection()`      | `"connecting" \| "live" \| "reconnecting" \| "offline"` / details + `retryNow`       |
| `useBotStatus()`                                 | `{ status, state: online·degraded·offline·unknown, heartbeatAgeSec }`                |
| `useTradingMode()`                               | `"paper" \| "live" \| undefined`                                                     |
| `useTicker(symbol)` / `useTickers()`             | freshest ticker (WS or REST)                                                         |
| `useCandleStream(symbol, tf, onCandle)`          | ref-counted `subscribe_chart`; callback gets forming/closed candles + overlay values |
| `useWsFrame(type, handler)`                      | react to one frame type (`"trade_closed"`, `"ai_analysis"`, …)                       |
| `useLiveEvents(filter)` / `useEventFeed(filter)` | events since load / REST page merged with live events (newest first)                 |

How live data flows (already wired, don't duplicate): the WebSocket manager (`lib/ws.ts`)
reconnects with backoff, resumes from the last event id and re-subscribes charts; `lib/live-sync.ts`
writes `status`, `portfolio`, `positions`, `risk`, `mtf`, `regime`, `ai_analysis` (latest per
symbol), `notification`, `settings` and `ticker` frames into the query cache, and invalidates
trades / performance / AI analytics / AI history when a trade closes or a new decision arrives.
After a reconnect every query is refetched. So **a component that uses `usePortfolio()` is
already real-time** — never add `refetchInterval` to WebSocket-fed hooks.

Building a WebSocket-driven view:

```tsx
// Live list that animates new rows in
const { events, isPending, error, refetch } = useEventFeed({
  types: ["TRADE_EXECUTED", "TRADE_CLOSED"],
  limit: 50,
});
<AnimatePresence initial={false}>
  {events.map((e) => (
    <motion.li key={e.id} layout="position" {...motionPresets.listItem}>
      …
    </motion.li>
  ))}
</AnimatePresence>;

// Live candles on a Lightweight chart
const snapshot = useMarket(symbol, tf); // history (REST)
useCandleStream(symbol, tf, ({ candle, indicators }) => {
  // live (WS)
  candleSeries.current?.update(lwCandle(candle));
});

// Something that must react when a trade closes
useWsFrame("trade_closed", (trade) => toast(`${trade.symbol} closed ${formatPnl(trade.pnl)}`));
```

Errors are `ApiError`s (`status`, `kind`, `detail`, `fieldErrors()` for 422 form errors). A 503 means
the engine hasn't published that state yet (`isEngineUnavailable`) — `ErrorState` renders it as a
calm "Waiting for the trading engine" state; a network failure or a proxy 502/504
(`isUnreachable`) reads "Can't reach the API server"; 401 tells the user to add `?token=`. Use
`describeError(error)` for toast text. Connection / engine problems are already explained once,
globally, by the banner under the top bar — pages don't add their own connectivity warnings.

## 8. Loading, empty and error states

```tsx
const q = useTrades(filters);
<Card>
  <CardHeader title="Closed trades" subtitle={q.data ? `${formatInt(q.data.total)} trades` : undefined} />
  <DataTable
    data={q.data?.items}
    loading={q.isPending}
    fetching={q.isFetching && !q.isPending}
    error={q.error}
    onRetry={() => void q.refetch()}
    rowKey={(t) => t.id}
    columns={columns}
    empty={{
      title: "No closed trades yet",
      description: "Trades appear here as soon as the bot closes its first position.",
    }}
  />
</Card>;
```

- **Skeleton only on the first load** (`isPending`). On refetch keep the previous render and dim it
  (`fetching`); the hooks already keep previous data while filters change. Never flash a skeleton
  or blank the screen on a background refresh.
- **Empty states explain** what will appear and when ("No open positions — the bot opens one when a
  signal passes every risk check."), with an icon and, if useful, an action.
- **Errors** say what happened in plain language with a retry; keep showing stale data if there is
  any (`error && !data` → ErrorState; `error && data` → a small inline notice at most).
- Charts: `ChartCard` has `loading fetching error onRetry empty` built in.

## 9. Tables (and the mobile pattern)

```tsx
const columns: Column<Position>[] = [
  {
    id: "symbol",
    header: "Symbol",
    mobile: "title",
    cell: (p) => <SymbolLabel symbol={p.symbol} />,
    sortValue: (p) => p.symbol,
  },
  {
    id: "side",
    header: "Side",
    mobile: "subtitle",
    cell: (p) => <EnumBadge kind="side" value={p.side} size="xs" />,
  },
  {
    id: "pnl",
    header: "Unrealized P&L",
    align: "right",
    mobile: "value",
    cell: (p) => <PnlText value={p.unrealized_pnl} pct={p.unrealized_pnl_pct} />,
    sortValue: (p) => p.unrealized_pnl,
  },
  {
    id: "entry",
    header: "Entry",
    align: "right",
    cell: (p) => <span className="num">{formatPrice(p.entry_price)}</span>,
  },
  {
    id: "opened",
    header: "Opened",
    align: "right",
    mobile: "meta",
    hideBelow: "lg",
    cell: (p) => <Timestamp value={p.opened_at} mode="relative" />,
  },
];
<DataTable
  columns={columns}
  data={positions}
  rowKey={(p) => p.id}
  onRowClick={open}
  density="compact"
  maxHeight={480}
/>;
```

- Below `mobileBreakpoint` (default `md`) rows render as **stacked cards**: `title`/`subtitle` on the
  left, `value`/`meta` on the right, every `detail` column (the default) in a two-column grid
  labelled with its header (`mobileLabel` overrides), `hidden` drops it.
- Sorting: give `sortValue` for client-side sort; for server-side sort pass `sort` + `onSortChange`
  (`TradeSortKey` in `@/types`). First click sorts descending.
- Numbers right-aligned with `num`; `hideBelow` drops secondary columns on narrower screens;
  `maxHeight` gives a scrolling body with a sticky header; `animateRows` for live tables.

## 10. Formatting (`@/lib/format`) and constants (`@/lib/constants`)

`formatPrice` (adaptive decimals) · `formatUsd` (`compact`, `signed`) · `formatPnl` (always signed) ·
`formatPct(value, { signed, decimals })` (**input already in percent**) · `formatSignedPct` ·
`formatNumber` · `formatInt` · `formatCompact`/`formatVolume` · `formatRatio` (∞) · `formatR` ·
`formatSize(size, "BTC")` · `formatBps` · `formatMs` · `formatMb` · `formatDuration(sec)` ·
`formatTime`/`formatDate`/`formatDateTime` (local) · `formatUtc` · `formatRelativeTime` ·
`formatAgo(sec)` · `formatDayLabel` · `formatChartTime(unix, tf)` · `splitSymbol` · `toneOf(value,
{ invert })` · `signOf`. Missing values render "—"; negatives use the real minus "−".
`useNow()` (`@/lib/time`) is the shared 1 s clock for anything relative ("12s ago", durations
of open positions, countdowns) — never start your own interval for that.

Constants: `NAV_ITEMS`/`navItem(key)`, `TIMEFRAMES`, `TIMEFRAME_LABEL`, `TIMEFRAME_SECONDS`,
`PERFORMANCE_RANGES`, and a `Meta` (`label short tone icon description`) for every enum:
`REGIME_META SIGNAL_META SIDE_META TREND_META EMA_ALIGNMENT_META EXIT_REASON_META TRADE_RESULT_META
RISK_STATUS_META EVAL_STATUS_META STRATEGY_META AI_PROVIDER_META ORDER_TYPE_META FEED_META
CHART_MARKER_META PRICE_LEVEL_META SEVERITY_META HEALTH_STATE_META RISK_METER_STATUS_META
BACKTEST_STATUS_META EVENT_TYPE_META NOTIFICATION_TYPE_META TRADING_MODE_META BOT_STATE_META
CONNECTION_META`. `HealthState "disabled"` = not configured → grey, never red.

## 11. Charts

Chart colors come from **`useChartTheme()`** (`@/components/charts`), which switches with the
theme: `up down upFill downFill accent ai warning info deemphasis grid axis axisLine crosshair
tooltip series[0..5] overlays.{ema9,ema21,ema50,ema200,vwap,bb*} volumeUp volumeDown`.

Rules (validated with the dataviz method — follow them):

- **One y-axis per chart.** Two measures of different scale → two charts.
- Categorical series take `theme.series[0]`, `[1]`, … **in fixed order, by entity** (BTC is always
  the same slot on a page); never cycle past 6. Scatter / small multiples: at most 3 series.
- `up`/`down` mean profit/loss (bull/bear) only, and always with a second cue (sign, ▲/▼, position
  above/below zero). A series that is _just_ "series 2" never wears up/down/warning.
- Light mode: series 2, 3 and 6 are below 3:1 on white → label them directly or give `ChartCard`
  a `table` twin. Every multi-series chart gets a legend (`legend` prop) and should have `table`.
- Lines 2 px, area wash ~10 %, bars ≤ 24 px with a 4 px rounded data end (`BAR_RADIUS`), solid
  hairline grid (never dashed), tooltips list every series at the hovered x, value first.
- Emphasis form: context in `theme.deemphasis`, the one series that matters in `theme.accent`.
- The container height includes the x-axis band (ChartCard `height` does).

Recharts blocks: `ChartCard` (header, legend, states, table toggle), `ChartTooltipContent`,
`ChartLegend`, `xAxisProps(theme)`, `yAxisProps(theme)`, `gridProps(theme)`, `lineCursor`,
`barCursor`, `zeroLineProps`, `tickFormatters` (`usd usdCompact pnlCompact pct pctSigned number
compact dateFromUnix timeFromUnix dateFromIso`), `CHART_MARGIN`, `BAR_RADIUS`, `MAX_BAR_SIZE`,
`useChartAnimation()` (respects reduced motion). Example in `src/pages/design/ComponentSections.tsx`.

```tsx
const theme = useChartTheme();
const anim = useChartAnimation();
<ChartCard
  title="Equity"
  height={280}
  loading={q.isPending}
  error={q.error}
  onRetry={q.refetch}
  empty={!q.data?.equity_curve.length}
  table={<EquityTable points={q.data?.equity_curve} />}
>
  <ResponsiveContainer width="100%" height="100%">
    <AreaChart data={q.data?.equity_curve} margin={CHART_MARGIN}>
      <CartesianGrid {...gridProps(theme)} />
      <XAxis dataKey="time" {...xAxisProps(theme)} tickFormatter={tickFormatters.dateFromUnix} />
      <YAxis {...yAxisProps(theme)} tickFormatter={tickFormatters.usdCompact} domain={["auto", "auto"]} />
      <Tooltip
        cursor={lineCursor(theme)}
        content={
          <ChartTooltipContent
            valueFormatter={(v) => formatUsd(v)}
            labelFormatter={(t) => formatDateTime(Number(t))}
          />
        }
      />
      <Area
        dataKey="equity"
        name="Equity"
        stroke={theme.series[0]}
        fill={theme.series[0]}
        fillOpacity={0.1}
        strokeWidth={2}
        {...anim}
      />
    </AreaChart>
  </ResponsiveContainer>
</ChartCard>;
```

**Lightweight Charts** (candlesticks): import from `@/components/charts/lightweight-theme` (not the
barrel, so the library only loads where used): `lwChartOptions(theme)` (local-time axis +
crosshair, price formatter), `lwCandleOptions`, `lwVolumeOptions` + `lwVolumeScaleOptions`,
`lwOverlayOptions(theme.overlays.ema21)`, mappers `lwCandle`, `lwVolumeBar`, `lwLinePoint`,
`lwMarkers(theme, snapshot.markers, snapshot.candles)` (with `createSeriesMarkers`; passing the candles keeps exit labels off the candles), `lwPriceLine(theme, level)`
(entry/SL/TP of open positions). Re-apply `chart.applyOptions(lwChartOptions(theme))` and series
options when the theme changes; create the chart once per mount and `chart.remove()` on unmount.
Every candlestick chart in the app (Markets, position / trade detail) must use these helpers.

`Sparkline`: `<Sparkline data={…} />` colors by direction (ticker rows); stat tiles use
`tone="deemphasis" highlightLast`; `variant="bars"` for daily P&L/counts; `formatValue` enables
the hover readout.

## 12. Motion

Already handled: page transitions, dialog/drawer/popover transitions, banners, nav underline,
notification rows, KPI value counting, price flashes. Use only these when you need motion:
`motionPresets.fadeRise` (a panel appearing), `motionPresets.listItem` + `<AnimatePresence
initial={false}>` (a new row in a live list), `<AnimatedNumber>` (headline numbers),
`<PriceText>` (live prices), `DataTable animateRows`. Durations 120–240 ms, no bounce, no looping
animations except status pulses. `MotionConfig reducedMotion="user"` and a CSS media query
already disable motion for users who ask for it — don't bypass them.

## 13. Accessibility and interaction

Icon-only buttons need `label` (IconButton enforces it). Clickable rows/cards are keyboard
reachable (DataTable does it). Tooltips enhance but never hold the only copy of a value. Use real
headings (`CardHeader` renders `h3`). Toasts: `toast.success("Settings saved")`,
`toast.error(describeError(error))` from `sonner` — the shell already toasts trade and risk
notifications, don't duplicate those.

## 14. Testing

Vitest + Testing Library (jsdom). Put tests next to the code (`*.test.ts(x)`); test pure logic
(mappers, derivations, formatters) and key rendering. Typed contract fixtures live in
`src/test/fixtures.ts` (`makePortfolio()`, `makePosition()`, `makeTrade()`, `makeAnalysis()`,
`makeRisk()`, …), a WebSocket double in `src/test/fake-socket.ts`. Wrap components that use
tooltips in `<TooltipProvider>` and anything using query hooks in a `QueryClientProvider`.

## 15. Running against a backend

```bash
# whole stack (engine + API + Vite) from the repo root
ai-trading-bot/scripts/dev.sh                     # FEED=simulated to skip Binance

# or by hand (from ai-trading-bot/backend)
.venv/bin/python -m tradebot.engine_main --db /tmp/dash.db --feed simulated
.venv/bin/python -m tradebot.api.main --port 8200 --db /tmp/dash.db
# then, in dashboard/
VITE_API_PROXY=http://127.0.0.1:8200 PORT=5180 npm run dev
```

Vite proxies `/api` and `/ws` (WebSocket) to `VITE_API_PROXY` (default `http://127.0.0.1:8000`).
In production the API serves `dist/` itself on one port. If `DASHBOARD_TOKEN` is set on the API,
open the dashboard once with `?token=<token>`; it is stored and sent as a Bearer header / WS
query parameter. Without an engine the API answers 503 for live state — pages must show their
waiting/empty states, not crash.
