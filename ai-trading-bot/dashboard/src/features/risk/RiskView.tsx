import { ShieldAlert } from "lucide-react";
import { useRisk } from "@/hooks/queries";
import { useIsMobile } from "@/hooks/use-media-query";
import { navItem } from "@/lib/constants";
import { toMs } from "@/lib/time";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { RelativeTime } from "@/components/ui/Timestamp";
import { ExposureBreakdownCard } from "./ExposureBreakdownCard";
import { LimitsCard } from "./LimitsCard";
import { RiskEventsCard } from "./RiskEventsCard";
import { RiskMeterBar } from "./RiskMeterBar";
import { RiskMetricsCard } from "./RiskMetricsCard";
import { StatusHero } from "./StatusHero";
import { orderMeters } from "./risk-logic";

function MetersSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2" aria-busy="true" aria-label="Loading risk meters">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="rounded-xl bg-surface-2/60 p-3.5 ring-1 ring-line-subtle ring-inset"
          aria-hidden
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-14" />
          </div>
          <Skeleton className="mt-3 h-6 w-32" />
          <Skeleton className="mt-3 h-3 w-full rounded-full" />
          <Skeleton className="mt-3 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

/** The Risk page: status hero, six live meters, figures, exposure, limits and recent warnings. */
export function RiskView() {
  const nav = navItem("risk");
  const mobile = useIsMobile();
  const q = useRisk();
  const risk = q.data;
  const updated = toMs(risk?.updated_at);

  const header = (
    <PageHeader
      title={nav.label}
      description={nav.description}
      icon={nav.icon}
      meta={
        updated ? (
          <span className="num text-xs text-fg-subtle">
            Updated <RelativeTime ms={updated} />
          </span>
        ) : null
      }
    />
  );

  if (q.error && !risk) {
    return (
      <>
        {header}
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} className="py-12" />
        </Card>
      </>
    );
  }

  const meters = risk ? orderMeters(risk.meters, mobile) : [];
  const warnings = risk?.warnings ?? [];

  return (
    <>
      {header}
      {risk ? (
        <StatusHero risk={risk} />
      ) : (
        <div
          className="flex items-center gap-4 rounded-xl surface-card p-5"
          aria-busy="true"
          aria-label="Loading trading status"
        >
          <Skeleton className="size-11 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          <Card>
            <CardHeader
              title="Risk meters"
              subtitle="Utilization of each limit · ticks mark 70 % (warning) and 90 % (critical)"
              info="Each meter shows how much of its limit is used. At 70 % it turns amber, at 90 % red, and at 100 % the limit is reached and the risk manager acts."
            />
            <CardBody>
              {risk ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {meters.map((m) => (
                    <RiskMeterBar key={m.key} meter={m} />
                  ))}
                </div>
              ) : (
                <MetersSkeleton />
              )}
            </CardBody>
          </Card>
          <ExposureBreakdownCard risk={risk} />
          <RiskEventsCard rejectionsToday={risk?.rejections_today} />
        </div>
        <div className="grid min-w-0 content-start gap-4 md:grid-cols-2 xl:grid-cols-1">
          {warnings.length > 0 ? (
            <Card className="ring-1 ring-warning/30 md:col-span-2 xl:col-span-1">
              <CardHeader
                title="Active warnings"
                icon={ShieldAlert}
                subtitle={`${warnings.length} from the risk manager`}
              />
              <CardBody>
                <ul className="space-y-1.5 text-dense text-fg-muted">
                  {warnings.map((w) => (
                    <li key={w} className="flex gap-2">
                      <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-warning" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
          <RiskMetricsCard risk={risk} loading={q.isPending} />
          <LimitsCard risk={risk} loading={q.isPending} />
        </div>
      </div>
    </>
  );
}
