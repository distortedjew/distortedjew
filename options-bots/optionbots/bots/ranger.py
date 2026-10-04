"""RANGER - IWM - iron condors when small caps are stuck in a range."""
from __future__ import annotations

from ..base import BaseBot
from ..indicators import adx, bollinger, realized_vol
from ..models import Leg, Proposal


class Ranger(BaseBot):
    name = "ranger"
    underlying = "IWM"
    title = "RANGER"
    tagline = "Patrols the range and collects the toll"
    strategy = "Iron condors in trendless markets"
    color = "#1baf7a"

    take_profit = 0.50
    stop_loss = 1.00
    exit_dte = 21
    max_open = 2
    min_days_between = 7

    short_delta = 0.16
    width = 5.0
    dte = (30, 50, 45)

    def signal(self, bars, price):
        h, l, c = [b.h for b in bars], [b.l for b in bars], [b.c for b in bars]
        a, bb, vol = adx(h, l, c, 14), bollinger(c, 20, 2.0), realized_vol(c, 20)
        state = {"close": c[-1] if c else None, "adx14": a, "bb_low": bb and bb[0], "bb_high": bb and bb[2],
                 "rvol20": vol}
        if None in (a, bb, vol):
            return None, state
        rangebound = a < 20 and bb[0] < c[-1] < bb[2] and vol < 0.30
        state["rule"] = f"adx<20={a < 20} inside_bands={bb[0] < c[-1] < bb[2]} rvol<30%={vol < 0.30}"
        return ("neutral" if rangebound else None), state

    def propose(self, direction, price, bars):
        puts = self.select("put", *self.dte, price=price)
        calls = self.select("call", *self.dte, price=price)
        if not puts or not calls:
            return None
        ps = self.nearest_delta(puts, self.short_delta)
        cs = self.nearest_delta([c for c in calls if c.expiration == ps.expiration], self.short_delta) if ps else None
        pl = ps and self.wing(puts, ps, self.width)
        cl = cs and self.wing(calls, cs, self.width)
        if not (ps and cs and pl and cl):
            return None
        credit = ps.mid - pl.mid + cs.mid - cl.mid
        w = max(ps.strike - pl.strike, cl.strike - cs.strike)
        if credit <= 0.10 or credit >= w:
            return None
        legs = [Leg(ps.symbol, "sell"), Leg(pl.symbol, "buy"), Leg(cs.symbol, "sell"), Leg(cl.symbol, "buy")]
        return Proposal("iron_condor", "neutral", legs, {q.symbol: q for q in (ps, pl, cs, cl)}, (w - credit) * 100,
                        f"IWM range-bound; condor {pl.strike:g}/{ps.strike:g}p - {cs.strike:g}/{cl.strike:g}c "
                        f"exp {ps.expiration} (~{credit:.2f} credit)",
                        {"put_short": ps.strike, "call_short": cs.strike, "width": w})

    def extra_exit(self, pos, bars, price):
        m = pos["meta"]
        if "put_short" in m and (price < m["put_short"] or price > m["call_short"]):
            return f"trend breach: IWM {price:.2f} outside short strikes"
        return None
