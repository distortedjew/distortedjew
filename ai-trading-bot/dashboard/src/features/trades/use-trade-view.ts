import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import { applyViewPatch, viewFromParams, type TradeView } from "./trade-filters";

type Patch = Partial<{ [K in keyof TradeView]: TradeView[K] | undefined }>;

/** The trades page's filters, sort and page, read from and written to the URL query string. */
export function useTradeView() {
  const [params, setParams] = useSearchParams();
  const view = useMemo(() => viewFromParams(params), [params]);
  const update = useCallback(
    (patch: Patch) => setParams((prev) => applyViewPatch(prev, patch), { replace: true }),
    [setParams],
  );
  const clearFilters = useCallback(
    () =>
      update({
        symbol: undefined,
        side: undefined,
        result: undefined,
        strategy: undefined,
        exit: undefined,
        minConf: undefined,
        maxConf: undefined,
        from: undefined,
        to: undefined,
        q: undefined,
      }),
    [update],
  );
  return { view, update, clearFilters };
}
