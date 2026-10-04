"""Works a (multi-leg) limit order from the mid price toward the natural price."""
from __future__ import annotations

import math
import time
import uuid

from .broker import Broker
from .models import Leg, OrderResult


def net_prices(legs: list[Leg], quotes: dict[str, tuple[float, float]]) -> tuple[float, float]:
    """(mid, natural) net price per unit for this order; debit > 0, credit < 0."""
    mid = natural = 0.0
    for leg in legs:
        bid, ask = quotes[leg.symbol]
        sign = 1 if leg.side == "buy" else -1
        mid += sign * leg.ratio * (bid + ask) / 2
        natural += leg.ratio * (ask if leg.side == "buy" else -bid)
    return mid, natural


def reversed_legs(legs: list[Leg]) -> list[Leg]:
    return [Leg(l.symbol, "sell" if l.side == "buy" else "buy", l.ratio) for l in legs]


def work_order(broker: Broker, bot: str, legs: list[Leg], qty: int, closing: bool,
               steps: tuple[float, ...] = (0.0, 0.25, 0.5), wait_sec: int = 45,
               sleep=time.sleep) -> OrderResult:
    """Try each step (fraction of the way from mid to natural); cancel and reprice if unfilled."""
    done = 0
    cost = 0.0          # sum of fill price * qty, for an average across partial fills
    last_price = 0.0
    for frac in steps:
        quotes = broker.option_quotes([l.symbol for l in legs])
        if any(quotes.get(l.symbol, (0, 0))[1] <= 0 for l in legs):
            return OrderResult("unfilled", done, last_price, message="no quote for a leg")
        mid, natural = net_prices(legs, quotes)
        raw = mid + frac * (natural - mid)
        # round toward the natural price, so each step really moves (penny-wide quotes would otherwise stay at mid)
        price = (math.ceil(raw * 100 - 1e-6) if natural >= mid else math.floor(raw * 100 + 1e-6)) / 100
        if len(legs) == 1 and abs(price) < 0.01:
            price = math.copysign(0.01, natural or 1)
        last_price = price
        coid = f"{bot}-{'c' if closing else 'o'}-{uuid.uuid4().hex[:12]}"
        try:
            oid = broker.submit(legs, qty - done, price, coid, closing)
        except RuntimeError as e:
            return OrderResult("rejected", done, price, message=str(e))
        waited, info = 0, broker.order(oid)
        while info["status"] not in ("filled", "canceled", "rejected", "expired") and waited < wait_sec:
            sleep(5)
            waited += 5
            info = broker.order(oid)
        if info["status"] != "filled":
            broker.cancel(oid)
            info = broker.order(oid)
        filled = int(info["filled_qty"])
        if filled:
            fap = info.get("filled_avg_price")
            fill_price = math.copysign(abs(fap), price) if fap is not None and price else price
            done += filled
            cost += fill_price * filled
        avg = round(cost / done, 4) if done else last_price
        if done >= qty:
            return OrderResult("filled", done, avg, oid)
        if info["status"] == "rejected":
            return OrderResult("rejected", done, avg, oid, "rejected by broker")
    return OrderResult("partial" if done else "unfilled", done, round(cost / done, 4) if done else last_price)
