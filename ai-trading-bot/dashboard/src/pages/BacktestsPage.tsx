import { Hammer } from "lucide-react";
import { navItem } from "@/lib/constants";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

/** Placeholder — replaced by the backtests page build (see dashboard/README.md for conventions). */
export default function BacktestsPage() {
  const nav = navItem("backtests");
  return (
    <>
      <PageHeader title={nav.label} description={nav.description} icon={nav.icon} />
      <div className="rounded-xl border border-dashed border-line-strong">
        <EmptyState
          size="lg"
          icon={Hammer}
          title={`${nav.label} is being built`}
          description="Run strategy backtests on historical data and compare AI, hybrid and baseline results."
        />
      </div>
    </>
  );
}
