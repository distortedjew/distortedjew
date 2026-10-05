import { CirclePause, OctagonAlert, RotateCw, TriangleAlert, WifiOff } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useBotStatus, useConnection } from "@/hooks/live";
import { formatAgo } from "@/lib/format";
import { useNow } from "@/lib/time";

export interface BannerMessage {
  key: string;
  tone: "warning" | "down";
  icon: LucideIcon;
  title: string;
  detail?: string;
  retry?: boolean;
}

/** Pick the single most important connectivity / engine message (or null when all is well). */
export function useConnectionMessage(): BannerMessage | null {
  const connection = useConnection();
  const bot = useBotStatus();
  const now = useNow();
  const engine = bot.status?.engine;

  if (connection.unauthorized) {
    return {
      key: "unauthorized",
      tone: "down",
      icon: OctagonAlert,
      title: "Not authorized to stream live data.",
      detail: "Open the dashboard with ?token=<DASHBOARD_TOKEN> in the URL.",
    };
  }
  if (connection.status === "offline" || connection.status === "reconnecting") {
    const retryIn = connection.nextRetryAt ? Math.max(0, Math.ceil((connection.nextRetryAt - now) / 1_000)) : null;
    const offline = connection.status === "offline";
    return {
      key: `ws-${connection.status}`,
      tone: offline ? "down" : "warning",
      icon: offline ? WifiOff : RotateCw,
      title: offline ? "Live connection lost." : "Reconnecting to live data…",
      detail: `Showing the last known state; data refreshes every 5 s by polling${
        retryIn !== null ? ` · next retry in ${retryIn}s` : ""
      }.`,
      retry: true,
    };
  }
  if (bot.state === "offline") {
    return {
      key: "engine-offline",
      tone: "down",
      icon: OctagonAlert,
      title: `Trading engine offline — last heartbeat ${
        bot.heartbeatAgeSec === null ? "never received" : formatAgo(bot.heartbeatAgeSec, "long")
      }.`,
      detail: "Showing last known state. No new trades will be placed until the engine is back.",
    };
  }
  if (bot.state === "degraded") {
    return {
      key: "engine-degraded",
      tone: "warning",
      icon: TriangleAlert,
      title: `Trading engine is slow to respond — last heartbeat ${formatAgo(bot.heartbeatAgeSec, "long")}.`,
      detail: "It may be busy or stalled; data on screen can lag.",
    };
  }
  if (engine && !engine.feed_connected) {
    return {
      key: "feed",
      tone: "warning",
      icon: WifiOff,
      title: "Market data feed disconnected.",
      detail: engine.feed_message ?? "Prices and charts may be stale until the feed reconnects.",
    };
  }
  if (engine && !engine.trading_allowed) {
    return {
      key: "halted",
      tone: "warning",
      icon: CirclePause,
      title: "Trading is halted — no new entries.",
      detail: engine.halt_reason ?? undefined,
    };
  }
  return null;
}
