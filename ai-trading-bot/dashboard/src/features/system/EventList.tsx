import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUp, ChevronsDown, Pause, Play, Radio } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useEvents } from "@/hooks/queries";
import { useLiveEvents } from "@/hooks/live";
import { cn } from "@/lib/cn";
import { formatInt } from "@/lib/format";
import { motionPresets } from "@/lib/motion";
import { useNow } from "@/lib/time";
import type { Event, EventType, Severity } from "@/types";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { EventRow } from "@/features/system/EventRow";
import { dayKey, mergeEventLists, withDaySeparators, type StreamItem } from "@/features/system/event-data";

const PAGE_SIZE = 50;
/** Scrolled further than this from the top → autoscroll pauses (the list stops shifting). */
const PAUSE_SCROLL_PX = 24;

export interface EventListProps {
  types?: EventType[];
  severity?: Severity;
  symbol?: string;
  /** Compact card: one-line messages, no paging, newest `maxItems` only. */
  compact?: boolean;
  /** Size of the first REST page (default 50). */
  headLimit?: number;
  /** Cap on rendered head events (compact card ≈ 30). */
  maxItems?: number;
  /** "Load older" paging through `before_id`. */
  paging?: boolean;
  maxHeight: number | string;
  /** Toolbar row above the list (filters). Giving one also adds the Pause / Resume control. */
  toolbar?: ReactNode;
  className?: string;
}

interface PauseState {
  /** Newest event id on screen when the feed paused; newer events wait behind the pill. */
  frozenTopId: number | null;
  /** Paused by the button (stays paused at the top) rather than by scrolling. */
  manual: boolean;
}

interface Cursor {
  beforeId: number;
  previousDay: string;
}

/**
 * The live event feed: the latest REST page merged with events streamed over the WebSocket
 * (newest first), older pages through `before_id`, pause-on-scroll with an "N new events" pill.
 * Remount it (React `key`) when the filters change.
 */
