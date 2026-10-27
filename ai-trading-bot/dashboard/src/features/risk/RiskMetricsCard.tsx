import { SlidersHorizontal } from "lucide-react";
import type { RiskSnapshot } from "@/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatGrid } from "@/components/ui/KeyValue";
import { LiveTag } from "@/components/layout/LiveTag";
import { riskMetricGroups } from "./risk-figures";

export function RiskMetricsCard({ risk, loading }: { risk: RiskSnapshot | undefined; loading?: boolean }) {
  return (
    <Card>
      <CardHeader
        title="Risk figures"
        icon={SlidersHorizontal}
        badge={<LiveTag />}
        subtitle="Live values behind the meters"
      />
      <CardBody className="space-y-4">
        {loading || !risk
          ? Array.from({ length: 3 }, (_, g) => (
              <div key={g} aria-busy="true">
                <Skeleton className="mb-2.5 h-3 w-28" />
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: 4 }, (_, i) => (
                    <Skeleton key={i} className="h-12" />
                  ))}
                </div>
              </div>
            ))
          : riskMetricGroups(risk).map((group) => (
              <div key={group.title}>
                <SectionHeader title={group.title} />
                <StatGrid items={group.items} columns={2} divided />
              </div>
            ))}
      </CardBody>
    </Card>
  );
}
