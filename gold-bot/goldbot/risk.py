"""Position sizing: risk a fixed fraction of equity per trade, never more."""
from __future__ import annotations

import math


def position_units(equity: float, risk_frac: float, sl_dist: float, price: float,
                   max_leverage: float) -> float:
    """Ounces of gold so that hitting the stop loses ~risk_frac of equity.

    For XAUUSD a $1 move on 1 ounce is $1 of P&L. Capped so notional <= equity * max_leverage.
    """
    if equity <= 0 or sl_dist <= 0 or price <= 0:
        return 0.0
    units = equity * risk_frac / sl_dist
    return min(units, equity * max_leverage / price)


def round_down(x: float, step: float) -> float:
    if step <= 0:
        return x
    return math.floor(x / step + 1e-9) * step
