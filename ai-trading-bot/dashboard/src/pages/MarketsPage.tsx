import { PageHeader } from "@/components/ui/PageHeader";
import { LiveTag } from "@/components/layout/LiveTag";
import { useSymbols } from "@/hooks/queries";
import { useBreakpoint } from "@/hooks/use-media-query";
import { useUrlState } from "@/hooks/use-url-state";
import { navItem, TIMEFRAME_LABEL, TIMEFRAMES } from "@/lib/constants";
import type { Timeframe } from "@/types";
import { LiveAnalysisCard } from "@/features/ai";
import { MarketChartPanel, MarketHeader, MtfCard, RegimeCard, Watchlist } from "@/features/market";

export default function MarketsPage() {
  const nav = navItem("markets");
  const { primary } = useSymbols();
  const [symbol, setSymbol] = useUrlState("symbol", primary ?? "BTC/USDT");
  const [tf, setTf] = useUrlState<Timeframe>("tf", "5m", TIMEFRAMES);
  const wide = useBreakpoint("xl");

  return (
    <>
      <PageHeader title={nav.label} description={nav.description} icon={nav.icon} meta={<LiveTag />} />

      {wide ? null : <Watchlist layout="strip" selected={symbol} onSelect={setSymbol} className="mb-3" />}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] 3xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-4">
          <MarketChartPanel
            symbol={symbol}
            timeframe={tf}
            onTimeframeChange={setTf}
            top={<MarketHeader symbol={symbol} />}
            header={
              <span className="text-[13.5px] font-semibold text-fg">
                Chart <span className="font-normal text-fg-subtle">· {TIMEFRAME_LABEL[tf]}</span>
              </span>
            }
          />
          <LiveAnalysisCard symbol={symbol} />
        </div>
        <div className="min-w-0 space-y-4">
          {wide ? <Watchlist selected={symbol} onSelect={setSymbol} /> : null}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <MtfCard symbol={symbol} />
            <RegimeCard symbol={symbol} variant="full" />
          </div>
        </div>
      </div>
    </>
  );
}
