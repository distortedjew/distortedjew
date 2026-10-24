import type { Config } from "./config.ts";
import type { ClosedTrade, Position } from "./types.ts";
import { decideExit } from "./strategy.ts";

/** Simulated wallet. Fills are penalised with slippage and a flat fee. */
export class PaperPortfolio {
  balanceUsd: number;
  positions = new Map<string, Position>();
  closed: ClosedTrade[] = [];
  private realizedToday = 0;
  private dayKey = "";

  private cfg: Config;

  constructor(cfg: Config) {
    this.cfg = cfg;
    this.balanceUsd = cfg.startingBalanceUsd;
  }

  private rollDay(now: number) {
    const key = new Date(now).toISOString().slice(0, 10);
    if (key !== this.dayKey) {
      this.dayKey = key;
      this.realizedToday = 0;
    }
  }

  canOpen(mint: string, now: number): boolean {
    this.rollDay(now);
    return (
      !this.positions.has(mint) &&
      this.positions.size < this.cfg.maxOpenPositions &&
      this.balanceUsd >= this.cfg.positionSizeUsd + this.cfg.feeUsd &&
      this.realizedToday > -this.cfg.dailyLossLimitUsd
    );
  }

  open(mint: string, symbol: string, price: number, now: number): Position | null {
    if (!this.canOpen(mint, now)) return null;
    const fill = price * (1 + this.cfg.slippageBps / 10_000);
    const sizeUsd = this.cfg.positionSizeUsd;
    this.balanceUsd -= sizeUsd + this.cfg.feeUsd;
    const pos: Position = {
      mint,
      symbol,
      entryPrice: fill,
      entryTime: now,
      sizeUsd,
      tokens: sizeUsd / fill,
      peakPrice: fill,
      tpHit: this.cfg.takeProfits.map(() => false),
      remainingFraction: 1,
    };
    this.positions.set(mint, pos);
    return pos;
  }

  /** Feed a new price; applies exit rules and returns trades closed/partially sold. */
  onPrice(mint: string, price: number, now: number): ClosedTrade[] {
    const pos = this.positions.get(mint);
    if (!pos) return [];
    this.rollDay(now);
    pos.peakPrice = Math.max(pos.peakPrice, price);
    const out: ClosedTrade[] = [];
    // A single tick may trigger several rungs; loop until hold.
    for (let guard = 0; guard < 8; guard++) {
      const d = decideExit(pos, price, now, this.cfg);
      if (d.action === "hold") break;
      const fill = price * (1 - this.cfg.slippageBps / 10_000);
      const tokensSold = pos.tokens * d.fraction;
      const proceeds = tokensSold * fill - this.cfg.feeUsd;
      const cost = pos.sizeUsd * d.fraction;
      const pnl = proceeds - cost;
      this.balanceUsd += proceeds;
      this.realizedToday += pnl;
      pos.remainingFraction -= d.fraction;
      if (d.tpIndex !== undefined) pos.tpHit[d.tpIndex] = true;
      const trade: ClosedTrade = {
        mint,
        symbol: pos.symbol,
        entryTime: pos.entryTime,
        exitTime: now,
        entryPrice: pos.entryPrice,
        exitPrice: fill,
        pnlUsd: pnl,
        reason: d.reason,
      };
      this.closed.push(trade);
      out.push(trade);
      if (pos.remainingFraction <= 1e-9) {
        this.positions.delete(mint);
        break;
      }
    }
    return out;
  }

  equity(prices: Map<string, number>): number {
    let eq = this.balanceUsd;
    for (const p of this.positions.values()) {
      const px = prices.get(p.mint) ?? p.entryPrice;
      eq += p.tokens * p.remainingFraction * px;
    }
    return eq;
  }

  get totalPnlUsd(): number {
    return this.closed.reduce((s, t) => s + t.pnlUsd, 0);
  }
}
