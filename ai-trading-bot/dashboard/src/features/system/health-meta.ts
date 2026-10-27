/**
 * Display metadata for the six health components of GET /api/system (`ComponentHealth.key`).
 * Kept here (not lib/constants) because only the System page uses it — candidate for promotion.
 */
import { Bot, BrainCircuit, ChartCandlestick, Database, Radio, Server, type LucideIcon } from "lucide-react";
import type { ComponentHealth, HealthState } from "@/types";

export const COMPONENT_META: Record<
  ComponentHealth["key"],
  { icon: LucideIcon; label: string; description: string }
> = {
  bot: {
    icon: Bot,
    label: "Bot status",
    description: "The trading engine process: heartbeat, strategy and the symbols it trades.",
  },
  api: {
    icon: Server,
    label: "API status",
    description: "The FastAPI gateway this dashboard talks to (REST + WebSocket).",
  },
  openrouter: {
    icon: BrainCircuit,
    label: "OpenRouter status",
    description:
      "The LLM provider behind the AI analyst. Not configured = the local heuristic analyst answers instead (grey, not an error).",
  },
  market_data: {
    icon: ChartCandlestick,
    label: "Market data status",
    description: "The price feed (Binance or the deterministic simulator) and how fresh its last tick is.",
  },
  database: {
    icon: Database,
    label: "Database status",
    description: "SQLite (WAL) — the boundary between engine and API. Latency is a probe query from the API.",
  },
  websocket: {
    icon: Radio,
    label: "WebSocket status",
    description: "The live-update hub pushing frames to every open dashboard.",
  },
};

/** 🟢 / 🟡 / 🔴 / grey, in words for screen readers and tooltips. */
export const HEALTH_GLYPH: Record<HealthState, string> = {
  operational: "🟢 Operational",
  warning: "🟡 Warning",
  error: "🔴 Error",
  disabled: "⚪ Not configured",
};

/** Worst state wins (disabled never counts as a problem). */
export function overallHealth(states: readonly HealthState[]): HealthState {
  if (states.includes("error")) return "error";
  if (states.includes("warning")) return "warning";
  return "operational";
}
