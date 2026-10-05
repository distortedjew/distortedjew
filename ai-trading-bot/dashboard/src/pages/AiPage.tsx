import { Hammer } from "lucide-react";
import { navItem } from "@/lib/constants";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

/** Placeholder — replaced by the ai page build (see dashboard/README.md for conventions). */
export default function AiPage() {
  const nav = navItem("ai");
  return (
    <>
      <PageHeader title={nav.label} description={nav.description} icon={nav.icon} />
      <div className="rounded-xl border border-dashed border-line-strong">
        <EmptyState
          size="lg"
          icon={Hammer}
          title={`${nav.label} is being built`}
          description="The AI analyst's latest decision and reasoning, decision history, accuracy and calibration, model usage and cost."
        />
      </div>
    </>
  );
}
