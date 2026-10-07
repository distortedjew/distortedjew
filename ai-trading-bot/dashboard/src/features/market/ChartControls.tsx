import { BarChart3, BrainCircuit, SlidersHorizontal } from "lucide-react";
import { useChartTheme } from "@/components/charts/chart-theme";
import { Button } from "@/components/ui/Button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Switch } from "@/components/ui/Switch";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";
import { CHART_MARKER_META, TIMEFRAME_LABEL, TIMEFRAMES } from "@/lib/constants";
import { markerColor } from "@/components/charts/chart-theme";
import type { ChartMarkerKind, Timeframe } from "@/types";
import { OVERLAY_DEFS, overlayGroupColor, timeframeShort, type OverlayKey } from "./chart-model";
import type { ChartPrefs } from "./use-chart-prefs";

export function TimeframeSelector({
  value,
  onChange,
  size = "sm",
  className,
}: {
  value: Timeframe;
  onChange: (tf: Timeframe) => void;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  return (
    <SegmentedControl
      aria-label="Chart timeframe"
      size={size}
      value={value}
      onValueChange={onChange}
      className={className}
      options={TIMEFRAMES.map((tf) => ({ value: tf, label: timeframeShort(tf), title: TIMEFRAME_LABEL[tf] }))}
    />
  );
}

function OverlayChip({
  def,
  active,
  onToggle,
}: {
  def: (typeof OVERLAY_DEFS)[number];
  active: boolean;
  onToggle: () => void;
}) {
  const theme = useChartTheme();
  return (
    <Tooltip content={def.description}>
      <button
        type="button"
        aria-pressed={active}
        onClick={onToggle}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium whitespace-nowrap ring-1 transition-colors duration-150 ring-inset",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent/70",
          active
            ? "bg-surface-2 text-fg ring-line-strong"
            : "text-fg-subtle ring-line hover:bg-fg/[0.04] hover:text-fg-muted",
        )}
      >
        <span
          aria-hidden
          className={cn("h-[3px] w-3 rounded-full transition-opacity", !active && "opacity-35")}
          style={{ backgroundColor: overlayGroupColor(theme, def.key) }}
        />
        {def.label}
      </button>
    </Tooltip>
  );
}

/** Indicator toggles: inline chips on wide screens, a popover elsewhere. */
export function IndicatorToggles({
  prefs,
  onToggle,
  onPref,
  inline,
}: {
  prefs: ChartPrefs;
  onToggle: (key: OverlayKey) => void;
  onPref: (key: "volume" | "aiLevels", value: boolean) => void;
  /** Render chips inline (wide toolbars) instead of a popover. */
  inline?: boolean;
}) {
  const chips = OVERLAY_DEFS.map((def) => (
    <OverlayChip
      key={def.key}
      def={def}
      active={prefs.overlays.includes(def.key)}
      onToggle={() => onToggle(def.key)}
    />
  ));
  const switches = (
    <>
      <label className="flex items-center justify-between gap-3 text-xs text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <BarChart3 aria-hidden className="size-3.5" /> Volume
        </span>
        <Switch size="sm" checked={prefs.volume} onCheckedChange={(v) => onPref("volume", v)} />
      </label>
      <label className="flex items-center justify-between gap-3 text-xs text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <BrainCircuit aria-hidden className="size-3.5" /> AI levels
        </span>
        <Switch size="sm" checked={prefs.aiLevels} onCheckedChange={(v) => onPref("aiLevels", v)} />
      </label>
    </>
  );
  if (inline) {
    return (
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Indicators">
        {chips}
        <span aria-hidden className="mx-1 h-4 w-px bg-line" />
        <div className="flex items-center gap-3">{switches}</div>
      </div>
    );
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="xs" variant="outline" leftIcon={SlidersHorizontal}>
          Indicators
          <span className="num text-fg-subtle">{prefs.overlays.length}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <div className="label-caps text-fg-subtle">Overlays</div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Indicators">
          {chips}
        </div>
        <div className="space-y-2 border-t border-line pt-3">{switches}</div>
      </PopoverContent>
    </Popover>
  );
}

const LEGEND_KINDS: { kinds: ChartMarkerKind[]; glyph: string; label: string }[] = [
  { kinds: ["entry_long"], glyph: "▲", label: "Long entry" },
  { kinds: ["entry_short"], glyph: "▼", label: "Short entry" },
  { kinds: ["exit_win"], glyph: "●", label: "Exit win" },
  { kinds: ["exit_loss"], glyph: "●", label: "Exit loss" },
  { kinds: ["take_profit"], glyph: "■", label: "Take profit" },
  { kinds: ["stop_loss"], glyph: "■", label: "Stop loss" },
  { kinds: ["signal_long", "signal_short"], glyph: "▲▼", label: "AI signal" },
];

/** Key for the chart's trade markers and price lines. */
export function MarkerLegend({ className }: { className?: string }) {
  const theme = useChartTheme();
  return (
    <ul
      className={cn("flex flex-wrap items-center gap-x-3.5 gap-y-1 text-2xs text-fg-subtle", className)}
      aria-label="Chart marker key"
    >
      {LEGEND_KINDS.map((item) => (
        <li
          key={item.label}
          className="inline-flex items-center gap-1"
          title={CHART_MARKER_META[item.kinds[0]].label}
        >
          <span aria-hidden style={{ color: markerColor(theme, item.kinds[0]) }}>
            {item.glyph}
          </span>
          {item.label}
        </li>
      ))}
      <li className="inline-flex items-center gap-1">
        <span
          aria-hidden
          className="h-0 w-3.5 border-t border-dashed"
          style={{ borderColor: theme.accent }}
        />
        Price levels
      </li>
    </ul>
  );
}
