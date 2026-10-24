export interface PairSnapshot {
  mint: string;
  symbol: string;
  pairAddress: string;
  priceUsd: number;
  liquidityUsd: number;
  volume5mUsd: number;
  buys5m: number;
  sells5m: number;
  priceChange5m: number;
  /** Pair age in seconds at observation time. */
  ageSec: number;
}

export interface SecurityReport {
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;
  /** Share (0-100) of supply held by the top 10 holders, LP excluded when known. */
  top10HolderPct: number;
  /** Share (0-100) of liquidity that is locked or burned. */
  lpLockedPct: number;
  /** RugCheck-style risk flags, e.g. "Copycat token". */
  dangerFlags: string[];
}

export interface Position {
  mint: string;
  symbol: string;
  entryPrice: number;
  entryTime: number;
  sizeUsd: number;
  tokens: number;
  peakPrice: number;
  /** Take-profit rungs already sold, by index. */
  tpHit: boolean[];
  remainingFraction: number;
}

export interface ClosedTrade {
  mint: string;
  symbol: string;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  pnlUsd: number;
  reason: string;
}
