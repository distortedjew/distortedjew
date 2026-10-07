import {
  ArrowDownRight,
  Check,
  Coins,
  FlaskConical,
  Lock,
  OctagonAlert,
  Plus,
  Timer,
  Workflow,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { STRATEGY_META, TIMEFRAME_LABEL, TIMEFRAMES } from "@/lib/constants";
import { formatDuration, splitSymbol } from "@/lib/format";
import { TONE_TEXT } from "@/lib/tones";
import type { StrategyName } from "@/types";
import { Badge, Button, Field, Input, SegmentedControl, Select, Switch } from "@/components/ui";
import {
  ChoiceCards,
  FieldGrid,
  ModifiedMark,
  NumberSetting,
  SettingsSection,
  type TabProps,
} from "@/features/settings/fields";
import { MAX_SYMBOLS, SYMBOL_RE, errorFor } from "@/features/settings/settings-form";

/** Liquid USDT pairs offered as one-click choices (any BASE/QUOTE can still be added). */
export const CURATED_SYMBOLS = [
  "BTC/USDT",
  "ETH/USDT",
  "SOL/USDT",
  "BNB/USDT",
  "XRP/USDT",
  "ADA/USDT",
  "DOGE/USDT",
  "AVAX/USDT",
  "LINK/USDT",
  "DOT/USDT",
  "LTC/USDT",
  "TRX/USDT",
];

const STRATEGIES: StrategyName[] = ["ai", "hybrid", "baseline"];

export function TradingTab({
  form,
  errors,
  dirty,
  update,
  savedSymbols,
}: TabProps & { savedSymbols: string[] }) {
  const t = form.trading;
  const [custom, setCustom] = useState("");
  const choices = [...new Set([...CURATED_SYMBOLS, ...savedSymbols, ...t.symbols])];
  const customSymbol = custom.trim().toUpperCase();
  const customError =
    customSymbol && !SYMBOL_RE.test(customSymbol)
      ? "Use BASE/QUOTE, e.g. ARB/USDT"
      : t.symbols.includes(customSymbol)
        ? "Already selected"
        : t.symbols.length >= MAX_SYMBOLS
          ? `At most ${MAX_SYMBOLS} symbols`
          : undefined;

  const toggleSymbol = (symbol: string) => {
    const on = t.symbols.includes(symbol);
    if (!on && t.symbols.length >= MAX_SYMBOLS) return;
    const next = on ? t.symbols.filter((s) => s !== symbol) : [...t.symbols, symbol];
    // Keep the order of the choice list so toggling back and forth is not a "change".
    const ordered = choices.filter((c) => next.includes(c));
    update("trading", "symbols", ordered);
    if (on && t.primary_symbol === symbol && ordered.length) update("trading", "primary_symbol", ordered[0]);
  };
  const addCustom = () => {
    if (!customSymbol || customError) return;
    update("trading", "symbols", [...t.symbols, customSymbol]);
    setCustom("");
  };

  const symbolsError = errorFor(errors, "trading.symbols");

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SettingsSection
        title="Markets"
        icon={Coins}
        description="What the bot trades and how often it decides"
        className="xl:col-span-2"
        actions={<ModifiedMark show={dirty.has("trading.symbols") || dirty.has("trading.primary_symbol")} />}
      >
        <div className="space-y-5">
          <Field
            label="Symbols"
            info="Every symbol is analysed independently on each decision candle. Each one adds an AI call per decision when an LLM is configured."
            aside={
              <span className={cn("num", t.symbols.length >= MAX_SYMBOLS && "text-warning")}>
                {t.symbols.length} / {MAX_SYMBOLS} selected
              </span>
            }
            error={symbolsError}
          >
            <div className="flex flex-wrap gap-2" role="group" aria-label="Traded symbols">
              {choices.map((symbol) => {
                const on = t.symbols.includes(symbol);
                const { base, quote } = splitSymbol(symbol);
                const full = !on && t.symbols.length >= MAX_SYMBOLS;
                return (
                  <button
                    key={symbol}
                    type="button"
                    aria-pressed={on}
                    disabled={full}
                    onClick={() => toggleSymbol(symbol)}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-dense transition-colors",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/70 disabled:cursor-not-allowed disabled:opacity-40",
                      on
                        ? "border-accent/60 bg-accent/10 text-fg"
                        : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
                    )}
                  >
                    {on ? (
                      <Check className="size-3.5 text-accent" aria-hidden />
                    ) : (
                      <Plus className="size-3.5 text-fg-subtle" aria-hidden />
                    )}
                    <span>
                      <span className="font-medium">{base}</span>
                      <span className="text-fg-subtle">/{quote}</span>
                    </span>
                    {symbol === t.primary_symbol && on ? (
                      <Badge tone="accent" size="xs" className="ml-0.5">
                        Primary
                      </Badge>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex max-w-sm items-start gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  size="sm"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustom();
                    }
                  }}
                  placeholder="Add another pair, e.g. ARB/USDT"
                  aria-label="Add a symbol"
                  invalid={Boolean(customSymbol && customError)}
                  className="num"
                />
                {customSymbol && customError ? <p className="mt-1 text-xs text-down">{customError}</p> : null}
              </div>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={Plus}
                onClick={addCustom}
                disabled={!customSymbol || Boolean(customError)}
              >
                Add
              </Button>
            </div>
          </Field>

          <FieldGrid>
            <Field
              label="Primary symbol"
              htmlFor="setting-primary"
              info="Shown by default on the Overview and Markets pages."
              error={errors["trading.primary_symbol"]}
              aside={<ModifiedMark show={dirty.has("trading.primary_symbol")} />}
            >
              <Select
                id="setting-primary"
                value={t.symbols.includes(t.primary_symbol) ? t.primary_symbol : undefined}
                onValueChange={(v) => update("trading", "primary_symbol", v)}
                options={t.symbols.map((s) => ({ value: s, label: s }))}
                placeholder="Choose one of the traded symbols"
                invalid={Boolean(errors["trading.primary_symbol"])}
              />
            </Field>
            <Field
              label="Decision timeframe"
              info="The bot runs its analysis on every symbol when a candle of this timeframe closes. Shorter = more decisions (and more AI calls)."
              hint={`Analyses every ${TIMEFRAME_LABEL[t.decision_timeframe]}`}
              aside={<ModifiedMark show={dirty.has("trading.decision_timeframe")} />}
            >
              <SegmentedControl
                aria-label="Decision timeframe"
                value={t.decision_timeframe}
                onValueChange={(v) => update("trading", "decision_timeframe", v)}
                options={TIMEFRAMES.map((tf) => ({ value: tf, label: tf, title: TIMEFRAME_LABEL[tf] }))}
                fullWidth
              />
            </Field>
          </FieldGrid>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Strategy"
        icon={Workflow}
        description="Who decides — the AI analyst, the technical baseline, or both"
        className="xl:col-span-2"
        actions={<ModifiedMark show={dirty.has("trading.strategy")} />}
      >
        <ChoiceCards
          name="strategy"
          value={t.strategy}
          onChange={(v) => update("trading", "strategy", v)}
          options={STRATEGIES.map((s) => ({
            value: s,
            label: `${STRATEGY_META[s].label} strategy`,
            description: STRATEGY_META[s].description,
            icon: STRATEGY_META[s].icon,
            iconClassName: TONE_TEXT[STRATEGY_META[s].tone],
          }))}
        />
      </SettingsSection>

      <SettingsSection title="Positions" icon={Timer} description="Direction and holding time">
        <div className="space-y-5">
          <Field
            layout="inline"
            label={
              <span className="inline-flex items-center gap-1.5">
                <ArrowDownRight className="size-3.5 text-down" aria-hidden />
                Allow short positions
              </span>
            }
            htmlFor="setting-shorts"
            hint={
              t.allow_shorts
                ? "SHORT signals can open positions"
                : "SHORT signals are rejected by the risk manager"
            }
            aside={<ModifiedMark show={dirty.has("trading.allow_shorts")} />}
          >
            <Switch
              id="setting-shorts"
              checked={t.allow_shorts}
              onCheckedChange={(v) => update("trading", "allow_shorts", v)}
            />
          </Field>
          <NumberSetting
            path="trading.max_holding_minutes"
            label="Maximum holding time"
            unit="min"
            step={15}
            value={t.max_holding_minutes}
            onChange={(v) => update("trading", "max_holding_minutes", v)}
            hint={`Positions still open after ${formatDuration(t.max_holding_minutes * 60)} close with a time exit`}
            info="A safety net against positions that drift without hitting the stop or the target."
            error={errors["trading.max_holding_minutes"]}
            modified={dirty.has("trading.max_holding_minutes")}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Trading mode"
        icon={Lock}
        description="Fixed by the server — not editable from the dashboard"
        info="The dashboard can never switch the bot to real money. Trading mode is decided by the server configuration."
      >
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4 rounded-lg border border-warning/30 bg-warning/[0.06] p-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-dense font-medium text-fg">
                <FlaskConical className="size-3.5 text-warning" aria-hidden />
                Paper trading
                <Badge tone="warning" size="xs" caps>
                  On
                </Badge>
              </p>
              <p className="mt-0.5 text-xs leading-[1.125rem] text-fg-muted">
                Orders are simulated against market prices with fees and slippage. No real funds are used.
              </p>
            </div>
            <span className="flex items-center gap-1.5 text-fg-subtle">
              <Lock className="size-3.5" aria-label="Locked" />
              <Switch checked disabled aria-label="Paper trading (locked on)" />
            </span>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-lg border border-line p-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-dense font-medium text-fg">
                <OctagonAlert className="size-3.5 text-fg-subtle" aria-hidden />
                Live trading
                <Badge tone="muted" size="xs" caps>
                  Off
                </Badge>
              </p>
              <p className="mt-0.5 text-xs leading-[1.125rem] text-fg-muted">
                Real-money trading can only be enabled server-side, and it is not implemented in this build —
                the engine only places paper orders.
              </p>
            </div>
            <span className="flex items-center gap-1.5 text-fg-subtle">
              <Lock className="size-3.5" aria-label="Locked" />
              <Switch checked={false} disabled aria-label="Live trading (locked off)" />
            </span>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
