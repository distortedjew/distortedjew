"""VOLT - NVDA - volume-confirmed 20-day breakouts traded with debit spreads."""
from __future__ import annotations

from ..base import BaseBot
from ..indicators import sma


class Volt(BaseBot):
    name = "volt"
    underlying = "NVDA"
    title = "VOLT"
    tagline = "Strikes when the breakout charges up"
    strategy = "Breakout debit spreads with volume confirmation"
    color = "#eda100"

    take_profit = 1.00       # +100% on the debit
    stop_loss = 0.50
    exit_dte = 10
    max_open = 2
    min_days_between = 5
    earnings_blackout = True

    long_delta, short_delta = 0.55, 0.25
    dte = (30, 60, 45)
    lookback = 20

    def signal(self, bars, price):
        if len(bars) < 60:
            return None, {}
        prior = bars[-self.lookback - 1:-1]
        last = bars[-1]
        hi, lo = max(b.h for b in prior), min(b.l for b in prior)
        avg_vol = sum(b.v for b in prior) / len(prior)
        s50 = sma([b.c for b in bars], 50)
        surge = last.v > 1.5 * avg_vol
        state = {"close": last.c, "high20": hi, "low20": lo, "sma50": s50,
                 "volume_x": round(last.v / avg_vol, 2) if avg_vol else None}
        if last.c > hi and surge and last.c > s50:
            return "bullish", state
        if last.c < lo and surge and last.c < s50:
            return "bearish", state
        return None, state

    def propose(self, direction, price, bars):
        kind = "call" if direction == "bullish" else "put"
        return self.debit_spread(kind, price, self.long_delta, self.short_delta, self.dte, direction,
                                 f"NVDA {direction} 20-day breakout on volume")

    def extra_exit(self, pos, bars, price):
        if len(bars) < 11:
            return None
        recent = bars[-10:]
        if pos["direction"] == "bullish" and price < min(b.l for b in recent):
            return "trend failed (below 10-day low)"
        if pos["direction"] == "bearish" and price > max(b.h for b in recent):
            return "trend failed (above 10-day high)"
        return None
