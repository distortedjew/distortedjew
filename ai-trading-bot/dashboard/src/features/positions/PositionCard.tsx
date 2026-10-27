import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  formatDuration,
  formatPct,
  formatPnl,
  formatPrice,
  formatR,
  formatSize,
  splitSymbol,
  toneOf,
} from "@/lib/format";
import { TONE_TEXT } from "@/lib/tones";
import { useNow } from "@/lib/time";
import { ConfidenceMeter } from "@/components/ui/ConfidenceMeter";
import { EnumBadge } from "@/components/ui/EnumBadge";
import { SymbolLabel } from "@/components/ui/SymbolLabel";
import type { Position } from "@/types";
import { openSeconds } from "./position-math";
import { SltpProgress } from "./SltpProgress";

/** Minimum gap between flashes: values tick about once a second and must not strobe. */
const FLASH_MIN_GAP_MS = 3_000;

/**
 * A live number that flashes green (up) or red (down) when it moves, at most once every few
 * seconds. Imperative class toggling keeps it from re-rendering. The text is the whole message:
 * the flash only underlines it.
 */
export function FlashNumber({
  value,
  format,
  className,
}: {
  value: number;
  format: (value: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef(value);
  const lastFlash = useRef(0);
  useEffect(() => {
    const before = previous.current;
    previous.current = value;
    if (before === value) return;
    const now = performance.now();
    const el = ref.current;
    if (!el || now - lastFlash.current < FLASH_MIN_GAP_MS) return;
    lastFlash.current = now;
    el.classList.remove("animate-flash-up", "animate-flash-down");
    void el.offsetWidth; // restart the CSS animation
    el.classList.add(value > before ? "animate-flash-up" : "animate-flash-down");
  }, [value]);
  return (
    <span ref={ref} className={cn("-mx-0.5 inline-block rounded-[3px] px-0.5", className)}>
      {format(value)}
    </span>
  );
}

/** Signed P&L (or P&L %); the tone follows the sign and a +/− is always printed. */
export function PnlFlash({
  value,
  pct,
  plain,
  className,
}: {
  value: number;
  pct?: boolean;
  /** Proportional figures instead of tabular mono (KPI-size values). */
  plain?: boolean;
  className?: string;
}) {
  return (
    <FlashNumber
      value={value}
      format={(v) => (pct ? formatPct(v, { signed: true }) : formatPnl(v))}
      className={cn(!plain && "num", TONE_TEXT[toneOf(value)], className)}
    />
  );
}

/** Live price, same flash behaviour. */
export function PriceFlash({ value, className }: { value: number; className?: string }) {
  return <FlashNumber value={value} format={(v) => formatPrice(v)} className={cn("num", className)} />;
}

/** Open time that ticks with the shared 1 s clock. */
export function LiveDuration({ position }: { position: Pick<Position, "opened_at" | "duration_sec"> }) {
  const now = useNow();
  return <>{formatDuration(openSeconds(position.opened_at, now, position.duration_sec))}</>;
}

/**
 * Stacked card for one position (phones, tablets portrait, Overview widget): symbol, side and P&L
 * first, then the stop → target bar, then the secondary numbers.
 */
export function PositionCard({
  position: p,
  onOpen,
  selected,
  compact,
}: {
  position: Position;
  onOpen: (id: string) => void;
  selected?: boolean;
  /** Overview widget: hide the secondary number grid. */
  compact?: boolean;
}) {
  const { base } = splitSymbol(p.symbol);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(p.id);
    }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${p.symbol} ${p.side.toLowerCase()} position, unrealized ${formatPnl(p.unrealized_pnl)}. Open details`}
      onClick={() => onOpen(p.id)}
      onKeyDown={onKeyDown}
      className={cn(
        "block cursor-pointer px-4 py-3 transition-colors outline-none hover:bg-fg/[0.025] focus-visible:bg-fg/[0.04] active:bg-fg/[0.04]",
        selected && "bg-accent/[0.06] shadow-[inset_2px_0_0_var(--accent)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <SymbolLabel symbol={p.symbol} />
            <EnumBadge kind="side" value={p.side} size="xs" />
          </div>
          <div className="num text-xs text-fg-subtle">
            <PriceFlash value={p.current_price} className="text-fg-muted" /> · <LiveDuration position={p} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-dense font-medium">
            <PnlFlash value={p.unrealized_pnl} />
          </div>
          <div className="num text-xs">
            <PnlFlash value={p.unrealized_pnl_pct} pct />
            <span className="text-fg-subtle"> · {formatR(p.r_multiple, 1)}</span>
          </div>
        </div>
      </div>
      <SltpProgress position={p} className="mt-3" labels />
      {compact ? null : (
        <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
          <Cell label="Entry" value={formatPrice(p.entry_price)} />
          <Cell label="Size" value={formatSize(p.size, base)} />
          <Cell label="AI conf." value={<ConfidenceMeter value={p.ai_confidence} variant="text" />} />
        </dl>
      )}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-fg-subtle">{label}</dt>
      <dd className="truncate num text-fg">{value}</dd>
    </div>
  );
}
