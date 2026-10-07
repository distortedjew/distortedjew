import { Hammer } from "lucide-react";
import { navItem } from "@/lib/constants";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

/** Placeholder — replaced by the trades page build (see dashboard/README.md for conventions). */
export default function TradesPage() {
  const nav = navItem("trades");
  return (
    <>
      <PageHeader title={nav.label} description={nav.description} icon={nav.icon} />
      <div className="rounded-xl border border-dashed border-line-strong">
        <EmptyState
          size="lg"
          icon={Hammer}
          title={`${nav.label} is being built`}
          description="Every closed trade with filters, sorting, CSV export and a replay of the trade on the chart."
        />
      </div>
    </>
  );
}
