"""Plain-Python technical indicators over lists of floats (oldest first)."""
from __future__ import annotations

import math


def sma(values: list[float], n: int) -> float | None:
    if len(values) < n:
        return None
    return sum(values[-n:]) / n


def ema_series(values: list[float], n: int) -> list[float]:
    if not values:
        return []
    k = 2 / (n + 1)
    out = [values[0]]
    for v in values[1:]:
        out.append(v * k + out[-1] * (1 - k))
    return out


def ema(values: list[float], n: int) -> float | None:
    if len(values) < n:
        return None
    return ema_series(values, n)[-1]


def rsi(values: list[float], n: int = 14) -> float | None:
    if len(values) < n + 1:
        return None
    gains = losses = 0.0
    for i in range(1, n + 1):
        d = values[i] - values[i - 1]
        gains += max(d, 0)
        losses += max(-d, 0)
    avg_g, avg_l = gains / n, losses / n
    for i in range(n + 1, len(values)):
        d = values[i] - values[i - 1]
        avg_g = (avg_g * (n - 1) + max(d, 0)) / n
        avg_l = (avg_l * (n - 1) + max(-d, 0)) / n
    if avg_l == 0:
        return 100.0
    return 100 - 100 / (1 + avg_g / avg_l)


def macd_hist(values: list[float], fast: int = 12, slow: int = 26, signal: int = 9) -> list[float]:
    if len(values) < slow + signal:
        return []
    line = [a - b for a, b in zip(ema_series(values, fast), ema_series(values, slow))]
    sig = ema_series(line, signal)
    return [a - b for a, b in zip(line, sig)]


def true_ranges(highs: list[float], lows: list[float], closes: list[float]) -> list[float]:
    out = []
    for i in range(1, len(closes)):
        out.append(max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1])))
    return out


def atr(highs: list[float], lows: list[float], closes: list[float], n: int = 14) -> float | None:
    tr = true_ranges(highs, lows, closes)
    if len(tr) < n:
        return None
    a = sum(tr[:n]) / n
    for x in tr[n:]:
        a = (a * (n - 1) + x) / n
    return a


def adx(highs: list[float], lows: list[float], closes: list[float], n: int = 14) -> float | None:
    """Wilder's Average Directional Index: < 20 means no trend, > 25 a trend."""
    if len(closes) < 2 * n + 1:
        return None
    tr = true_ranges(highs, lows, closes)
    pdm, ndm = [], []
    for i in range(1, len(closes)):
        up, down = highs[i] - highs[i - 1], lows[i - 1] - lows[i]
        pdm.append(up if up > down and up > 0 else 0.0)
        ndm.append(down if down > up and down > 0 else 0.0)
    s_tr, s_p, s_n = sum(tr[:n]), sum(pdm[:n]), sum(ndm[:n])
    dxs = []
    for i in range(n, len(tr) + 1):
        if i > n:
            s_tr = s_tr - s_tr / n + tr[i - 1]
            s_p = s_p - s_p / n + pdm[i - 1]
            s_n = s_n - s_n / n + ndm[i - 1]
        if s_tr == 0:
            dxs.append(0.0)
            continue
        pdi, ndi = 100 * s_p / s_tr, 100 * s_n / s_tr
        dxs.append(0.0 if pdi + ndi == 0 else 100 * abs(pdi - ndi) / (pdi + ndi))
    if len(dxs) < n:
        return None
    a = sum(dxs[:n]) / n
    for x in dxs[n:]:
        a = (a * (n - 1) + x) / n
    return a


def bollinger(values: list[float], n: int = 20, k: float = 2.0) -> tuple[float, float, float] | None:
    if len(values) < n:
        return None
    w = values[-n:]
    mid = sum(w) / n
    sd = math.sqrt(sum((x - mid) ** 2 for x in w) / n)
    return mid - k * sd, mid, mid + k * sd


def realized_vol(closes: list[float], n: int = 20) -> float | None:
    """Annualised close-to-close volatility."""
    if len(closes) < n + 1:
        return None
    rets = [math.log(closes[i] / closes[i - 1]) for i in range(len(closes) - n, len(closes))]
    mean = sum(rets) / n
    var = sum((r - mean) ** 2 for r in rets) / (n - 1)
    return math.sqrt(var * 252)
