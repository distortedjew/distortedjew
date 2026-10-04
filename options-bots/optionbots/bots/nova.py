"""NOVA - QQQ - trend-following debit spreads (calls in uptrends, puts in downtrends)."""
from __future__ import annotations

from ..base import BaseBot
from ..indicators import ema, macd_hist, rsi


class Nova(BaseBot):
    name = "nova"
    underlying = "QQQ"
    title = "NOVA"
    tagline = "Rides tech momentum when it ignites"
    strategy = "Trend-following call/put debit spreads"
    color = "#eb6834"

    take_profit = 0.80       # +80% on the debit
    stop_loss = 0.50         # -50% on the debit
    exit_dte = 7
    max_open = 2
    min_days_between = 3

    allow_bearish = 1        # 0 = only take bullish (call) spreads
    long_delta, short_delta = 0.60, 0.30
    dte = (21, 45, 30)

    def _trend(self, closes):
        return ema(closes, 20), ema(closes, 50)

    def signal(self, bars, price):
        closes = [b.c for b in bars]
        e20, e50 = self._trend(closes)
        hist, r = macd_hist(closes), rsi(closes, 14)
        state = {"close": closes[-1] if closes else None, "ema20": e20, "ema50": e50,
                 "macd_hist": hist[-1] if hist else None, "rsi14": r}
        if None in (e20, e50, r) or len(hist) < 2:
            return None, state
        c = closes[-1]
        if e20 > e50 and c > e20 and hist[-1] > 0 and hist[-1] > hist[-2] and 50 <= r <= 70:
            return "bullish", state
        if self.allow_bearish and e20 < e50 and c < e20 and hist[-1] < 0 and hist[-1] < hist[-2] and 30 <= r <= 50:
            return "bearish", state
        return None, state

    def propose(self, direction, price, bars):
        kind = "call" if direction == "bullish" else "put"
        return self.debit_spread(kind, price, self.long_delta, self.short_delta, self.dte, direction,
                                 f"QQQ {direction} trend + MACD momentum")

    def extra_exit(self, pos, bars, price):
        e20, e50 = self._trend([b.c for b in bars])
        if e20 is None or e50 is None:
            return None
        if pos["direction"] == "bullish" and e20 < e50:
            return "trend flipped bearish"
        if pos["direction"] == "bearish" and e20 > e50:
            return "trend flipped bullish"
        return None
