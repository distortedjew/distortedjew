"""Contract selection (1DTE by default) and a Black-Scholes pricer for paper/backtest fills."""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime

from .bars import ET, RTH_CLOSE, next_trading_day
from .strategy import CALL


@dataclass(frozen=True)
class Contract:
    underlying: str
    expiry: date
    right: str  # CALL / PUT
    strike: float

    @property
    def occ(self) -> str:
        """OCC symbol, e.g. QQQ251003C00600000 (what Alpaca and most brokers use)."""
        cp = "C" if self.right == CALL else "P"
        return f"{self.underlying}{self.expiry:%y%m%d}{cp}{round(self.strike * 1000):08d}"

    def expiry_dt(self) -> datetime:
        return datetime.combine(self.expiry, RTH_CLOSE, ET)

    def __str__(self) -> str:
        return f"{self.underlying} {self.expiry:%m/%d} {self.strike:g}{'C' if self.right == CALL else 'P'}"


def pick_contract(
    underlying: str, spot: float, right: str, on: date, dte: int = 1, otm_steps: int = 0, strike_step: float = 1.0
) -> Contract:
    """dte=1 -> expires the next trading day (the video's "one day to expiration"). dte=0 -> same day.

    otm_steps=0 is the at-the-money strike; positive values move out of the money.
    """
    expiry = next_trading_day(on, dte)
    atm = round(spot / strike_step) * strike_step
    shift = otm_steps * strike_step
    strike = atm + shift if right == CALL else atm - shift
    return Contract(underlying, expiry, right, round(strike, 2))


def _ncdf(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def bs_price(spot: float, strike: float, years: float, iv: float, right: str, rate: float = 0.04) -> float:
    if years <= 0 or iv <= 0:
        return max(spot - strike, 0.0) if right == CALL else max(strike - spot, 0.0)
    sd = iv * math.sqrt(years)
    d1 = (math.log(spot / strike) + (rate + 0.5 * iv * iv) * years) / sd
    d2 = d1 - sd
    if right == CALL:
        return spot * _ncdf(d1) - strike * math.exp(-rate * years) * _ncdf(d2)
    return strike * math.exp(-rate * years) * _ncdf(-d2) - spot * _ncdf(-d1)


def years_to_expiry(now: datetime, contract: Contract) -> float:
    secs = (contract.expiry_dt() - now.astimezone(ET)).total_seconds()
    return max(secs, 60.0) / (365 * 24 * 3600)


@dataclass
class SimPricer:
    """Model price for paper trading and backtests. Not a substitute for real option quotes.

    iv: annualized implied vol per underlying (short-dated index ETF options usually sit around 0.12-0.30).
    spread_pct: full bid/ask width as a fraction of mid; you buy at the ask and sell at the bid.
    min_spread: floor on the width in dollars per share (real books rarely quote tighter than $0.01-0.02).
    """

    iv: dict[str, float]
    default_iv: float = 0.20
    spread_pct: float = 0.03
    min_spread: float = 0.02
    rate: float = 0.04

    def mid(self, c: Contract, spot: float, now: datetime) -> float:
        return bs_price(spot, c.strike, years_to_expiry(now, c), self.iv.get(c.underlying, self.default_iv), c.right, self.rate)

    def bid_ask(self, c: Contract, spot: float, now: datetime) -> tuple[float, float]:
        m = self.mid(c, spot, now)
        half = max(m * self.spread_pct, self.min_spread) / 2
        return max(m - half, 0.0), m + half
