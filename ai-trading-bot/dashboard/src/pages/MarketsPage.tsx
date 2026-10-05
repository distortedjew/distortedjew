import { Hammer } from "lucide-react";
import { navItem } from "@/lib/constants";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

/** Placeholder — replaced by the markets page build (see dashboard/README.md for conventions). */
export default function MarketsPage() {
  const nav = navItem("markets");
  return (
    <>
      <PageHeader title={nav.label} description={nav.description} icon={nav.icon} />
      <div className="rounded-xl border border-dashed border-line-strong">
        <EmptyState
          size="lg"
          icon={Hammer}
          title={`${nav.label} is being built`}
          description="Live candlestick charts with indicators, trade markers and position levels, the watchlist, multi-timeframe alignment and the market regime."
        />
      </div>
    </>
  );
}
