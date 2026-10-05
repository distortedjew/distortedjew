import { ArrowRight, Download, Play, Plus, RefreshCw, Settings2, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  AI_PROVIDER_META,
  BACKTEST_STATUS_META,
  EMA_ALIGNMENT_META,
  EVAL_STATUS_META,
  EVENT_TYPE_META,
  EXIT_REASON_META,
  FEED_META,
  HEALTH_STATE_META,
  NOTIFICATION_TYPE_META,
  REGIME_META,
  RISK_METER_STATUS_META,
  RISK_STATUS_META,
  SEVERITY_META,
  SIDE_META,
  SIGNAL_META,
  STRATEGY_META,
  TRADE_RESULT_META,
  TREND_META,
} from "@/lib/constants";
import type { Tone } from "@/types";
import { Badge, Pill } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EnumBadge, type EnumKind } from "@/components/ui/EnumBadge";
import { IconButton } from "@/components/ui/IconButton";
import { Kbd } from "@/components/ui/Kbd";
import { StatusDot } from "@/components/ui/StatusDot";
import { BotStatusPill } from "@/components/layout/BotStatusPill";
import { ConnectionBadge } from "@/components/layout/ConnectionIndicator";
import { LiveTradingBanner } from "@/components/layout/LiveTradingBanner";
import { TradingModeBadge } from "@/components/layout/TradingModeBadge";

export function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-32 space-y-3">
      <div>
        <h2 className="text-base font-semibold tracking-[-0.01em] text-fg">{title}</h2>
        {description ? <p className="text-dense text-fg-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Swatch({ name, cls, note }: { name: string; cls: string; note?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={cn("size-9 shrink-0 rounded-lg ring-1 ring-line-strong ring-inset", cls)} />
      <div className="min-w-0">
        <div className="font-mono text-[11px] text-fg">{name}</div>
        {note ? <div className="truncate text-[11px] text-fg-subtle">{note}</div> : null}
      </div>
    </div>
  );
}

export function ColorsSection() {
  const groups: { title: string; items: [string, string, string?][] }[] = [
    {
      title: "Surfaces",
      items: [
        ["canvas", "bg-canvas", "page"],
        ["surface", "bg-surface", "cards"],
        ["surface-2", "bg-surface-2", "raised / headers"],
        ["surface-3", "bg-surface-3", "pressed / inputs"],
        ["elevated", "bg-elevated", "popovers"],
      ],
    },
    {
      title: "Text & lines",
      items: [
        ["fg", "bg-fg", "primary text"],
        ["fg-muted", "bg-fg-muted", "secondary"],
        ["fg-subtle", "bg-fg-subtle", "labels, meta"],
        ["fg-disabled", "bg-fg-disabled", "disabled"],
        ["line-strong", "bg-line-strong", "borders"],
      ],
    },
    {
      title: "Meaning",
      items: [
        ["up", "bg-up", "profit, long, bullish"],
        ["down", "bg-down", "loss, short, bearish"],
        ["warning", "bg-warning", "caution, paper mode"],
        ["info", "bg-info", "neutral information"],
        ["accent", "bg-accent", "focus, selection, primary"],
        ["ai", "bg-ai", "AI-generated content"],
      ],
    },
    {
      title: "Chart series (fixed order)",
      items: [
        ["series-1", "bg-series-1"],
        ["series-2", "bg-series-2"],
        ["series-3", "bg-series-3"],
        ["series-4", "bg-series-4"],
        ["series-5", "bg-series-5"],
        ["series-6", "bg-series-6"],
      ],
    },
  ];
  return (
    <Section id="colors" title="Color tokens" description="Semantic tokens only — color always carries meaning.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {groups.map((g) => (
          <Card key={g.title}>
            <CardHeader title={g.title} />
            <CardBody className="space-y-2.5">
              {g.items.map(([name, cls, note]) => (
                <Swatch key={name} name={name} cls={cls} note={note} />
              ))}
            </CardBody>
          </Card>
        ))}
      </div>
    </Section>
  );
}

export function TypographySection() {
  return (
    <Section id="type" title="Typography" description="Inter Variable for UI, JetBrains Mono Variable for numbers, prices, timestamps and logs.">
      <Card>
        <CardBody className="grid gap-6 pt-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="text-xl leading-7 font-semibold tracking-[-0.02em]">Page title · 20 / 600</div>
            <div className="text-[13.5px] font-semibold">Card title · 13.5 / 600</div>
            <div className="text-sm text-fg">Body · 14 / 400 — The AI analyst found a bullish EMA stack on 5m and 1h.</div>
            <div className="text-dense text-fg-muted">Dense · 13 / 400 — used in tables and dense panels.</div>
            <div className="text-xs text-fg-subtle">Meta · 12 / 400 — Updated 2s ago</div>
            <div className="label-caps">Section label · 11 / 500 caps</div>
          </div>
          <div className="space-y-3">
            <div className="num-sans text-kpi font-semibold">$10,482.31</div>
            <div className="num text-lg">97,123.45 · 3,450.12 · 165.25</div>
            <div className="num text-dense text-fg-muted">0.0412 BTC · +1.24R · 14:32:05</div>
            <div className="font-mono text-xs text-fg-subtle">[14:32:05] AI_ANALYSIS BTC/USDT LONG 78%</div>
            <div className="flex items-center gap-1.5 text-xs text-fg-subtle">
              Shortcuts: <Kbd>Esc</Kbd> <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </div>
          </div>
        </CardBody>
      </Card>
    </Section>
  );
}

