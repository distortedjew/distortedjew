import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import { EVENT_TYPE_META, SEVERITY_META } from "@/lib/constants";
import { formatDateTime, formatTime, formatUtc } from "@/lib/format";
import { TONE_CHIP, TONE_TEXT } from "@/lib/tones";
import type { Event } from "@/types";
import { eventDataRows } from "@/features/system/event-data";

const SEVERITY_RULE: Record<Event["severity"], string> = {
  info: "before:bg-transparent",
  success: "before:bg-up/70",
  warning: "before:bg-warning/80",
  error: "before:bg-down",
};

export interface EventRowProps {
  event: Event;
  /** Compact card layout: one-line message, smaller paddings. */
  compact?: boolean;
  /** Show the date with the time (events older than today in the compact card). */
  showDate?: boolean;
}

/**
 * One line of the activity feed: time · type icon · label · title, message underneath, and the
 * event's `data` as readable key/values when expanded. MARKET_UPDATE renders as a quiet one-liner
 * so candle closes never drown signals, trades and warnings.
 */
export function EventRow({ event, compact, showDate }: EventRowProps) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const meta = EVENT_TYPE_META[event.type];
  const Icon = meta.icon;
  const rows = eventDataRows(event.data);
  const expandable = rows.length > 0;
  const market = event.type === "MARKET_UPDATE";
  const showSymbol = Boolean(event.symbol) && !event.title.includes(event.symbol ?? "");
  const time = showDate ? formatDateTime(event.ts) : formatTime(event.ts);
  const severity = SEVERITY_META[event.severity];

  return (
    <div
      className={cn(
        "relative before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full",
        SEVERITY_RULE[event.severity],
      )}
    >
      <button
        type="button"
        onClick={expandable ? () => setOpen((o) => !o) : undefined}
        aria-expanded={expandable ? open : undefined}
        aria-controls={expandable ? detailsId : undefined}
        disabled={!expandable}
        title={`${formatUtc(event.ts)} · ${meta.label} · ${severity.label}`}
        className={cn(
          "group/ev flex w-full min-w-0 items-start gap-2.5 rounded-md text-left transition-colors disabled:cursor-default",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent/70",
          expandable && "hover:bg-fg/[0.035]",
          market ? "py-1 pr-2 pl-2.5" : compact ? "py-1.5 pr-2 pl-2.5" : "py-2 pr-2 pl-2.5",
        )}
      >
        <time
          dateTime={event.ts}
          className={cn(
            "shrink-0 num text-xs leading-5 text-fg-subtle tabular-nums",
            showDate ? "w-[104px] whitespace-nowrap" : "w-[58px]",
          )}
        >
          {time}
        </time>
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex shrink-0 items-center justify-center rounded-md",
            market ? "size-4 text-fg-disabled" : cn("size-5", TONE_CHIP[meta.tone]),
          )}
        >
          <Icon className={market ? "size-3" : "size-3.5"} strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-x-2">
            <span
              className={cn(
                "shrink-0 text-[10.5px] leading-5 font-semibold tracking-[0.06em] uppercase",
                market ? "text-fg-disabled" : TONE_TEXT[meta.tone],
              )}
            >
              {compact ? (meta.short ?? meta.label) : meta.label}
            </span>
            {showSymbol ? (
              <span className={cn("shrink-0 num text-xs", market ? "text-fg-subtle" : "text-fg-muted")}>
                {event.symbol}
              </span>
            ) : null}
            <span
              className={cn(
                "min-w-0 truncate leading-5",
                market ? "text-xs text-fg-subtle" : "text-dense font-medium text-fg",
              )}
            >
              {event.title}
              {market && event.message ? <span className="text-fg-disabled"> · {event.message}</span> : null}
            </span>
          </span>
          {!market && event.message ? (
            <span
              className={cn(
                "block text-xs leading-[1.125rem] text-fg-subtle",
                compact ? "line-clamp-1" : "line-clamp-2",
              )}
            >
              {event.message}
            </span>
          ) : null}
        </span>
        {expandable ? (
          <ChevronRight
            aria-hidden
            className={cn(
              "mt-1 size-3.5 shrink-0 text-fg-disabled transition-transform duration-150 group-hover/ev:text-fg-subtle",
              open && "rotate-90",
            )}
          />
        ) : (
          <span className="w-3.5 shrink-0" aria-hidden />
        )}
      </button>
      {expandable && open ? (
        <div id={detailsId} className={cn("pr-2 pb-2", showDate ? "pl-[140px]" : "pl-[94px]", "max-sm:pl-3")}>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 rounded-lg border border-line-subtle bg-surface-2/60 px-3 py-2 text-xs sm:grid-cols-2">
            {rows.map((row) => (
              <div key={row.key} className="flex min-w-0 items-baseline justify-between gap-3">
                <dt className="shrink-0 text-fg-subtle">{row.label}</dt>
                <dd
                  className={cn(
                    "min-w-0 text-right text-fg",
                    (row.mono || typeof row.value === "string") && "num",
                    row.tone && TONE_TEXT[row.tone],
                  )}
                >
                  {Array.isArray(row.value) ? (
                    <ul className="space-y-0.5 font-sans">
                      {row.value.map((item, i) => (
                        <li key={i} className="break-words">
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="break-all">{row.value}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}
