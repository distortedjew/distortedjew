import type { Config } from "./config.ts";
import type { PairSnapshot, SecurityReport } from "./types.ts";

export type Verdict = { ok: true } | { ok: false; reason: string };

/** Pure entry gate: every check must pass. Returns the first failing reason. */
export function evaluateEntry(
  pair: PairSnapshot,
  sec: SecurityReport,
  cfg: Config,
): Verdict {
  if (pair.ageSec > cfg.maxPairAgeSec) return no(`pair too old (${pair.ageSec}s)`);
  if (pair.liquidityUsd < cfg.minLiquidityUsd) return no("low liquidity");
  if (pair.volume5mUsd < cfg.minVolume5mUsd) return no("low 5m volume");
  const ratio = pair.buys5m / Math.max(pair.sells5m, 1);
  if (ratio < cfg.minBuySellRatio) return no(`buy/sell ratio ${ratio.toFixed(2)}`);
  if (!sec.mintAuthorityRevoked) return no("mint authority active");
  if (!sec.freezeAuthorityRevoked) return no("freeze authority active");
  if (sec.top10HolderPct > cfg.maxTop10HolderPct)
    return no(`top10 holders ${sec.top10HolderPct}%`);
  if (sec.lpLockedPct < cfg.minLpLockedPct)
    return no(`LP locked only ${sec.lpLockedPct}%`);
  if (sec.dangerFlags.length > 0) return no(`flags: ${sec.dangerFlags.join(", ")}`);
  return { ok: true };
}

const no = (reason: string): Verdict => ({ ok: false, reason });
