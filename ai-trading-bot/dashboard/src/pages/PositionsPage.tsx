import { LiveTag } from "@/components/layout/LiveTag";
import { usePositions } from "@/hooks/queries";
import { useUrlState } from "@/hooks/use-url-state";
import { navItem } from "@/lib/constants";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PositionDrawerHost, PositionsList, PositionsSummary } from "@/features/positions";

export default function PositionsPage() {
  const nav = navItem("positions");
  const positions = usePositions();
  const [selected, setSelected] = useUrlState<string>("position", "");

  return (
    <>
      <PageHeader title={nav.label} description={nav.description} icon={nav.icon} meta={<LiveTag />} />
      <PositionsSummary />
      <Card>
        <CardHeader
          title="Open positions"
          subtitle="Click a position for its chart, risk calculation and the AI's reasoning"
        />
        <PositionsList
          positions={positions.data}
          loading={positions.isPending}
          error={positions.error}
          onRetry={() => void positions.refetch()}
          selectedId={selected || null}
          onOpen={setSelected}
        />
      </Card>
      <PositionDrawerHost />
    </>
  );
}
