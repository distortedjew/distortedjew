import { useConnectionStatus } from "@/hooks/live";
import { cn } from "@/lib/cn";
import { StatusDot } from "@/components/ui/StatusDot";
import { Tooltip } from "@/components/ui/Tooltip";

/**
 * Small "LIVE ●" tag for the header of a widget fed by the WebSocket (CardHeader `badge`).
 * Reads "POLLING" while the stream is down, so a widget never claims to be live when it isn't.
 *
 *   <CardHeader title="Open positions" badge={<LiveTag />} />
 */
export function LiveTag({ className }: { className?: string }) {
  const status = useConnectionStatus();
  const live = status === "live";
  return (
    <Tooltip
      content={
        live
          ? "Updates in real time over the WebSocket."
          : "The live stream is down: this view refreshes every few seconds by polling."
      }
    >
      <span
        tabIndex={0}
        className={cn(
          "inline-flex h-[18px] items-center gap-1 rounded-full px-1.5 text-[10px] font-semibold tracking-[0.08em]",
          live ? "bg-up/10 text-up" : "bg-warning/10 text-warning",
          className,
        )}
      >
        <StatusDot tone={live ? "up" : "warning"} pulse={live} size="xs" />
        {live ? "LIVE" : "POLLING"}
      </span>
    </Tooltip>
  );
}
