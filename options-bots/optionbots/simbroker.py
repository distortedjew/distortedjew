"""Offline simulator: synthetic prices and Black-Scholes option chains.

Lets you run all five bots and the dashboard with no API keys (BROKER=sim). It
tests the plumbing only; its fills are optimistic and its prices are random.
"""
from __future__ import annotations

import math
import random
import threading
import time
import uuid
from datetime import date, datetime, timedelta

from . import blackscholes as bs
from .models import Bar, Leg, OptionQuote, parse_occ, occ_symbol

PROFILE = {  # start price, annual drift, annual vol
    "SPY": (560.0, 0.08, 0.15), "QQQ": (480.0, 0.10, 0.20), "IWM": (220.0, 0.05, 0.22),
    "AAPL": (230.0, 0.10, 0.26), "NVDA": (125.0, 0.25, 0.50),
}


class SimBroker:
    def __init__(self, seed: int = 7, speed: float = 60.0, equity: float = 100_000.0):
        self.rng = random.Random(seed)
        self.speed = speed                     # simulated minutes per real second
        self.cash = equity
        self.start_equity = equity
        self.lock = threading.Lock()
        self.hist: dict[str, list[Bar]] = {}
        self.spot: dict[str, float] = {}
        self.last_tick = time.time()
        self.pos: dict[str, dict] = {}         # symbol -> {qty, avg}
        self.orders: dict[str, dict] = {}
        today = date.today()
        for sym, (p0, mu, vol) in PROFILE.items():
            bars, p, d = [], p0 * 0.75, today - timedelta(days=460)
            while d < today:
                if d.weekday() < 5:
                    r = self.rng.gauss((mu - vol * vol / 2) / 252, vol / math.sqrt(252))
                    o, c = p, p * math.exp(r)
                    hi = max(o, c) * (1 + abs(self.rng.gauss(0, vol / 40)))
                    lo = min(o, c) * (1 - abs(self.rng.gauss(0, vol / 40)))
                    bars.append(Bar(d, o, hi, lo, c, self.rng.uniform(0.6, 1.6) * 1e7))
                    p = c
                d += timedelta(days=1)
            self.hist[sym], self.spot[sym] = bars, p

    def _tick(self) -> None:
        now = time.time()
        minutes = (now - self.last_tick) * self.speed
        self.last_tick = now
        for sym, (_, mu, vol) in PROFILE.items():
            dt = minutes / (252 * 390)
            self.spot[sym] *= math.exp(self.rng.gauss((mu - vol * vol / 2) * dt, vol * math.sqrt(dt)))

    def _vol(self, sym: str, strike: float) -> float:
        vol = PROFILE[sym][2]
        return vol * (1 + 0.25 * max(0.0, (self.spot[sym] - strike) / self.spot[sym]) * 4)  # put skew

    def _quote(self, symbol: str) -> OptionQuote:
        root, exp, kind, strike = parse_occ(symbol)
        t = max((exp - date.today()).days, 0) / 365 + 1 / 365
        vol = self._vol(root, strike)
        fair = bs.price(kind, self.spot[root], strike, t, vol)
        half = max(0.01, fair * 0.02)
        return OptionQuote(symbol, kind, strike, exp, round(max(0.01, fair - half), 2), round(fair + half, 2),
                           bs.delta(kind, self.spot[root], strike, t, vol), vol)

    # -- Broker protocol ----------------------------------------------------
    def clock(self) -> dict:
        return {"is_open": True, "timestamp": datetime.now().isoformat()}

    def account(self) -> dict:
        with self.lock:
            self._tick()
            value = 0.0
            for sym, p in self.pos.items():
                px = self.spot[sym] if sym in self.spot else self._quote(sym).mid
                value += p["qty"] * px * (1 if sym in self.spot else 100)
            eq = self.cash + value
            return {"equity": eq, "last_equity": self.start_equity, "buying_power": self.cash,
                    "cash": self.cash, "options_buying_power": self.cash}

    def daily_bars(self, symbol: str, days: int = 450) -> list[Bar]:
        return list(self.hist[symbol])

    def last_price(self, symbol: str) -> float:
        with self.lock:
            self._tick()
            return self.spot[symbol]

    def option_chain(self, underlying: str, kind: str, exp_from: date, exp_to: date) -> list[OptionQuote]:
        with self.lock:
            self._tick()
            s = self.spot[underlying]
            step = 1.0 if s < 300 else 5.0
            out = []
            d = exp_from
            while d <= exp_to:
                if d.weekday() == 4:
                    k = math.floor(s * 0.7 / step) * step
                    while k <= s * 1.3:
                        out.append(self._quote(occ_symbol(underlying, d, kind, k)))
                        k += step
                d += timedelta(days=1)
            return out

    def option_quotes(self, symbols: list[str]) -> dict[str, tuple[float, float]]:
        with self.lock:
            self._tick()
            return {s: (self._quote(s).bid, self._quote(s).ask) for s in symbols}

    def positions(self) -> list[dict]:
        with self.lock:
            out = []
            for sym, p in self.pos.items():
                stock = sym in self.spot
                px = self.spot[sym] if stock else self._quote(sym).mid
                mult = 1 if stock else 100
                out.append({"symbol": sym, "qty": p["qty"], "asset_class": "us_equity" if stock else "us_option",
                            "avg_entry_price": p["avg"], "current_price": px,
                            "unrealized_pl": (px - p["avg"]) * p["qty"] * mult})
            return out

    def submit(self, legs: list[Leg], qty: int, limit_price: float, client_order_id: str, closing: bool) -> str:
        with self.lock:
            quotes = {l.symbol: self._quote(l.symbol) for l in legs}
            mid = sum((1 if l.side == "buy" else -1) * quotes[l.symbol].mid * l.ratio for l in legs)
            oid = uuid.uuid4().hex
            filled = limit_price >= mid - 1e-9          # a debit limit at/above mid (or credit at/below) fills
            if filled:
                for l in legs:
                    q = quotes[l.symbol].mid
                    n = qty * l.ratio * (1 if l.side == "buy" else -1)
                    p = self.pos.setdefault(l.symbol, {"qty": 0, "avg": q})
                    if p["qty"] == 0 or (p["qty"] > 0) == (n > 0):
                        p["avg"] = (p["avg"] * abs(p["qty"]) + q * abs(n)) / (abs(p["qty"]) + abs(n))
                    p["qty"] += n
                    self.cash -= n * q * 100
                    if p["qty"] == 0:
                        del self.pos[l.symbol]
            self.orders[oid] = {"status": "filled" if filled else "new", "filled_qty": qty if filled else 0,
                                "filled_avg_price": abs(mid) if filled else None}
            return oid

    def order(self, order_id: str) -> dict:
        return dict(self.orders[order_id])

    def cancel(self, order_id: str) -> None:
        if self.orders[order_id]["status"] == "new":
            self.orders[order_id]["status"] = "canceled"