export function StatusSection() {
  return (
    <Section id="status" title="Status, mode & connection" description="Top-bar indicators, visible at every breakpoint.">
      <Card>
        <CardBody className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <BotStatusPill static state="online" heartbeatAgeSec={2} />
            <BotStatusPill static state="degraded" heartbeatAgeSec={24} />
            <BotStatusPill static state="offline" heartbeatAgeSec={134} />
            <BotStatusPill static state="unknown" heartbeatAgeSec={null} />
            <BotStatusPill static compact state="online" heartbeatAgeSec={2} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TradingModeBadge mode="paper" />
            <TradingModeBadge mode="paper" compact />
            <TradingModeBadge mode="live" />
            <TradingModeBadge mode="live" compact />
            <TradingModeBadge mode={undefined} />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <ConnectionBadge status="live" />
            <ConnectionBadge status="connecting" />
            <ConnectionBadge status="reconnecting" />
            <ConnectionBadge status="offline" />
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-fg-muted">
            {(["up", "warning", "down", "info", "accent", "ai", "muted"] as Tone[]).map((tone) => (
              <span key={tone} className="inline-flex items-center gap-1.5">
                <StatusDot tone={tone} pulse={tone === "up"} /> {tone}
              </span>
            ))}
          </div>
          <div className="overflow-hidden rounded-lg">
            <LiveTradingBanner frame={false} />
          </div>
        </CardBody>
      </Card>
    </Section>
  );
}

export function ButtonsSection() {
  return (
    <Section id="buttons" title="Buttons">
      <Card>
        <CardBody className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" leftIcon={Play}>
              Run backtest
            </Button>
            <Button leftIcon={Download}>Export CSV</Button>
            <Button variant="outline" rightIcon={ArrowRight}>
              All trades
            </Button>
            <Button variant="ghost" leftIcon={RefreshCw}>
              Refresh
            </Button>
            <Button variant="danger" leftIcon={Trash2}>
              Delete
            </Button>
            <Button variant="danger-ghost">Discard</Button>
            <Button variant="link">View details</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="xs">Extra small</Button>
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button variant="primary" loading>
              Saving
            </Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <IconButton icon={Settings2} label="Settings" />
            <IconButton icon={Plus} label="Add" variant="secondary" />
            <IconButton icon={RefreshCw} label="Refresh" variant="outline" />
            <IconButton icon={Play} label="Run" variant="primary" />
            <IconButton icon={RefreshCw} label="Loading" loading />
            <IconButton icon={Settings2} label="Extra small" size="xs" />
            <IconButton icon={Settings2} label="Medium" size="md" />
          </div>
        </CardBody>
      </Card>
    </Section>
  );
}

const TONES: Tone[] = ["neutral", "muted", "up", "down", "warning", "info", "accent", "ai"];

const ENUMS: { kind: EnumKind; values: string[] }[] = [
  { kind: "regime", values: Object.keys(REGIME_META) },
  { kind: "signal", values: Object.keys(SIGNAL_META) },
  { kind: "side", values: Object.keys(SIDE_META) },
  { kind: "trend", values: Object.keys(TREND_META) },
  { kind: "emaAlignment", values: Object.keys(EMA_ALIGNMENT_META) },
  { kind: "strategy", values: Object.keys(STRATEGY_META) },
  { kind: "exitReason", values: Object.keys(EXIT_REASON_META) },
  { kind: "result", values: Object.keys(TRADE_RESULT_META) },
  { kind: "riskStatus", values: Object.keys(RISK_STATUS_META) },
  { kind: "evalStatus", values: Object.keys(EVAL_STATUS_META) },
  { kind: "riskMeter", values: Object.keys(RISK_METER_STATUS_META) },
  { kind: "severity", values: Object.keys(SEVERITY_META) },
  { kind: "health", values: Object.keys(HEALTH_STATE_META) },
  { kind: "backtest", values: Object.keys(BACKTEST_STATUS_META) },
  { kind: "provider", values: Object.keys(AI_PROVIDER_META) },
  { kind: "feed", values: Object.keys(FEED_META) },
  { kind: "eventType", values: Object.keys(EVENT_TYPE_META) },
  { kind: "notificationType", values: Object.keys(NOTIFICATION_TYPE_META) },
];

export function BadgesSection() {
  return (
    <Section id="badges" title="Badges & enum labels" description="Every API enum renders through <EnumBadge kind=… value=… /> from lib/constants.">
      <Card>
        <CardBody className="space-y-3 pt-4">
          {(["soft", "solid", "outline", "plain"] as const).map((variant) => (
            <div key={variant} className="flex flex-wrap items-center gap-1.5">
              <span className="w-14 text-xs text-fg-subtle">{variant}</span>
              {TONES.map((tone) => (
                <Badge key={tone} tone={tone} variant={variant} dot={variant === "plain"}>
                  {tone}
                </Badge>
              ))}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-14 text-xs text-fg-subtle">sizes</span>
            <Badge size="xs" tone="up">
              xs
            </Badge>
            <Badge size="sm" tone="up">
              sm
            </Badge>
            <Badge size="md" tone="up">
              md
            </Badge>
            <Pill tone="accent" caps>
              pill caps
            </Pill>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardBody className="divide-y divide-line-subtle pt-2">
          {ENUMS.map(({ kind, values }) => (
            <div key={kind} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center">
              <span className="w-36 shrink-0 font-mono text-[11px] text-fg-subtle">{kind}</span>
              <div className="flex flex-wrap gap-1.5">
                {values.map((value) => (
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  <EnumBadge key={value} kind={kind} value={value as any} describe />
                ))}
              </div>
            </div>
          ))}
        </CardBody>
      </Card>
    </Section>
  );
}