export function EventList({
  types,
  severity,
  symbol,
  compact,
  headLimit = PAGE_SIZE,
  maxItems,
  paging,
  maxHeight,
  toolbar,
  className,
}: EventListProps) {
  const typesKey = types?.join(",") ?? "";
  // Stable array identity for the hooks' memo dependencies.
  const stableTypes = useMemo(
    () => (typesKey ? (typesKey.split(",") as EventType[]) : undefined),
    [typesKey],
  );
  const head = useEvents({ limit: headLimit, types: stableTypes, severity, symbol }, { staleTime: Infinity });
  const live = useLiveEvents({ types: stableTypes, severity, symbol });
  const now = useNow();
  const reduceMotion = useReducedMotion();
  const scroller = useRef<HTMLDivElement>(null);
  const [pause, setPause] = useState<PauseState>({ frozenTopId: null, manual: false });
  const [cursors, setCursors] = useState<Cursor[]>([]);

  const all = useMemo(() => {
    const merged = mergeEventLists(head.data?.items, live);
    return maxItems ? merged.slice(0, maxItems) : merged;
  }, [head.data?.items, live, maxItems]);

  const paused = pause.frozenTopId !== null;
  const visible = paused ? all.filter((e) => e.id <= (pause.frozenTopId ?? 0)) : all;
  const newCount = paused ? all.length - visible.length : 0;
  const items = withDaySeparators(visible, { now, omitToday: compact });

  const freeze = (manual: boolean) =>
    setPause((p) =>
      p.frozenTopId !== null
        ? { ...p, manual: p.manual || manual }
        : { frozenTopId: all[0]?.id ?? 0, manual },
    );
  const resume = () => {
    setPause({ frozenTopId: null, manual: false });
    scroller.current?.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };
  const toggle = () => (paused ? resume() : freeze(true));

  const onScroll = () => {
    const top = scroller.current?.scrollTop ?? 0;
    if (top > PAUSE_SCROLL_PX && !paused) freeze(false);
    else if (top <= 2 && paused && !pause.manual) setPause({ frozenTopId: null, manual: false });
  };

  const oldest = visible[visible.length - 1];
  const headHasMore = Boolean(head.data?.has_more) || (head.data?.items.length ?? 0) >= headLimit;
  const loadOlder = (last: Event | undefined) => {
    if (!last) return;
    if (!paused) freeze(false);
    setCursors((c) => [...c, { beforeId: last.id, previousDay: dayKey(last.ts) }]);
  };

  let body: ReactNode;
  if (head.isPending && live.length === 0) {
    body = <EventSkeleton rows={compact ? 7 : 10} />;
  } else if (head.error && all.length === 0) {
    body = <ErrorState error={head.error} onRetry={() => void head.refetch()} className="py-8" />;
  } else if (all.length === 0) {
    body = (
      <EmptyState
        size="sm"
        icon={Radio}
        className="py-10"
        title={stableTypes || severity || symbol ? "No events match these filters" : "No events yet"}
        description={
          stableTypes || severity || symbol
            ? "New matching events appear here the moment the engine emits them."
            : "The engine logs market updates, AI decisions, risk checks, trades and warnings here as they happen."
        }
      />
    );
  } else {
    body = (
      <>
        {head.error ? (
          <ErrorState compact error={head.error} onRetry={() => void head.refetch()} className="mx-2 mb-2" />
        ) : null}
        <StreamItems items={items} compact={compact} now={now} animate />
        {paging
          ? cursors.map((cursor, i) => (
              <OlderPage
                key={cursor.beforeId}
                cursor={cursor}
                types={stableTypes}
                severity={severity}
                symbol={symbol}
                isLast={i === cursors.length - 1}
                onLoadMore={loadOlder}
                now={now}
              />
            ))
          : null}
        {paging && cursors.length === 0 && headHasMore ? (
          <LoadOlderButton onClick={() => loadOlder(oldest)} />
        ) : null}
      </>
    );
  }

  return (
    <div className={cn("min-h-0", className)}>
      {toolbar !== undefined ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 pb-3">
          {toolbar}
          <div className="ml-auto flex items-center gap-2">
            <span
              className="hidden items-center gap-1.5 text-xs text-fg-subtle sm:inline-flex"
              aria-live="polite"
            >
              {paused ? (
                <>
                  <Pause className="size-3" aria-hidden />
                  Paused{newCount ? ` · ${formatInt(newCount)} new` : ""}
                </>
              ) : (
                <>
                  <Radio className="size-3 text-up" aria-hidden />
                  Streaming
                </>
              )}
            </span>
            <Button
              size="xs"
              variant="secondary"
              leftIcon={paused ? Play : Pause}
              onClick={toggle}
              aria-pressed={paused}
            >
              {paused ? "Resume" : "Pause"}
            </Button>
          </div>
        </div>
      ) : null}
      <div className="relative">
        <AnimatePresence>
          {newCount > 0 ? (
            <motion.div
              {...motionPresets.fadeRise}
              className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center"
            >
              <button
                type="button"
                onClick={resume}
                className="pointer-events-auto inline-flex h-7 items-center gap-1.5 rounded-full bg-accent-solid px-3 text-xs font-medium text-accent-fg shadow-[0_4px_14px_rgb(0_0_0/0.3)] hover:bg-accent-solid-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/70"
              >
                <ArrowUp className="size-3.5" aria-hidden />
                {formatInt(newCount)} new {newCount === 1 ? "event" : "events"}
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <div
          ref={scroller}
          onScroll={onScroll}
          className="overflow-y-auto overscroll-contain px-2 pb-2"
          style={{ maxHeight }}
          role="log"
          aria-live={paused ? "off" : "polite"}
          aria-relevant="additions"
          aria-label="Event stream"
        >
          {body}
        </div>
      </div>
    </div>
  );
}

function StreamItems({
  items,
  compact,
  now,
  animate,
}: {
  items: StreamItem[];
  compact?: boolean;
  now: number;
  animate?: boolean;
}) {
  const today = dayKey(new Date(now).toISOString());
  const content = items.map((item) =>
    item.kind === "day" ? (
      <motion.div
        key={item.key}
        layout={animate ? "position" : false}
        className="sticky top-0 z-[1] -mx-2 flex items-center gap-2 bg-surface/95 px-4 pt-2.5 pb-1 backdrop-blur-sm"
      >
        <span className="label-caps">{item.label}</span>
        <span className="h-px flex-1 bg-line-subtle" aria-hidden />
      </motion.div>
    ) : (
      <motion.div
        key={item.key}
        layout={animate ? "position" : false}
        {...(animate ? motionPresets.listItem : {})}
      >
        <EventRow
          event={item.event}
          compact={compact}
          showDate={compact && dayKey(item.event.ts) !== today}
        />
      </motion.div>
    ),
  );
  return animate ? <AnimatePresence initial={false}>{content}</AnimatePresence> : <>{content}</>;
}

function OlderPage({
  cursor,
  types,
  severity,
  symbol,
  isLast,
  onLoadMore,
  now,
}: {
  cursor: Cursor;
  types?: EventType[];
  severity?: Severity;
  symbol?: string;
  isLast: boolean;
  onLoadMore: (last: Event | undefined) => void;
  now: number;
}) {
  const page = useEvents(
    { limit: PAGE_SIZE, before_id: cursor.beforeId, types, severity, symbol },
    { staleTime: Infinity },
  );
  if (page.isPending) return <EventSkeleton rows={4} />;
  if (page.error) {
    return (
      <ErrorState compact error={page.error} onRetry={() => void page.refetch()} className="mx-2 my-2" />
    );
  }
  const items = page.data?.items ?? [];
  const last = items[items.length - 1];
  return (
    <>
      <StreamItems items={withDaySeparators(items, { previousDay: cursor.previousDay, now })} now={now} />
      {isLast ? (
        page.data?.has_more ? (
          <LoadOlderButton onClick={() => onLoadMore(last)} />
        ) : (
          <p className="py-4 text-center text-xs text-fg-subtle">Beginning of the event log</p>
        )
      ) : null}
    </>
  );
}

function LoadOlderButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex justify-center py-3">
      <Button size="xs" variant="secondary" leftIcon={ChevronsDown} onClick={onClick}>
        Load older events
      </Button>
    </div>
  );
}

function EventSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3 px-2.5 py-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-start gap-2.5">
          <Skeleton className="mt-1 h-3 w-12" />
          <Skeleton className="size-5 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className={cn("h-3", i % 3 === 0 ? "w-3/5" : i % 3 === 1 ? "w-4/5" : "w-2/3")} />
            <Skeleton className="h-2.5 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
