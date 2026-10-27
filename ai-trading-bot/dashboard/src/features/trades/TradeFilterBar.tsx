import { Download, Filter, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSymbols } from "@/hooks/queries";
import { useBreakpoint } from "@/hooks/use-media-query";
import { EXIT_REASON_META, STRATEGY_META } from "@/lib/constants";
import { formatPct } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { FilterBar, FilterBarSpacer } from "@/components/ui/FilterBar";
import { Input } from "@/components/ui/Input";
import { NumberInput } from "@/components/ui/NumberInput";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import type { ExitReason, StrategyName } from "@/types";
import { activeFilterCount, EXIT_REASONS, STRATEGIES, type TradeView } from "./trade-filters";

type Patch = Partial<{ [K in keyof TradeView]: TradeView[K] | undefined }>;

const ALL = "all";

interface Props {
  view: TradeView;
  onChange: (patch: Patch) => void;
  onClear: () => void;
  onExport: () => void;
  exporting: boolean;
  /** Disable export when there is nothing to export. */
  canExport: boolean;
}

/** Search box that commits to the URL shortly after typing stops (and on Enter). */
function SearchBox({ value, onCommit }: { value: string; onCommit: (q: string | undefined) => void }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    // The URL changed from elsewhere (clear filters, back button): follow it.
    setSeen(value);
    setText(value);
  }
  useEffect(() => {
    if (text.trim() === value) return;
    const timer = setTimeout(() => onCommit(text.trim() || undefined), 350);
    return () => clearTimeout(timer);
  }, [text, value, onCommit]);

  return (
    <Input
      size="sm"
      type="search"
      aria-label="Search trades"
      placeholder="Search symbol, id or reason"
      leftIcon={Search}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit(text.trim() || undefined);
        if (e.key === "Escape") setText("");
      }}
      className="w-full sm:w-64"
    />
  );
}

