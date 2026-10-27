import { ShieldAlert } from "lucide-react";
import { useEventFeed } from "@/hooks/live";
import { cn } from "@/lib/cn";
import { EVENT_TYPE_META } from "@/lib/constants";
import { TONE_CHIP } from "@/lib/tones";
import type { EventType } from "@/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Timestamp } from "@/components/ui/Timestamp";
import { LiveTag } from "@/components/layout/LiveTag";
import { AnimatePresence, motion } from "framer-motion";
import { motionPresets } from "@/lib/motion";

const TYPES: EventType[] = ["RISK_WARNING", "TRADE_REJECTED"];

/** Recent RISK_WARNING and TRADE_REJECTED events (live: new ones slide in). */
export function RiskEventsCard({ rejectionsToday }: { rejectionsToday?: number }) {
  const { events, isPending, error, refetch } = useEventFeed({ types: TYPES, limit: 6 });
  return (
    <Card>
      <CardHeader
        title="Risk warnings and rejections"
        icon={ShieldAlert}
        badge={<LiveTag />}
        subtitle={
          typeof rejectionsToday === "number"
            ? `${rejectionsToday} trade ${rejectionsToday === 1 ? "rejection" : "rejections"} today`
            : "Latest events from the risk manager"
        }
      />
      <div className="px-4 pb-4">
        {isPending ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading events">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : error && events.length === 0 ? (
          <ErrorState compact error={error} onRetry={() => void refetch()} />
        ) : events.length === 0 ? (
          <EmptyState
            size="sm"
            title="No risk warnings or rejected trades yet"
            description="Warnings and rejections are listed here the moment the risk manager raises them."
          />
        ) : (
          <ul className="divide-y divide-line-subtle">
            <AnimatePresence initial={false}>
              {events.map((e) => {
                const meta = EVENT_TYPE_META[e.type];
                return (
                  <motion.li
                    key={e.id}
                    layout="position"
                    {...motionPresets.listItem}
                    className="flex items-start gap-3 py-2.5"
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
                        TONE_CHIP[meta.tone],
                      )}
                    >
                      <meta.icon className="size-3.5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-dense font-medium text-fg">
                          {e.title}
                          {e.symbol ? (
                            <span className="ml-2 text-xs font-normal text-fg-subtle">{e.symbol}</span>
                          ) : null}
                        </p>
                        <Timestamp value={e.ts} mode="relative" className="shrink-0 text-xs text-fg-subtle" />
                      </div>
                      <p className="line-clamp-2 text-xs text-fg-muted">{e.message}</p>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </Card>
  );
}
