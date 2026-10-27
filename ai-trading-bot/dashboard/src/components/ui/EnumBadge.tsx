import {
  AI_PROVIDER_META,
  BACKTEST_STATUS_META,
  EMA_ALIGNMENT_META,
  EVAL_STATUS_META,
  EVENT_TYPE_META,
  EXIT_REASON_META,
  FEED_META,
  HEALTH_STATE_META,
  NOTIFICATION_TYPE_META,
  ORDER_TYPE_META,
  REGIME_META,
  RISK_METER_STATUS_META,
  RISK_STATUS_META,
  SEVERITY_META,
  SIDE_META,
  SIGNAL_META,
  STRATEGY_META,
  TRADE_RESULT_META,
  TREND_META,
  type Meta,
} from "@/lib/constants";
import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Tooltip } from "@/components/ui/Tooltip";

const MAPS = {
  regime: REGIME_META,
  signal: SIGNAL_META,
  side: SIDE_META,
  trend: TREND_META,
  emaAlignment: EMA_ALIGNMENT_META,
  exitReason: EXIT_REASON_META,
  result: TRADE_RESULT_META,
  riskStatus: RISK_STATUS_META,
  evalStatus: EVAL_STATUS_META,
  strategy: STRATEGY_META,
  provider: AI_PROVIDER_META,
  feed: FEED_META,
  orderType: ORDER_TYPE_META,
  severity: SEVERITY_META,
  health: HEALTH_STATE_META,
  riskMeter: RISK_METER_STATUS_META,
  backtest: BACKTEST_STATUS_META,
  eventType: EVENT_TYPE_META,
  notificationType: NOTIFICATION_TYPE_META,
} as const;

export type EnumKind = keyof typeof MAPS;
type ValueOf<K extends EnumKind> = keyof (typeof MAPS)[K];

export interface EnumBadgeProps<K extends EnumKind> extends Omit<BadgeProps, "tone" | "icon" | "children"> {
  kind: K;
  value: ValueOf<K> | null | undefined;
  /** Use the compact label (e.g. "SL" instead of "Stop loss"). */
  short?: boolean;
  /** Hide the icon. */
  noIcon?: boolean;
  /** Show the enum description in a tooltip (adds a tab stop; avoid inside dense tables). */
  describe?: boolean;
}

/**
 * Badge for any API enum, using the shared display metadata in lib/constants.ts.
 *
 *   <EnumBadge kind="regime" value={regime.regime} />
 *   <EnumBadge kind="exitReason" value={trade.exit_reason} short />
 */
export function EnumBadge<K extends EnumKind>({
  kind,
  value,
  short,
  noIcon,
  describe = false,
  ...props
}: EnumBadgeProps<K>) {
  if (value === null || value === undefined) return null;
  const meta = (MAPS[kind] as Record<string, Meta>)[value as string];
  if (!meta) {
    return (
      <Badge tone="muted" {...props}>
        {String(value)}
      </Badge>
    );
  }
  const badge = (
    <Badge tone={meta.tone} icon={noIcon ? undefined : meta.icon} {...props}>
      {short ? (meta.short ?? meta.label) : meta.label}
    </Badge>
  );
  if (!describe || !meta.description) return badge;
  return (
    <Tooltip content={meta.description}>
      <span tabIndex={0} className="inline-flex rounded-md">
        {badge}
      </span>
    </Tooltip>
  );
}