function ConfidenceFilter({ view, onChange }: Pick<Props, "view" | "onChange">) {
  const min = view.minConf ?? 0;
  const max = view.maxConf ?? 100;
  const active = min > 0 || max < 100;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" className={cn("justify-between", active && "border-accent/50")}>
          <span className="text-fg-subtle">AI confidence</span>
          <span className="num">
            {active ? `${formatPct(min, { decimals: 0 })}–${formatPct(max, { decimals: 0 })}` : "Any"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <p className="mb-2 text-xs text-fg-subtle">
          Only trades whose entry signal had a confidence within this range.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs text-fg-subtle">
            Min
            <NumberInput
              size="sm"
              aria-label="Minimum AI confidence"
              value={min}
              min={0}
              max={100}
              step={5}
              unit="%"
              stepper={false}
              onValueChange={(v) =>
                onChange({ minConf: v === null || v <= 0 ? undefined : Math.min(v, max) })
              }
            />
          </label>
          <label className="space-y-1 text-xs text-fg-subtle">
            Max
            <NumberInput
              size="sm"
              aria-label="Maximum AI confidence"
              value={max}
              min={0}
              max={100}
              step={5}
              unit="%"
              stepper={false}
              onValueChange={(v) =>
                onChange({ maxConf: v === null || v >= 100 ? undefined : Math.max(v, min) })
              }
            />
          </label>
        </div>
        {active ? (
          <Button
            variant="ghost"
            size="xs"
            className="mt-2"
            onClick={() => onChange({ minConf: undefined, maxConf: undefined })}
          >
            Reset range
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** Every trade filter in one row (desktop) or behind a Filters toggle (phones). */
export function TradeFilterBar({ view, onChange, onClear, onExport, exporting, canExport }: Props) {
  const { symbols } = useSymbols();
  const wide = useBreakpoint("md");
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(view);

  const filters = (
    <>
      <Select
        size="sm"
        aria-label="Symbol"
        className="w-full sm:w-36"
        value={view.symbol ?? ALL}
        onValueChange={(v) => onChange({ symbol: v === ALL ? undefined : v })}
        options={[
          { value: ALL, label: "All symbols" },
          ...(view.symbol && !symbols.includes(view.symbol)
            ? [{ value: view.symbol, label: view.symbol }]
            : []),
          ...symbols.map((s) => ({ value: s, label: s })),
        ]}
      />
      <SegmentedControl
        aria-label="Side"
        value={view.side ?? ALL}
        onValueChange={(v) => onChange({ side: v === ALL ? undefined : (v as TradeView["side"]) })}
        options={[
          { value: ALL, label: "All" },
          { value: "LONG", label: "Long" },
          { value: "SHORT", label: "Short" },
        ]}
        fullWidth={!wide}
      />
      <SegmentedControl
        aria-label="Result"
        value={view.result ?? ALL}
        onValueChange={(v) => onChange({ result: v === ALL ? undefined : (v as TradeView["result"]) })}
        options={[
          { value: ALL, label: "All" },
          { value: "WIN", label: "Wins" },
          { value: "LOSS", label: "Losses" },
          { value: "BREAKEVEN", label: "B/E", title: "Breakeven" },
        ]}
        fullWidth={!wide}
      />
      <Select
        size="sm"
        aria-label="Strategy"
        className="w-full sm:w-36"
        value={view.strategy ?? ALL}
        onValueChange={(v) => onChange({ strategy: v === ALL ? undefined : (v as StrategyName) })}
        options={[
          { value: ALL, label: "All strategies" },
          ...STRATEGIES.map((s) => ({ value: s, label: STRATEGY_META[s].label })),
        ]}
      />
      <Select
        size="sm"
        aria-label="Exit reason"
        className="w-full sm:w-40"
        value={view.exit ?? ALL}
        onValueChange={(v) => onChange({ exit: v === ALL ? undefined : (v as ExitReason) })}
        options={[
          { value: ALL, label: "Any exit" },
          ...EXIT_REASONS.map((r) => ({ value: r, label: EXIT_REASON_META[r].label })),
        ]}
      />
      <div className="flex items-center gap-1.5">
        <Input
          size="sm"
          type="date"
          aria-label="From date (UTC)"
          value={view.from ?? ""}
          max={view.to}
          onChange={(e) => onChange({ from: e.target.value || undefined })}
          className="w-full sm:w-36"
        />
        <span className="text-xs text-fg-subtle" aria-hidden>
          →
        </span>
        <Input
          size="sm"
          type="date"
          aria-label="To date (UTC)"
          value={view.to ?? ""}
          min={view.from}
          onChange={(e) => onChange({ to: e.target.value || undefined })}
          className="w-full sm:w-36"
        />
      </div>
      <ConfidenceFilter view={view} onChange={onChange} />
    </>
  );

  const exportButton = (
    <Button
      variant="secondary"
      size="sm"
      leftIcon={Download}
      loading={exporting}
      disabled={!canExport}
      onClick={onExport}
    >
      Export CSV
    </Button>
  );

  return (
    <div className="mb-4 space-y-2">
      <FilterBar className="mb-0">
        <SearchBox value={view.q ?? ""} onCommit={(q) => onChange({ q })} />
        {wide ? (
          filters
        ) : (
          <Button
            variant="secondary"
            size="sm"
            leftIcon={Filter}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            Filters{count > 0 ? ` · ${count}` : ""}
          </Button>
        )}
        {count > 0 ? (
          <Button variant="ghost" size="sm" leftIcon={X} onClick={onClear}>
            Clear{wide && count > 0 ? ` (${count})` : ""}
          </Button>
        ) : null}
        <FilterBarSpacer />
        {exportButton}
      </FilterBar>
      {!wide && open ? (
        <div className="grid grid-cols-1 gap-2 rounded-xl surface-card p-3">{filters}</div>
      ) : null}
    </div>
  );
}
