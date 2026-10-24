import type { PairSnapshot, SecurityReport } from "./types.ts";

const DEX = "https://api.dexscreener.com";
const RUGCHECK = "https://api.rugcheck.xyz";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

interface DexPair {
  chainId: string;
  pairAddress: string;
  baseToken: { address: string; symbol: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { m5?: number };
  txns?: { m5?: { buys: number; sells: number } };
  priceChange?: { m5?: number };
  pairCreatedAt?: number;
}

/** Latest token profiles on Solana (DexScreener), newest first. */
export async function fetchNewSolanaMints(): Promise<string[]> {
  const profiles = await getJson<{ chainId: string; tokenAddress: string }[]>(
    `${DEX}/token-profiles/latest/v1`,
  );
  return profiles.filter((p) => p.chainId === "solana").map((p) => p.tokenAddress);
}

/** Best (highest-liquidity) pair snapshot per mint. Max 30 mints per request. */
export async function fetchPairs(mints: string[], now = Date.now()): Promise<PairSnapshot[]> {
  const out: PairSnapshot[] = [];
  for (let i = 0; i < mints.length; i += 30) {
    const chunk = mints.slice(i, i + 30);
    const pairs = await getJson<DexPair[]>(`${DEX}/tokens/v1/solana/${chunk.join(",")}`);
    const best = new Map<string, DexPair>();
    for (const p of pairs) {
      const cur = best.get(p.baseToken.address);
      if (!cur || (p.liquidity?.usd ?? 0) > (cur.liquidity?.usd ?? 0))
        best.set(p.baseToken.address, p);
    }
    for (const p of best.values()) {
      const price = Number(p.priceUsd);
      if (!Number.isFinite(price) || price <= 0) continue;
      out.push({
        mint: p.baseToken.address,
        symbol: p.baseToken.symbol,
        pairAddress: p.pairAddress,
        priceUsd: price,
        liquidityUsd: p.liquidity?.usd ?? 0,
        volume5mUsd: p.volume?.m5 ?? 0,
        buys5m: p.txns?.m5?.buys ?? 0,
        sells5m: p.txns?.m5?.sells ?? 0,
        priceChange5m: p.priceChange?.m5 ?? 0,
        ageSec: p.pairCreatedAt ? Math.max(0, (now - p.pairCreatedAt) / 1000) : Infinity,
      });
    }
  }
  return out;
}

interface RugReport {
  mintAuthority: string | null;
  freezeAuthority: string | null;
  topHolders?: { pct: number; insider?: boolean }[];
  markets?: { lp?: { lpLockedPct?: number } }[];
  risks?: { name: string; level: string }[];
}

/**
 * RugCheck full report mapped to our model. Missing data is treated as unsafe
 * (fails closed): unknown holders -> 100%, unknown LP lock -> 0%.
 */
export async function fetchSecurity(mint: string): Promise<SecurityReport> {
  const r = await getJson<RugReport>(`${RUGCHECK}/v1/tokens/${mint}/report`);
  const holders = r.topHolders?.slice(0, 10) ?? [];
  const top10 = holders.length ? holders.reduce((s, h) => s + h.pct, 0) : 100;
  const lock = Math.max(0, ...(r.markets ?? []).map((m) => m.lp?.lpLockedPct ?? 0));
  return {
    mintAuthorityRevoked: r.mintAuthority === null,
    freezeAuthorityRevoked: r.freezeAuthority === null,
    top10HolderPct: top10,
    lpLockedPct: lock,
    dangerFlags: (r.risks ?? []).filter((x) => x.level === "danger").map((x) => x.name),
  };
}
