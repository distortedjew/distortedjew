import { useState } from "react";
import { toast } from "sonner";
import { LiveTag } from "@/components/layout/LiveTag";
import { exportTradesCsv, useTrades } from "@/hooks/queries";
import { useUrlState } from "@/hooks/use-url-state";
import { describeError } from "@/lib/api";
import { navItem } from "@/lib/constants";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { TradeDrawerHost, TradeFilterBar, TradesSummary, TradesTable, useTradeView } from "@/features/trades";
import {
  activeFilterCount,
  filtersToApi,
  PAGE_SIZE,
  sortStateFromView,
  sortStateToView,
  viewToApi,
} from "@/features/trades/trade-filters";

export default function TradesPage() {
  const nav = navItem("trades");
  const { view, update, clearFilters } = useTradeView();
  const [selected, setSelected] = useUrlState<string>("trade", "");
  const [exporting, setExporting] = useState(false);

  const q = useTrades(viewToApi(view));
  const filterCount = activeFilterCount(view);

  const onExport = async () => {
    setExporting(true);
    try {
      await exportTradesCsv(filtersToApi(view));
      toast.success("Trades exported");
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader title={nav.label} description={nav.description} icon={nav.icon} meta={<LiveTag />} />
      <TradeFilterBar
        view={view}
        onChange={update}
        onClear={clearFilters}
        onExport={() => void onExport()}
        exporting={exporting}
        canExport={(q.data?.total ?? 0) > 0}
      />
      <TradesSummary summary={q.data?.summary} loading={q.isPending} />
      <Card>
        <CardHeader
          title="Closed trades"
          subtitle="Newest first by default · click a trade for its chart and reasoning"
        />
        <TradesTable
          trades={q.data?.items}
          loading={q.isPending}
          fetching={q.isFetching && !q.isPending}
          error={q.error}
          onRetry={() => void q.refetch()}
          sort={sortStateFromView(view.sort, view.order)}
          onSortChange={(state) => {
            const next = sortStateToView(state);
            update(next ?? { sort: undefined, order: undefined });
          }}
          onOpen={setSelected}
          selectedId={selected || null}
          filtered={filterCount > 0}
          onClearFilters={clearFilters}
        />
        {q.data && q.data.total > 0 ? (
          <div className="border-t border-line px-4 py-2.5">
            <Pagination
              offset={q.data.offset}
              limit={PAGE_SIZE}
              total={q.data.total}
              noun="trades"
              disabled={q.isFetching}
              onOffsetChange={(offset) => update({ offset })}
            />
          </div>
        ) : null}
      </Card>
      <TradeDrawerHost />
    </>
  );
}
