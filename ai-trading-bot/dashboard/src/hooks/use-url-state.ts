import { useCallback } from "react";
import { useSearchParams } from "react-router";

/**
 * A string value kept in the URL query (`?symbol=ETH%2FUSDT&tf=15m`) so views are linkable and
 * survive a refresh. The default is not written to the URL. Updates replace the history entry.
 *
 *   const [symbol, setSymbol] = useUrlState("symbol", primarySymbol ?? "BTC/USDT");
 *   const [tf, setTf] = useUrlState("tf", "5m", TIMEFRAMES);   // unknown values fall back to "5m"
 */
export function useUrlState<T extends string>(
  key: string,
  defaultValue: T,
  allowed?: readonly T[],
): [T, (next: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const value =
    raw !== null && raw !== "" && (!allowed || allowed.includes(raw as T)) ? (raw as T) : defaultValue;

  const setValue = useCallback(
    (next: T) => {
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          if (next === defaultValue || next === "") out.delete(key);
          else out.set(key, next);
          return out;
        },
        { replace: true },
      );
    },
    [key, defaultValue, setParams],
  );

  return [value, setValue];
}

/** A numeric value in the URL query (pagination offsets, thresholds). */
export function useUrlNumber(key: string, defaultValue: number): [number, (next: number) => void] {
  const [params, setParams] = useSearchParams();
  const parsed = Number(params.get(key));
  const value = params.has(key) && Number.isFinite(parsed) ? parsed : defaultValue;

  const setValue = useCallback(
    (next: number) => {
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          if (next === defaultValue || !Number.isFinite(next)) out.delete(key);
          else out.set(key, String(next));
          return out;
        },
        { replace: true },
      );
    },
    [key, defaultValue, setParams],
  );

  return [value, setValue];
}
