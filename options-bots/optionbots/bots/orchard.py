"""ORCHARD - AAPL - the wheel: cash-secured puts, then covered calls once assigned."""
from __future__ import annotations

from datetime import date

from ..base import BaseBot
from ..indicators import rsi, sma
from ..models import Leg, Proposal


class Orchard(BaseBot):
    name = "orchard"
    underlying = "AAPL"
    title = "ORCHARD"
    tagline = "Plants puts, harvests premium"
    strategy = "The wheel: cash-secured puts -> covered calls"
    color = "#e87ba4"

    take_profit = 0.50
    stop_loss = 2.00          # CSP only: buy back if the put costs 3x the credit
    exit_dte = 0              # hold to expiry; assignment is part of the plan
    max_open = 1
    min_days_between = 1
    earnings_blackout = True

    put_delta, call_delta = 0.25, 0.30
    dte = (25, 45, 35)

    # -- stock leg ------------------------------------------------------------------
    def shares(self) -> tuple[int, float, float]:
        """(shares, average cost, unrealized P&L) of the stock held at the broker."""
        for p in self.broker.positions():
            if p["symbol"] == self.underlying:
                return int(p["qty"]), p["avg_entry_price"], p["unrealized_pl"]
        return 0, 0.0, 0.0

    def track_stock(self) -> None:
        qty, basis, upl = self.shares()
        prev_qty = self.store.get(self.name, "shares", 0)
        prev_basis = self.store.get(self.name, "basis", 0.0)
        if qty > prev_qty:
            self.event(f"assigned: now hold {qty} {self.underlying} at ${basis:.2f} - switching to covered calls", alert="info")
        elif qty < prev_qty:
            called = prev_qty - qty
            strike = self.store.get(self.name, "cc_strike") or self.broker.last_price(self.underlying)
            pnl = (strike - prev_basis) * called
            pid = self.store.open_position(self.name, self.underlying, "stock", "bullish", [], called,
                                           prev_basis, prev_basis, {"note": "shares called away"})
            self.store.close_position(pid, strike, pnl, "called away")
            self.event(f"{called} shares called away at ${strike:.2f} - stock P&L ${pnl:+,.0f}", alert="win" if pnl >= 0 else "loss")
        self.store.put(self.name, "shares", qty)
        self.store.put(self.name, "basis", basis)
        self.stock = {"shares": qty, "basis": basis, "unrealized": upl}

    def manage(self) -> None:
        self.track_stock()
        super().manage()

    def heartbeat(self, status, extra=None):
        super().heartbeat(status, {**(extra or {}), "stock": getattr(self, "stock", None)})

    # -- signal / proposals -------------------------------------------------------------
    def signal(self, bars, price):
        closes = [b.c for b in bars]
        s200, r = sma(closes, 200), rsi(closes, 14)
        qty, basis, _ = self.shares()
        state = {"close": closes[-1] if closes else None, "sma200": s200, "rsi14": r, "shares": qty}
        if qty >= 100:
            state["phase"] = "covered calls"
            return "cover", state
        state["phase"] = "cash-secured puts"
        if s200 is None or r is None:
            return None, state
        # sell puts on a quality uptrend, preferably after a pullback (fatter premium)
        return ("bullish" if closes[-1] > s200 and r < 65 else None), state

    def propose(self, direction, price, bars):
        if direction == "cover":
            qty, basis, _ = self.shares()
            quotes = [q for q in self.select("call", *self.dte, price=price) if q.strike >= max(basis, price)]
            q = self.nearest_delta(quotes, self.call_delta)
            if not q:
                return None
            return Proposal("covered_call", "neutral", [Leg(q.symbol, "sell")], {q.symbol: q}, 0.0,
                            f"covered call {q.strike:g}c exp {q.expiration} (basis ${basis:.2f}, ~{q.mid:.2f} credit)",
                            {"strike": q.strike, "contracts": qty // 100})
        q = self.nearest_delta(self.select("put", *self.dte, price=price), self.put_delta)
        if not q:
            return None
        return Proposal("csp", "bullish", [Leg(q.symbol, "sell")], {q.symbol: q}, (q.strike - q.mid) * 100,
                        f"cash-secured put {q.strike:g}p exp {q.expiration} (delta {abs(q.delta):.2f}, ~{q.mid:.2f} credit)",
                        {"strike": q.strike})

    def size(self, prop):
        if prop.kind == "covered_call":
            return min(prop.meta["contracts"], self.settings.max_contracts)
        return super().size(prop)

    def open_trade(self, prop, qty):
        super().open_trade(prop, qty)
        if prop.kind == "covered_call":
            self.store.put(self.name, "cc_strike", prop.meta["strike"])

    def exit_reason(self, pos, value, today: date, bars, price):
        change = (value - pos["entry_price"]) / abs(pos["entry_price"])
        if change >= self.take_profit:
            return f"take profit ({change:+.0%})"
        if pos["kind"] == "csp" and self.stop_loss and change <= -self.stop_loss:   # 0 = no stop
            return f"stop loss ({change:+.0%})"
        return None
