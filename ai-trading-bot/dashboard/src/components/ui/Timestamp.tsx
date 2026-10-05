import { cn } from "@/lib/cn";
import { DASH, formatDate, formatDateTime, formatRelativeTime, formatTime, formatUtc } from "@/lib/format";
import { toMs, useNow } from "@/lib/time";
import { Tooltip } from "@/components/ui/Tooltip";

export interface TimestampProps {
  value: string | number | Date | null | undefined;
  /** time "14:32:05" · datetime "Oct 4, 14:32:05" · date "Oct 4" · relative "12s ago" (live). */
  mode?: "time" | "datetime" | "date" | "relative";
  seconds?: boolean;
  className?: string;
}

/** A timestamp in the viewer's local time, with the exact local + UTC time in a tooltip. */
export function Timestamp({ value, mode = "datetime", seconds = true, className }: TimestampProps) {
  const ms = toMs(value);
  if (ms === null) return <span className={cn("text-fg-subtle", className)}>{DASH}</span>;
  return (
    <Tooltip
      content={
        <span className="num block text-[11px] leading-4">
          {formatDateTime(ms, { seconds: true })}
          <span className="block text-fg-subtle">{formatUtc(ms)}</span>
        </span>
      }
    >
      <time dateTime={new Date(ms).toISOString()} tabIndex={0} className={cn("num whitespace-nowrap", className)}>
        {mode === "relative" ? (
          <RelativeTime ms={ms} />
        ) : mode === "time" ? (
          formatTime(ms, { seconds })
        ) : mode === "date" ? (
          formatDate(ms)
        ) : (
          formatDateTime(ms, { seconds })
        )}
      </time>
    </Tooltip>
  );
}

/** "12s ago", re-rendered every second by the shared clock. */
export function RelativeTime({ ms, style = "short" }: { ms: number; style?: "short" | "long" }) {
  const now = useNow();
  return <>{formatRelativeTime(ms, now, style)}</>;
}
