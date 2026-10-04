"""ATLAS - SPY - bull put credit spreads in an uptrend, entered on dips."""
from __future__ import annotations

from ..base import BaseBot
from ..indicators import ema, realized_vol, rsi, sma


class Atlas(BaseBot):
    name = "atlas"
    underlying = "SPY"
    title = "ATLAS"
    tagline = "Carries the market on its shoulders"
    strategy = "Bull put credit spreads on dips in an uptrend"
    color = "#2a78d6"

    take_profit = 0.50       # buy back at half the credit
    stop_loss = 1.00         # or when the spread costs 2x the credit
    exit_dte = 21
    max_open = 3
    min_days_between = 5

    short_delta = 0.20
    width = 5.0
    dte = (30, 50, 40)

    def signal(self, bars, price):
        closes = [b.c for b in bars]
        s200, s50, e10 = sma(closes, 200), sma(closes, 50), ema(closes, 10)
        r14, vol = rsi(closes, 14), realized_vol(closes, 20)
        state = {"close": closes[-1] if closes else None, "sma200": s200, "sma50": s50, "ema10": e10,
                 "rsi14": r14, "rvol20": vol}
        if None in (s200, s50, e10, r14, vol):
            return None, state
        uptrend = closes[-1] > s200 and s50 > s200
        dip = closes[-1] <= e10 or r14 < 45
        calm = vol < 0.35
        state["rule"] = f"uptrend={uptrend} dip={dip} calm={calm}"
        return ("bullish" if uptrend and dip and calm else None), state

    def propose(self, direction, price, bars):
        return self.credit_spread("put", price, self.short_delta, self.width, self.dte, "bullish",
                                  "SPY uptrend dip")
