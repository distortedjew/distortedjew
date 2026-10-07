import { Hammer } from "lucide-react";
import { navItem } from "@/lib/constants";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

/** Placeholder — replaced by the risk page build (see dashboard/README.md for conventions). */
export default function RiskPage() {
  const nav = navItem("risk");
  return (
    <>
      <PageHeader title={nav.label} description={nav.description} icon={nav.icon} />
      <div className="rounded-xl border border-dashed border-line-strong">
        <EmptyState
          size="lg"
          icon={Hammer}
          title={`${nav.label} is being built`}
          description="Risk limits and utilization meters, exposure, daily loss, drawdown and trading halts."
        />
      </div>
    </>
  );
}
