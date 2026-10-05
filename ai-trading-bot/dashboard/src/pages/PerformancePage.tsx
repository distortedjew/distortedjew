import { Hammer } from "lucide-react";
import { navItem } from "@/lib/constants";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

/** Placeholder — replaced by the performance page build (see dashboard/README.md for conventions). */
export default function PerformancePage() {
  const nav = navItem("performance");
  return (
    <>
      <PageHeader title={nav.label} description={nav.description} icon={nav.icon} />
      <div className="rounded-xl border border-dashed border-line-strong">
        <EmptyState
          size="lg"
          icon={Hammer}
          title={`${nav.label} is being built`}
          description="Equity curve, drawdown, daily and monthly returns, trade statistics and breakdowns by symbol and exit reason."
        />
      </div>
    </>
  );
}
