"""Trade levels shared by every analyst: entry, stop, target and the invalidation line.

Cost realism drives the stop: a round trip costs ``2 × (fee_bps + slippage_bps)`` (0.14 % at
the defaults), so a stop of a few basis points would turn every trade into a near-certain
loss after costs. The stop distance is therefore the largest of

- 1.5 × ATR of the decision timeframe,
- for intraday decisions (below 1h), 1.5 × ATR of the 1h timeframe: the trade's thesis is a
  higher-timeframe trend and the decision bar only times the entry, so the stop must sit outside
  an hour of ordinary noise,
- 4.5 × the round-trip cost (≈ 0.63 % at the defaults),

moved beyond the nearest swing (lowest low / highest high of the last 12 decision bars, plus
a 0.2 ATR buffer) when that swing is no more than twice as far, and capped at 8 % of price.
Wider stops also keep the cost per unit of risk low: at a 0.65 % stop a round trip costs about
0.25 R, at 1.3 % about 0.12 R. The target is a multiple of that distance chosen by the setup
(or by the regime when no setup applies): trends and breakouts aim further, ranges take
profits sooner.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from ..market.symbols import fmt_price, round_to_tick, tick_size
from ..schemas import TIMEFRAME_SECONDS, Regime, Side
from .base import MarketContext

STOP_ATR_MULT = 1.5
# Intraday decisions keep their stop outside one hour of normal noise: the trade's thesis is the
# higher-timeframe trend, the decision bar only times the entry.
NOISE_TIMEFRAME = "1h"
NOISE_SECONDS = 3600
COST_FLOOR_MULT = 4.5
SWING_BUFFER_ATR = 0.2
MAX_SWING_STRETCH = 2.0
MAX_STOP_PCT = 8.0

R_BY_REGIME: dict[Regime, float] = {
    "TRENDING_BULLISH": 2.5,
    "TRENDING_BEARISH": 2.5,
    "BREAKOUT": 3.0,
    "HIGH_VOLATILITY": 2.0,
    "LOW_VOLATILITY": 1.8,
    "RANGING": 1.6,
    "UNKNOWN": 2.0,
}


@dataclass(frozen=True, slots=True)
class TradePlan:
    side: Side
    entry: float
    stop_loss: float
    take_profit: float
    stop_distance: float
    r_multiple: float
    basis: str  # what set the stop distance, for reasons / prompts

    @property
    def stop_pct(self) -> float:
        return self.stop_distance / self.entry * 100.0

    @property
    def risk_reward(self) -> float:
        return round(abs(self.take_profit - self.entry) / abs(self.entry - self.stop_loss), 2)


def min_stop_distance(ctx: MarketContext) -> tuple[float, str]:
    """(distance, basis) of the tightest stop the system accepts for this context."""
    price = ctx.price
    candidates: list[tuple[float, str]] = []
    f = ctx.decision
    if f.atr:
        candidates.append((STOP_ATR_MULT * f.atr, f"1.5 × ATR({ctx.timeframe})"))
    dec_sec = TIMEFRAME_SECONDS[ctx.timeframe]
    if dec_sec < NOISE_SECONDS:
        noise = ctx.features.get(NOISE_TIMEFRAME)
        if noise is not None and noise.atr:
            candidates.append((STOP_ATR_MULT * noise.atr, f"1.5 × ATR({NOISE_TIMEFRAME})"))
        elif f.atr:
            scaled = STOP_ATR_MULT * f.atr * math.sqrt(NOISE_SECONDS / dec_sec)
            candidates.append((scaled, f"1.5 × ATR({NOISE_TIMEFRAME}, scaled)"))
    floor = price * COST_FLOOR_MULT * ctx.round_trip_cost_pct / 100.0
    candidates.append((floor, "4.5 × round-trip cost"))
    return max(candidates, key=lambda c: c[0])


def min_stop_pct(ctx: MarketContext) -> float:
    return min_stop_distance(ctx)[0] / ctx.price * 100.0


def plan(ctx: MarketContext, side: Side, r_multiple: float | None = None) -> TradePlan:
    """ATR / cost-floor stop (beyond the swing when reasonable) and an R-multiple target."""
    price = ctx.price
    dist, basis = min_stop_distance(ctx)
    f = ctx.decision
    buffer = SWING_BUFFER_ATR * (f.atr or 0.0)
    swing = f.swing_low if side == "LONG" else f.swing_high
    if swing is not None:
        swing_dist = (price - (swing - buffer)) if side == "LONG" else ((swing + buffer) - price)
        if dist < swing_dist <= MAX_SWING_STRETCH * dist:
            dist = swing_dist
            basis = "beyond the swing low" if side == "LONG" else "beyond the swing high"
    dist = min(dist, price * MAX_STOP_PCT / 100.0)
    r = r_multiple if r_multiple is not None else R_BY_REGIME.get(ctx.regime.regime, 2.0)
    tick = tick_size(price)
    if side == "LONG":
        stop = round_to_tick(price - dist, tick)
        target = round_to_tick(price + r * dist, tick)
    else:
        stop = round_to_tick(price + dist, tick)
        target = round_to_tick(price - r * dist, tick)
    return TradePlan(side, price, stop, target, abs(price - stop), r, basis)


def levels_valid(side: Side, entry: float | None, stop: float | None, target: float | None) -> bool:
    """Stop and target on the correct sides of the entry."""
    if entry is None or stop is None or target is None:
        return False
    if not all(math.isfinite(v) and v > 0 for v in (entry, stop, target)):
        return False
    if side == "LONG":
        return stop < entry < target
    return target < entry < stop


def invalidation(ctx: MarketContext, side: Side, stop: float) -> str:
    """The price condition that proves the idea wrong, e.g. ``Close below $96,240 (EMA 50)``."""
    f = ctx.decision
    price = ctx.price
    candidates: list[tuple[str, float | None]] = [
        ("EMA 50", f.ema50),
        ("swing low" if side == "LONG" else "swing high", f.swing_low if side == "LONG" else f.swing_high),
        ("VWAP", f.vwap),
        ("EMA 21", f.ema21),
    ]
    for name, level in candidates:
        if level is None:
            continue
        if (side == "LONG" and stop < level < price) or (side == "SHORT" and price < level < stop):
            word = "below" if side == "LONG" else "above"
            return f"Close {word} {fmt_price(level, compact=True)} ({name})"
    word = "below" if side == "LONG" else "above"
    return f"Close {word} {fmt_price(stop, compact=True)} (stop level)"
