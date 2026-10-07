import { Gauge, ShieldAlert, Target } from "lucide-react";
import { usePortfolio } from "@/hooks/queries";
import { formatDuration, formatPct, formatUsd, isNum } from "@/lib/format";
import { Field, NumberInput, Slider } from "@/components/ui";
import {
  FieldGrid,
  ModifiedMark,
  NumberSetting,
  SettingsSection,
  type TabProps,
} from "@/features/settings/fields";

export function RiskTab({ form, errors, dirty, update }: TabProps) {
  const r = form.risk;
  const equity = usePortfolio().data?.equity;
  const perTrade = isNum(equity) ? (equity * r.risk_per_trade_pct) / 100 : null;
  const set =
    <F extends keyof typeof r>(field: F) =>
    (value: (typeof r)[F]) =>
      update("risk", field, value);
  const common = (path: keyof typeof r) => ({
    error: errors[`risk.${path}`],
    modified: dirty.has(`risk.${path}`),
  });

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SettingsSection
        title="Per trade"
        icon={Target}
        description="How much each trade risks and what quality it needs"
        className="xl:col-span-2"
      >
        <FieldGrid className="lg:grid-cols-3">
          <NumberSetting
            path="risk.risk_per_trade_pct"
            label="Risk per trade"
            unit="%"
            step={0.1}
            value={r.risk_per_trade_pct}
            onChange={set("risk_per_trade_pct")}
            hint={
              perTrade !== null
                ? `≈ ${formatUsd(perTrade)} at the stop on today's ${formatUsd(equity, { compact: true })} equity`
                : "Share of equity lost if the stop is hit"
            }
            info="Position size = equity × risk % ÷ distance to the stop, capped by the per-position and exposure limits."
            {...common("risk_per_trade_pct")}
          />
          <NumberSetting
            path="risk.min_risk_reward"
            label="Minimum risk / reward"
            unit="R"
            step={0.1}
            value={r.min_risk_reward}
            onChange={set("min_risk_reward")}
            hint={`Target must be ≥ ${r.min_risk_reward}× the stop distance`}
            info="Recomputed by the risk manager from the entry, stop and target — never taken from the AI's word."
            {...common("min_risk_reward")}
          />
          <Field
            label="Minimum AI confidence"
            htmlFor="setting-risk-min_ai_confidence"
            info="Signals below this confidence are rejected. A confident opposite signal (≥ this + 10) can close an open position."
            error={errors["risk.min_ai_confidence"]}
            aside={
              <span className="flex items-center gap-2">
                <ModifiedMark show={dirty.has("risk.min_ai_confidence")} />
                <span className="num text-fg-subtle">0–100 %</span>
              </span>
            }
            hint={`Signals under ${formatPct(r.min_ai_confidence, { decimals: 0 })} confidence are rejected`}
          >
            <div className="flex items-center gap-3">
              <Slider
                aria-label="Minimum AI confidence"
                value={r.min_ai_confidence}
                onValueChange={set("min_ai_confidence")}
                min={0}
                max={100}
                step={1}
                className="flex-1"
              />
              <NumberInput
                id="setting-risk-min_ai_confidence"
                value={r.min_ai_confidence}
                onValueChange={(v) => set("min_ai_confidence")(v ?? 0)}
                min={0}
                max={100}
                step={1}
                unit="%"
                className="w-24"
                invalid={Boolean(errors["risk.min_ai_confidence"])}
              />
            </div>
          </Field>
        </FieldGrid>
      </SettingsSection>

      <SettingsSection
        title="Limits"
        icon={Gauge}
        description="Caps on what can be open at once and lost in a day"
      >
        <FieldGrid>
          <NumberSetting
            path="risk.max_positions"
            label="Maximum open positions"
            value={r.max_positions}
            onChange={set("max_positions")}
            hint="Across all symbols"
            {...common("max_positions")}
          />
          <NumberSetting
            path="risk.max_daily_loss_usd"
            label="Maximum daily loss"
            unit="USDT"
            step={10}
            value={r.max_daily_loss_usd}
            onChange={set("max_daily_loss_usd")}
            hint="Hit it and every position closes (kill switch) until the next UTC day"
            info="Realized loss today plus the risk of a new trade must stay under this. At 80 % a warning is raised."
            {...common("max_daily_loss_usd")}
          />
          <NumberSetting
            path="risk.max_exposure_pct"
            label="Maximum exposure"
            unit="%"
            step={10}
            value={r.max_exposure_pct}
            onChange={set("max_exposure_pct")}
            hint="Total open notional, % of equity"
            {...common("max_exposure_pct")}
          />
          <NumberSetting
            path="risk.max_position_pct"
            label="Maximum position size"
            unit="%"
            step={5}
            value={r.max_position_pct}
            onChange={set("max_position_pct")}
            hint="Notional of a single position, % of equity"
            {...common("max_position_pct")}
          />
        </FieldGrid>
      </SettingsSection>

      <SettingsSection
        title="Circuit breakers"
        icon={ShieldAlert}
        description="Automatic pauses after losses"
      >
        <FieldGrid>
          <NumberSetting
            path="risk.max_consecutive_losses"
            label="Loss streak limit"
            unit="losses"
            value={r.max_consecutive_losses}
            onChange={set("max_consecutive_losses")}
            hint="Consecutive losing trades before a cooldown"
            {...common("max_consecutive_losses")}
          />
          <NumberSetting
            path="risk.loss_streak_cooldown_minutes"
            label="Cooldown after a streak"
            unit="min"
            step={15}
            value={r.loss_streak_cooldown_minutes}
            onChange={set("loss_streak_cooldown_minutes")}
            hint={
              r.loss_streak_cooldown_minutes > 0
                ? `No new entries for ${formatDuration(r.loss_streak_cooldown_minutes * 60)}`
                : "0 = no cooldown"
            }
            {...common("loss_streak_cooldown_minutes")}
          />
          <NumberSetting
            path="risk.max_drawdown_pct"
            label="Maximum drawdown"
            unit="%"
            step={1}
            value={r.max_drawdown_pct}
            onChange={set("max_drawdown_pct")}
            hint={`A ${formatPct(-r.max_drawdown_pct, { decimals: 0 })} fall from peak equity stops new entries for 24 h`}
            className="sm:col-span-2"
            {...common("max_drawdown_pct")}
          />
        </FieldGrid>
      </SettingsSection>
    </div>
  );
}
