/**
 * Pure settings-form logic: the schema bounds (mirroring backend/tradebot/schemas.py and the API's
 * cross-field rules in api/bot_settings.py), validation, dirty diffing, immutable updates and
 * the mapping of 422 errors onto fields and tabs.
 */
import type { BotSettings } from "@/types";

export type SectionKey = "trading" | "risk" | "execution" | "ai" | "notifications";
export const SECTIONS: SectionKey[] = ["trading", "risk", "execution", "ai", "notifications"];

/** Server-owned fields: shown, never diffed (the API ignores them on PUT). */
export const READ_ONLY_FIELDS: ReadonlySet<string> = new Set([
  "trading.paper_trading",
  "trading.live_trading",
  "notifications.telegram_configured",
  "notifications.discord_configured",
  "notifications.email_configured",
]);

export interface Bound {
  min?: number;
  max?: number;
  integer?: boolean;
}

/** Field bounds from schemas.py (`Field(ge=…, le=…)`). */
export const BOUNDS: Record<string, Bound> = {
  "trading.max_holding_minutes": { min: 5, max: 10080, integer: true },
  "risk.risk_per_trade_pct": { min: 0.1, max: 5 },
  "risk.max_daily_loss_usd": { min: 1 },
  "risk.max_positions": { min: 1, max: 20, integer: true },
  "risk.min_risk_reward": { min: 0.5, max: 10 },
  "risk.min_ai_confidence": { min: 0, max: 100 },
  "risk.max_consecutive_losses": { min: 1, max: 50, integer: true },
  "risk.loss_streak_cooldown_minutes": { min: 0, max: 1440, integer: true },
  "risk.max_drawdown_pct": { min: 1, max: 90 },
  "risk.max_exposure_pct": { min: 10, max: 500 },
  "risk.max_position_pct": { min: 1, max: 200 },
  "execution.fee_bps": { min: 0, max: 100 },
  "execution.slippage_bps": { min: 0, max: 100 },
  "execution.limit_order_timeout_minutes": { min: 1, max: 1440, integer: true },
  "ai.temperature": { min: 0, max: 2 },
  "ai.max_tokens": { min: 128, max: 8000, integer: true },
  "ai.request_timeout_sec": { min: 5, max: 180, integer: true },
  "ai.retry_count": { min: 0, max: 5, integer: true },
};

export const MAX_SYMBOLS = 10;
export const MAX_FALLBACK_MODELS = 5;
export const SYMBOL_RE = /^[A-Z0-9]{2,12}\/[A-Z0-9]{2,8}$/;
export const MODEL_ID_RE = /^[A-Za-z0-9][\w.-]*\/[\w.\-:]+$/;
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ---------------------------------------------------------------- path helpers

export function getIn(settings: BotSettings, path: string): unknown {
  let node: unknown = settings;
  for (const part of path.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/** Immutable `section.field` update. */
export function setIn<S extends SectionKey, F extends keyof BotSettings[S]>(
  settings: BotSettings,
  section: S,
  field: F,
  value: BotSettings[S][F],
): BotSettings {
  return { ...settings, [section]: { ...settings[section], [field]: value } };
}

function formatBound(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

export function checkBound(value: unknown, bound: Bound): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Enter a number";
  if (bound.integer && !Number.isInteger(value)) return "Must be a whole number";
  if (bound.min !== undefined && value < bound.min) {
    return bound.max !== undefined
      ? `Must be between ${formatBound(bound.min)} and ${formatBound(bound.max)}`
      : `Must be at least ${formatBound(bound.min)}`;
  }
  if (bound.max !== undefined && value > bound.max) {
    return bound.min !== undefined
      ? `Must be between ${formatBound(bound.min)} and ${formatBound(bound.max)}`
      : `Must be at most ${formatBound(bound.max)}`;
  }
  return null;
}

// ---------------------------------------------------------------- validation

/** Client-side validation. Keys are dotted paths (`risk.max_positions`, `ai.fallback_models.1`). */
export function validateSettings(settings: BotSettings): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [path, bound] of Object.entries(BOUNDS)) {
    const message = checkBound(getIn(settings, path), bound);
    if (message) errors[path] = message;
  }

  const { trading, ai, notifications } = settings;
  const symbols = trading.symbols.map((s) => s.trim().toUpperCase());
  if (symbols.length === 0) errors["trading.symbols"] = "Trade at least one symbol";
  else if (symbols.length > MAX_SYMBOLS) errors["trading.symbols"] = `At most ${MAX_SYMBOLS} symbols`;
  symbols.forEach((symbol, i) => {
    if (!SYMBOL_RE.test(symbol))
      errors[`trading.symbols.${i}`] = "Symbol must look like BASE/QUOTE, e.g. BTC/USDT";
    else if (symbols.indexOf(symbol) !== i) errors[`trading.symbols.${i}`] = `Duplicate symbol ${symbol}`;
  });
  if (symbols.length && !symbols.includes(trading.primary_symbol.trim().toUpperCase())) {
    errors["trading.primary_symbol"] = "Primary symbol must be one of the traded symbols";
  }

  const model = ai.model.trim();
  if (!MODEL_ID_RE.test(model)) errors["ai.model"] = "Model id must look like provider/model";
  if (ai.fallback_models.length > MAX_FALLBACK_MODELS) {
    errors["ai.fallback_models"] = `At most ${MAX_FALLBACK_MODELS} fallback models`;
  }
  const seen: string[] = [];
  ai.fallback_models.forEach((raw, i) => {
    const id = raw.trim();
    if (!MODEL_ID_RE.test(id)) errors[`ai.fallback_models.${i}`] = "Model id must look like provider/model";
    else if (id === model || seen.includes(id)) {
      errors[`ai.fallback_models.${i}`] = "Fallback models must be unique and differ from the main model";
    }
    seen.push(id);
  });

  const email = (notifications.email_to ?? "").trim();
  if (email && !EMAIL_RE.test(email)) errors["notifications.email_to"] = "Not a valid email address";
  else if (notifications.email_enabled && !email) {
    errors["notifications.email_to"] = "Add a recipient to enable email alerts";
  }
  return errors;
}

