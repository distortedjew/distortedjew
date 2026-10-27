import { Hourglass, Receipt, Zap } from "lucide-react";
import { formatNumber, formatPct } from "@/lib/format";
import {
  ChoiceCards,
  FieldGrid,
  ModifiedMark,
  NumberSetting,
  SettingsSection,
  type TabProps,
} from "@/features/settings/fields";

/** "5 bps = 0.05 %" */
export function bpsAsPct(bps: number): string {
  return formatPct(bps / 100, { decimals: bps % 1 === 0 && bps % 10 === 0 ? 1 : 2 });
}

export function ExecutionTab({ form, errors, dirty, update }: TabProps) {
  const e = form.execution;
  const roundTripBps = 2 * (e.fee_bps + e.slippage_bps);
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <SettingsSection
        title="Order type"
        icon={Zap}
        description="How the paper broker enters positions"
        className="xl:col-span-2"
        actions={<ModifiedMark show={dirty.has("execution.order_type")} />}
      >
        <div className="space-y-4">
          <ChoiceCards
            name="order-type"
            columns={2}
            value={e.order_type}
            onChange={(v) => update("execution", "order_type", v)}
            options={[
              {
                value: "market",
                label: "Market",
                icon: Zap,
                description:
                  "Fill immediately at the current price, plus slippage against you. Never misses a signal.",
              },
              {
                value: "limit",
                label: "Limit",
                icon: Hourglass,
                description:
                  "Rest at the analyst's entry price; cancelled if not filled within the timeout. Better prices, some missed trades.",
              },
            ]}
          />
          <NumberSetting
            path="execution.limit_order_timeout_minutes"
            label="Limit order timeout"
            unit="min"
            value={e.limit_order_timeout_minutes}
            onChange={(v) => update("execution", "limit_order_timeout_minutes", v)}
            hint={
              e.order_type === "limit"
                ? "Unfilled limit orders are cancelled after this"
                : "Only used with limit orders"
            }
            error={errors["execution.limit_order_timeout_minutes"]}
            modified={dirty.has("execution.limit_order_timeout_minutes")}
            className="max-w-sm"
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Costs"
        icon={Receipt}
        description="Simulated per side — 1 bps = 0.01 %"
        info="Fees are charged on entry and exit notional; slippage moves every market fill against you. Keep them realistic so paper results translate."
      >
        <div className="space-y-4">
          <FieldGrid className="sm:grid-cols-1">
            <NumberSetting
              path="execution.fee_bps"
              label="Fee per side"
              unit="bps"
              step={0.5}
              value={e.fee_bps}
              onChange={(v) => update("execution", "fee_bps", v)}
              hint={`= ${bpsAsPct(e.fee_bps)} of notional · perp taker ≈ 5, spot ≈ 10`}
              error={errors["execution.fee_bps"]}
              modified={dirty.has("execution.fee_bps")}
            />
            <NumberSetting
              path="execution.slippage_bps"
              label="Slippage"
              unit="bps"
              step={0.5}
              value={e.slippage_bps}
              onChange={(v) => update("execution", "slippage_bps", v)}
              hint={`= ${bpsAsPct(e.slippage_bps)} worse price on market fills and stops`}
              error={errors["execution.slippage_bps"]}
              modified={dirty.has("execution.slippage_bps")}
            />
          </FieldGrid>
          <div className="rounded-lg border border-line-subtle bg-surface-2/60 px-3 py-2.5">
            <p className="flex items-baseline justify-between gap-3 text-xs text-fg-subtle">
              Round-trip cost
              <span className="num text-sm text-fg">
                {formatNumber(roundTripBps, roundTripBps % 1 === 0 ? 0 : 1)} bps · {bpsAsPct(roundTripBps)}
              </span>
            </p>
            <p className="mt-1 text-xs text-fg-subtle">
              A trade must move more than this just to break even (fees + slippage, in and out).
            </p>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
