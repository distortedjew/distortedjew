import { Link } from "react-router";
import { OctagonAlert, ShieldAlert, ShieldCheck, ShieldHalf } from "lucide-react";
import { useRisk } from "@/hooks/queries";
import { cn } from "@/lib/cn";
import { TONE_TEXT } from "@/lib/tones";
import { useNow } from "@/lib/time";
import { LiveTag } from "@/components/layout/LiveTag";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { RiskMeterRow } from "./RiskMeterBar";
import { deriveRiskState, formatCountdown, secondsUntil, summaryMeters } from "./risk-logic";

/**
 * Overview widget: trading allowed / halted plus the most important meters. Self-contained
 * (fetches through useRisk, which the WebSocket keeps live), works from 320 px.
 */
export function RiskSummaryCard({ className }: { className?: string }) {
  const q = useRisk();
  const now = useNow();
  const risk = q.data;
  const info = risk ? deriveRiskState(risk) : null;
  const halted = info?.state === "halted";
  const remaining = risk ? secondsUntil(risk.halted_until, now) : null;

  const badge = !info ? null : halted ? (
    <Badge tone="down" variant="solid" size="xs" icon={OctagonAlert} caps>
      Halted
    </Badge>
  ) : info.state === "limit" ? (
    <Badge tone="down" size="xs" icon={OctagonAlert} caps>
      Limit reached
    </Badge>
  ) : info.state === "caution" ? (
    <Badge tone="warning" size="xs" icon={ShieldAlert} caps>
      Caution
    </Badge>
  ) : (
    <Badge tone="up" size="xs" icon={ShieldCheck} caps>
      Trading allowed
    </Badge>
  );

  return (
    <Card className={cn(halted && "ring-1 ring-down/50", className)}>
      <CardHeader title="Risk" icon={ShieldHalf} badge={<LiveTag />} actions={badge} />
      <CardBody className="space-y-3.5">
        {q.isPending ? (
          <div className="space-y-3.5" aria-busy="true" aria-label="Loading risk summary">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        ) : q.error && !risk ? (
          <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />
        ) : risk ? (
          <>
            {halted ? (
              <div
                role="alert"
                className="rounded-lg bg-down/10 px-3 py-2 text-xs ring-1 ring-down/40 ring-inset"
              >
                <p className={cn("font-semibold tracking-[0.03em]", TONE_TEXT.down)}>TRADING HALTED</p>
                <p className="text-fg-muted">{risk.halt_reason ?? "The risk manager halted trading."}</p>
                {remaining !== null ? (
                  <p className="mt-0.5 num text-fg-subtle">Resumes in {formatCountdown(remaining)}</p>
                ) : null}
              </div>
            ) : null}
            {summaryMeters(risk).map((m) => (
              <RiskMeterRow key={m.key} meter={m} />
            ))}
            <div className="flex justify-end pt-0.5">
              <Button asChild variant="link" size="xs" className="text-xs">
                <Link to="/risk">Open risk dashboard</Link>
              </Button>
            </div>
          </>
        ) : null}
      </CardBody>
    </Card>
  );
}
