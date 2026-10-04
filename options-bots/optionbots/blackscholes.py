"""Black-Scholes price/delta and implied-vol solve, used when a quote has no greeks."""
from __future__ import annotations

import math

RATE = 0.04


def _cdf(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def _d1_d2(s: float, k: float, t: float, vol: float, r: float) -> tuple[float, float]:
    d1 = (math.log(s / k) + (r + 0.5 * vol * vol) * t) / (vol * math.sqrt(t))
    return d1, d1 - vol * math.sqrt(t)


def price(kind: str, s: float, k: float, t: float, vol: float, r: float = RATE) -> float:
    if t <= 0 or vol <= 0:
        return max(0.0, s - k) if kind == "call" else max(0.0, k - s)
    d1, d2 = _d1_d2(s, k, t, vol, r)
    if kind == "call":
        return s * _cdf(d1) - k * math.exp(-r * t) * _cdf(d2)
    return k * math.exp(-r * t) * _cdf(-d2) - s * _cdf(-d1)


def delta(kind: str, s: float, k: float, t: float, vol: float, r: float = RATE) -> float:
    if t <= 0 or vol <= 0:
        itm = s > k if kind == "call" else s < k
        return (1.0 if kind == "call" else -1.0) if itm else 0.0
    d1, _ = _d1_d2(s, k, t, vol, r)
    return _cdf(d1) if kind == "call" else _cdf(d1) - 1


def implied_vol(kind: str, target: float, s: float, k: float, t: float, r: float = RATE) -> float | None:
    if t <= 0 or target <= 0:
        return None
    lo, hi = 0.01, 5.0
    if not (price(kind, s, k, t, lo, r) <= target <= price(kind, s, k, t, hi, r)):
        return None
    for _ in range(60):
        mid = (lo + hi) / 2
        if price(kind, s, k, t, mid, r) < target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2