// ---------------------------------------------------------------- diffing

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Dotted paths of the editable fields that differ (read-only fields never count). */
export function diffSettings(base: BotSettings, draft: BotSettings): string[] {
  const out: string[] = [];
  for (const section of SECTIONS) {
    const a = base[section] as unknown as Record<string, unknown>;
    const b = draft[section] as unknown as Record<string, unknown>;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      const path = `${section}.${key}`;
      if (!READ_ONLY_FIELDS.has(path) && !same(a[key], b[key])) out.push(path);
    }
  }
  return out;
}

/** The section (= settings tab) a field path belongs to; "trading.symbols.2" → "trading". */
export function sectionOf(path: string): SectionKey | null {
  const head = path.split(".")[0] as SectionKey;
  return SECTIONS.includes(head) ? head : null;
}

/** Count of entries per section for tab badges. */
export function countBySection(paths: Iterable<string>): Partial<Record<SectionKey, number>> {
  const out: Partial<Record<SectionKey, number>> = {};
  for (const path of paths) {
    const section = sectionOf(path);
    if (section) out[section] = (out[section] ?? 0) + 1;
  }
  return out;
}

/** The first error for a field or any of its children (`ai.fallback_models` ← `ai.fallback_models.1`). */
export function errorFor(errors: Record<string, string>, path: string): string | undefined {
  if (errors[path]) return errors[path];
  const prefix = `${path}.`;
  const child = Object.keys(errors).find((k) => k.startsWith(prefix));
  return child ? errors[child] : undefined;
}

/** Trim / upper-case free-text values the way the API normalises them, before saving. */
export function normalizeForSave(settings: BotSettings): BotSettings {
  return {
    ...settings,
    trading: {
      ...settings.trading,
      symbols: settings.trading.symbols.map((s) => s.trim().toUpperCase()),
      primary_symbol: settings.trading.primary_symbol.trim().toUpperCase(),
    },
    ai: {
      ...settings.ai,
      model: settings.ai.model.trim(),
      fallback_models: settings.ai.fallback_models.map((m) => m.trim()),
    },
    notifications: {
      ...settings.notifications,
      email_to: settings.notifications.email_to?.trim() || null,
    },
  };
}

/** "Saved v12" lifecycle once a PUT succeeds. */
export type ApplyState = "waiting" | "applied" | "offline";

/** Has the engine applied `savedVersion` (from the status heartbeat or the settings response)? */
export function applyState(
  savedVersion: number,
  appliedVersion: number | null | undefined,
  engineOnline: boolean,
): ApplyState {
  if (appliedVersion !== null && appliedVersion !== undefined && appliedVersion >= savedVersion)
    return "applied";
  return engineOnline ? "waiting" : "offline";
}
