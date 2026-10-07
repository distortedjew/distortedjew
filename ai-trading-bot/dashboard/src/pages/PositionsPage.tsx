import { Hammer } from "lucide-react";
import { navItem } from "@/lib/constants";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

/** Placeholder — replaced by the positions page build (see dashboard/README.md for conventions). */
export default function PositionsPage() {
  const nav = navItem("positions");
  return (
    <>
      <PageHeader title={nav.label} description={nav.description} icon={nav.icon} />
      <div className="rounded-xl border border-dashed border-line-strong">
        <EmptyState
          size="lg"
          icon={Hammer}
          title={`${nav.label} is being built`}
          description="Open positions with live P&L, distance to stop / target, R multiple and the AI reasoning behind each entry."
        />
      </div>
    </>
  );
}
