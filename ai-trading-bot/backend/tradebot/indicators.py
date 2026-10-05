"""Technical indicators: batch functions for charts and a streaming state for the trading core.

Two implementations of the same definitions live here:

- **Batch** functions (``ema``, ``rsi``, ``macd``, ...) over whole numpy arrays. The API uses
  them through ``overlay_series`` / ``overlay_values`` to draw chart overlays.
- ``IndicatorState``, an O(1)-per-candle streaming version that the trading core updates on
  every closed candle. Bootstrap and backtests replay hundreds of thousands of candles, so the
  core cannot afford to recompute indicators from scratch on every bar.

Both follow identical seeding rules and agree to floating-point precision on the same input
(``tests/engine/test_indicators.py`` holds them to it). ``snapshot`` uses the streaming state,
so the API and the engine report exactly the same numbers for the same candles.

Definitions (period defaults in brackets):

- **EMA(n)** ``α = 2/(n+1)``, seeded with the SMA of the first ``n`` values; undefined before.
- **RSI [14]** Wilder: average gain / loss seeded with simple means of the first 14 changes,
  then ``avg = (avg·13 + x)/14``. All-gain windows read 100, flat windows 50.
- **MACD [12, 26, 9]** ``EMA12 − EMA26``; signal = EMA9 of the MACD line; histogram = difference.
- **Bollinger [20, 2]** ``SMA20 ± 2σ`` with the population standard deviation (as charting
  platforms draw it); ``bb_width_pct = (upper − lower)/middle·100``.
- **ATR [14]** Wilder-smoothed true range, seeded with the mean of the first 14 true ranges
  (the first candle has no previous close, so it does not count).
- **ADX [14]** Wilder's DMI: +DM/−DM/TR running sums smoothed with ``S − S/14 + x``, DX from the
  DIs, ADX = Wilder average of DX seeded with the mean of the first 14 DX values (from the 28th
  candle on).
- **VWAP** of the typical price ``(H+L+C)/3``. Intraday timeframes use the *session* VWAP that
  resets at 00:00 UTC (the candle's open time decides its session). On ``1d`` candles a session
  would be a single bar, so a rolling **20-bar** VWAP is used instead. A session with zero
  volume so far reads the typical price.
- **Volume ratio** ``volume / SMA20(volume)``, the average including the current bar.
"""

from __future__ import annotations

import math
from collections import deque
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

from .schemas import TIMEFRAME_SECONDS, Candle, IndicatorSeries, IndicatorSnapshot, LinePoint

EMA_PERIODS: tuple[int, ...] = (9, 21, 50, 200)
RSI_PERIOD = 14
MACD_FAST, MACD_SLOW, MACD_SIGNAL = 12, 26, 9
BB_PERIOD, BB_MULT = 20, 2.0
ATR_PERIOD = 14
ADX_PERIOD = 14
VOLUME_PERIOD = 20
DAILY_VWAP_WINDOW = 20
SWING_LOOKBACK = 12
RANK_HISTORY = 120

OVERLAY_KEYS: tuple[str, ...] = (
    "ema9",
    "ema21",
    "ema50",
    "ema200",
    "vwap",
    "bb_upper",
    "bb_middle",
    "bb_lower",
)

_DAY = 86_400


# --------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------


def _arr(values: Sequence[float] | np.ndarray) -> np.ndarray:
    return np.asarray(values, dtype=np.float64)


def _nan(n: int) -> np.ndarray:
    return np.full(n, np.nan, dtype=np.float64)


def _finite(v: float | None) -> bool:
    return v is not None and math.isfinite(v)


def round_sig(value: float | None, digits: int = 8) -> float | None:
    """Round to ``digits`` significant digits (prices of any magnitude stay readable)."""
    if value is None or not math.isfinite(value):
        return None
    if value == 0:
        return 0.0
    return round(value, digits - 1 - int(math.floor(math.log10(abs(value)))))


def _r(value: float | None, ndigits: int) -> float | None:
    if value is None or not math.isfinite(value):
        return None
    return round(value, ndigits)


def infer_timeframe(times: Sequence[int]) -> str | None:
    """Timeframe whose length matches the smallest positive gap between candle open times."""
    if len(times) < 2:
        return None
    gaps = np.diff(np.asarray(times, dtype=np.int64))
    gaps = gaps[gaps > 0]
    if gaps.size == 0:
        return None
    step = int(gaps.min())
    best = min(TIMEFRAME_SECONDS, key=lambda tf: abs(TIMEFRAME_SECONDS[tf] - step))
    return best


def _is_daily(timeframe: str | None) -> bool:
    return timeframe is not None and TIMEFRAME_SECONDS.get(timeframe, 0) >= _DAY


# --------------------------------------------------------------------------
# Batch indicators (numpy arrays in, numpy arrays out; NaN where undefined)
# --------------------------------------------------------------------------


def sma(values: Sequence[float] | np.ndarray, period: int) -> np.ndarray:
    x = _arr(values)
    out = _nan(x.size)
    if period > 0 and x.size >= period:
        out[period - 1 :] = sliding_window_view(x, period).mean(axis=1)
    return out


def _ema_list(values: list[float], period: int) -> list[float]:
    """EMA of a NaN-free list; returns values from index ``period - 1`` on."""
    alpha = 2.0 / (period + 1)
    beta = 1.0 - alpha
    prev = sum(values[:period]) / period
    out = [prev]
    for x in values[period:]:
        prev = alpha * x + beta * prev
        out.append(prev)
    return out


def ema(values: Sequence[float] | np.ndarray, period: int) -> np.ndarray:
    """EMA seeded with the SMA of the first ``period`` finite values (leading NaNs are skipped)."""
    x = _arr(values)
    out = _nan(x.size)
    finite = np.flatnonzero(np.isfinite(x))
    if finite.size == 0:
        return out
    start = int(finite[0])
    tail = x[start:]
    if tail.size < period or not np.all(np.isfinite(tail)):
        if tail.size < period:
            return out
        raise ValueError("ema() needs a contiguous run of finite values")
    out[start + period - 1 :] = _ema_list(tail.tolist(), period)
    return out


def _rsi_value(avg_gain: float, avg_loss: float) -> float:
    if avg_loss <= 0.0:
        return 100.0 if avg_gain > 0.0 else 50.0
    return 100.0 - 100.0 / (1.0 + avg_gain / avg_loss)


def rsi(close: Sequence[float] | np.ndarray, period: int = RSI_PERIOD) -> np.ndarray:
    c = _arr(close).tolist()
    out = _nan(len(c))
    if len(c) <= period:
        return out
    gains = losses = 0.0
    for i in range(1, period + 1):
        d = c[i] - c[i - 1]
        if d > 0:
            gains += d
        else:
            losses -= d
    avg_gain, avg_loss = gains / period, losses / period
    res = [_rsi_value(avg_gain, avg_loss)]
    k = period - 1
    for i in range(period + 1, len(c)):
        d = c[i] - c[i - 1]
        avg_gain = (avg_gain * k + (d if d > 0 else 0.0)) / period
        avg_loss = (avg_loss * k + (-d if d < 0 else 0.0)) / period
        res.append(_rsi_value(avg_gain, avg_loss))
    out[period:] = res
    return out


def macd(
    close: Sequence[float] | np.ndarray,
    fast: int = MACD_FAST,
    slow: int = MACD_SLOW,
    signal: int = MACD_SIGNAL,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(MACD line, signal line, histogram)."""
    c = _arr(close)
    line = ema(c, fast) - ema(c, slow)
    sig = ema(line, signal) if np.isfinite(line).sum() >= signal else _nan(c.size)
    return line, sig, line - sig


def bollinger(
    close: Sequence[float] | np.ndarray, period: int = BB_PERIOD, mult: float = BB_MULT
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(upper, middle, lower) with the population standard deviation."""
    c = _arr(close)
    upper, middle, lower = _nan(c.size), _nan(c.size), _nan(c.size)
    if c.size >= period:
        windows = sliding_window_view(c, period)
        mean = windows.mean(axis=1)
        std = np.sqrt(((windows - mean[:, None]) ** 2).mean(axis=1))
        middle[period - 1 :] = mean
        upper[period - 1 :] = mean + mult * std
        lower[period - 1 :] = mean - mult * std
    return upper, middle, lower


def true_range(
    high: Sequence[float] | np.ndarray, low: Sequence[float] | np.ndarray, close: Sequence[float] | np.ndarray
) -> np.ndarray:
    h, lo, c = _arr(high), _arr(low), _arr(close)
    tr = h - lo
    if c.size > 1:
        prev = c[:-1]
        tr[1:] = np.maximum.reduce([h[1:] - lo[1:], np.abs(h[1:] - prev), np.abs(lo[1:] - prev)])
    return tr


def atr(
    high: Sequence[float] | np.ndarray,
    low: Sequence[float] | np.ndarray,
    close: Sequence[float] | np.ndarray,
    period: int = ATR_PERIOD,
) -> np.ndarray:
    tr = true_range(high, low, close).tolist()
    out = _nan(len(tr))
    if len(tr) <= period:
        return out
    prev = sum(tr[1 : period + 1]) / period
    res = [prev]
    k = period - 1
    for x in tr[period + 1 :]:
        prev = (prev * k + x) / period
        res.append(prev)
    out[period:] = res
    return out


def adx(
    high: Sequence[float] | np.ndarray,
    low: Sequence[float] | np.ndarray,
    close: Sequence[float] | np.ndarray,
    period: int = ADX_PERIOD,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(ADX, +DI, −DI). DIs exist from index ``period``, ADX from ``2·period − 1``."""
    h, lo, c = _arr(high).tolist(), _arr(low).tolist(), _arr(close).tolist()
    n = len(c)
    adx_out, pdi_out, mdi_out = _nan(n), _nan(n), _nan(n)
    if n <= period:
        return adx_out, pdi_out, mdi_out
    s_tr = s_p = s_m = 0.0
    dx_seed: list[float] = []
    adx_val: float | None = None
    for i in range(1, n):
        up = h[i] - h[i - 1]
        down = lo[i - 1] - lo[i]
        pdm = up if (up > down and up > 0) else 0.0
        mdm = down if (down > up and down > 0) else 0.0
        tr = max(h[i] - lo[i], abs(h[i] - c[i - 1]), abs(lo[i] - c[i - 1]))
        if i <= period:
            s_tr += tr
            s_p += pdm
            s_m += mdm
            if i < period:
                continue
        else:
            s_tr = s_tr - s_tr / period + tr
            s_p = s_p - s_p / period + pdm
            s_m = s_m - s_m / period + mdm
        pdi = 100.0 * s_p / s_tr if s_tr > 0 else 0.0
        mdi = 100.0 * s_m / s_tr if s_tr > 0 else 0.0
        dx = 100.0 * abs(pdi - mdi) / (pdi + mdi) if (pdi + mdi) > 0 else 0.0
        pdi_out[i], mdi_out[i] = pdi, mdi
        if adx_val is None:
            dx_seed.append(dx)
            if len(dx_seed) == period:
                adx_val = sum(dx_seed) / period
                adx_out[i] = adx_val
        else:
            adx_val = (adx_val * (period - 1) + dx) / period
            adx_out[i] = adx_val
    return adx_out, pdi_out, mdi_out


def vwap(
    times: Sequence[int] | np.ndarray,
    high: Sequence[float] | np.ndarray,
    low: Sequence[float] | np.ndarray,
    close: Sequence[float] | np.ndarray,
    volume: Sequence[float] | np.ndarray,
    timeframe: str | None = None,
) -> np.ndarray:
    """Session VWAP (UTC-midnight reset) for intraday timeframes, rolling 20-bar VWAP on 1d."""
    t = np.asarray(times, dtype=np.int64)
    tp = (_arr(high) + _arr(low) + _arr(close)) / 3.0
    v = _arr(volume)
    n = tp.size
    if n == 0:
        return _nan(0)
    tf = timeframe or infer_timeframe(t.tolist())
    pv = tp * v
    if _is_daily(tf):
        out = _nan(n)
        w = DAILY_VWAP_WINDOW
        if n >= w:
            sum_pv = sliding_window_view(pv, w).sum(axis=1)
            sum_v = sliding_window_view(v, w).sum(axis=1)
            with np.errstate(invalid="ignore", divide="ignore"):
                out[w - 1 :] = np.where(sum_v > 0, sum_pv / np.where(sum_v > 0, sum_v, 1.0), tp[w - 1 :])
        return out
    day = t // _DAY
    starts = np.flatnonzero(np.r_[True, day[1:] != day[:-1]])
    lengths = np.diff(np.r_[starts, n])
    cs_pv = np.cumsum(pv)
    cs_v = np.cumsum(v)
    base_pv = np.repeat(cs_pv[starts] - pv[starts], lengths)
    base_v = np.repeat(cs_v[starts] - v[starts], lengths)
    sess_pv = cs_pv - base_pv
    sess_v = cs_v - base_v
    safe = np.where(sess_v > 0, sess_v, 1.0)
    return np.where(sess_v > 0, sess_pv / safe, tp)


def volume_ratio(
    volume: Sequence[float] | np.ndarray, period: int = VOLUME_PERIOD
) -> tuple[np.ndarray, np.ndarray]:
    """(SMA20 of volume, volume / SMA20)."""
    v = _arr(volume)
    avg = sma(v, period)
    with np.errstate(invalid="ignore", divide="ignore"):
        ratio = np.where(avg > 0, v / np.where(avg > 0, avg, 1.0), np.nan)
    ratio[~np.isfinite(avg)] = np.nan
    return avg, ratio


# --------------------------------------------------------------------------
# Chart overlays (used by the API for MarketSnapshot / WsCandleData)
# --------------------------------------------------------------------------


def _columns(candles: Sequence[Candle]) -> tuple[np.ndarray, ...]:
    n = len(candles)
    t = np.fromiter((c.time for c in candles), dtype=np.int64, count=n)
    o = np.fromiter((c.open for c in candles), dtype=np.float64, count=n)
    h = np.fromiter((c.high for c in candles), dtype=np.float64, count=n)
    lo = np.fromiter((c.low for c in candles), dtype=np.float64, count=n)
    cl = np.fromiter((c.close for c in candles), dtype=np.float64, count=n)
    v = np.fromiter((c.volume for c in candles), dtype=np.float64, count=n)
    return t, o, h, lo, cl, v


def _overlay_arrays(candles: Sequence[Candle], timeframe: str | None) -> tuple[np.ndarray, dict[str, np.ndarray]]:
    t, _o, h, lo, c, v = _columns(candles)
    upper, middle, lower = bollinger(c)
    arrays = {f"ema{p}": ema(c, p) for p in EMA_PERIODS}
    arrays["vwap"] = vwap(t, h, lo, c, v, timeframe or infer_timeframe(t.tolist()))
    arrays["bb_upper"], arrays["bb_middle"], arrays["bb_lower"] = upper, middle, lower
    return t, arrays


def price_decimals(reference: float) -> int:
    """Decimals that keep ~9 significant digits for prices around ``reference``."""
    if not math.isfinite(reference) or reference <= 0:
        return 8
    return max(2, min(12, 8 - int(math.floor(math.log10(reference)))))


def overlay_series(candles: list[Candle], timeframe: str | None = None) -> IndicatorSeries:
    """EMA 9/21/50/200, VWAP and Bollinger bands aligned to the candle times.

    Warm-up points where an indicator is not yet defined are omitted, so every series starts
    at its first valid value. ``timeframe`` is inferred from the candle spacing when omitted
    (it only matters for VWAP: session VWAP intraday, rolling 20-bar on 1d).
    """
    if not candles:
        return IndicatorSeries()
    t, arrays = _overlay_arrays(candles, timeframe)
    decimals = price_decimals(candles[-1].close)
    series: dict[str, list[LinePoint]] = {}
    for key in OVERLAY_KEYS:
        values = arrays[key]
        mask = np.isfinite(values)
        series[key] = [
            LinePoint(time=ts, value=v)
            for ts, v in zip(t[mask].tolist(), np.round(values[mask], decimals).tolist(), strict=True)
        ]
    return IndicatorSeries(**series)


def overlay_values(candles: list[Candle], timeframe: str | None = None) -> dict[str, float | None]:
    """The eight overlay values at the last candle (None while warming up)."""
    if not candles:
        return dict.fromkeys(OVERLAY_KEYS)
    _t, arrays = _overlay_arrays(candles, timeframe)
    decimals = price_decimals(candles[-1].close)
    out: dict[str, float | None] = {}
    for key in OVERLAY_KEYS:
        last = float(arrays[key][-1])
        out[key] = round(last, decimals) if math.isfinite(last) else None
    return out


def snapshot(candles: list[Candle], timeframe: str | None = None) -> IndicatorSnapshot:
    """Indicator values at the last candle, identical to what the trading core computes."""
    if not candles:
        raise ValueError("snapshot() needs at least one candle")
    tf = timeframe or infer_timeframe([c.time for c in candles]) or "5m"
    state = IndicatorState(tf)
    for candle in candles:
        state.update(candle)
    return state.snapshot()


def features(candles: list[Candle], timeframe: str | None = None) -> Features:
    """Streaming features at the last candle (see ``Features``)."""
    if not candles:
        raise ValueError("features() needs at least one candle")
    tf = timeframe or infer_timeframe([c.time for c in candles]) or "5m"
    state = IndicatorState(tf)
    for candle in candles:
        state.update(candle)
    return state.features()


# --------------------------------------------------------------------------
# Streaming state (trading core)
# --------------------------------------------------------------------------


class _Ema:
    __slots__ = ("alpha", "beta", "n", "period", "seed", "value")

    def __init__(self, period: int) -> None:
        self.period = period
        self.alpha = 2.0 / (period + 1)
        self.beta = 1.0 - self.alpha
        self.n = 0
        self.seed: list[float] = []
        self.value: float | None = None

    def update(self, x: float) -> float | None:
        if self.value is None:
            self.seed.append(x)
            if len(self.seed) == self.period:
                self.value = sum(self.seed) / self.period
                self.seed = []
            return self.value
        self.value = self.alpha * x + self.beta * self.value
        return self.value


class _Wilder:
    """Wilder average seeded with the simple mean of the first ``period`` samples."""

    __slots__ = ("k", "period", "seed", "value")

    def __init__(self, period: int) -> None:
        self.period = period
        self.k = period - 1
        self.seed: list[float] = []
        self.value: float | None = None

    def update(self, x: float) -> float | None:
        if self.value is None:
            self.seed.append(x)
            if len(self.seed) == self.period:
                self.value = sum(self.seed) / self.period
                self.seed = []
            return self.value
        self.value = (self.value * self.k + x) / self.period
        return self.value


@dataclass(frozen=True, slots=True)
class Features:
    """Everything the regime classifier, MTF report and analysts read on one timeframe.

    ``IndicatorSnapshot`` is the display / contract subset; this adds the derived values a
    decision needs (slopes, previous histogram, DIs, percentile ranks, swing points). Values
    are ``None`` until the underlying indicator has warmed up.
    """

    timeframe: str
    bars: int
    time: int
    open: float
    high: float
    low: float
    price: float
    prev_close: float | None
    change_pct: float | None
    ema9: float | None
    ema21: float | None
    ema50: float | None
    ema200: float | None
    ema21_slope_pct: float | None  # % change of EMA 21 over the last 5 bars
    ema50_slope_pct: float | None  # % change of EMA 50 over the last 10 bars
    rsi: float | None
    macd: float | None
    macd_signal: float | None
    macd_hist: float | None
    macd_hist_prev: float | None
    atr: float | None
    atr_pct: float | None
    atr_pct_rank: float | None  # percentile (0-100) of atr_pct within the last RANK_HISTORY bars
    adx: float | None
    adx_prev: float | None
    plus_di: float | None
    minus_di: float | None
    bb_upper: float | None
    bb_middle: float | None
    bb_lower: float | None
    bb_width_pct: float | None
    bb_width_rank: float | None
    squeeze_rank: float | None  # lowest bb_width rank over the last 20 bars (recent squeeze)
    bb_pct_b: float | None  # (close - lower) / (upper - lower)
    vwap: float | None
    volume: float
    volume_avg20: float | None
    volume_ratio: float | None
    swing_high: float | None  # highest high of the last SWING_LOOKBACK bars
    swing_low: float | None


def _rank(values: deque[float], x: float) -> float | None:
    """Percentile rank (0-100) of x among values (fraction of values <= x)."""
    if len(values) < 20:
        return None
    below = sum(1 for v in values if v <= x)
    return below / len(values) * 100.0


class IndicatorState:
    """Streaming indicators for one (symbol, timeframe); ``update`` once per closed candle."""

    def __init__(self, timeframe: str = "5m") -> None:
        self.timeframe = timeframe
        self.daily = _is_daily(timeframe)
        self.bars = 0
        self.last: Candle | None = None
        self.prev_close: float | None = None
        self._emas = {p: _Ema(p) for p in EMA_PERIODS}
        self._ema_fast, self._ema_slow, self._signal = _Ema(MACD_FAST), _Ema(MACD_SLOW), _Ema(MACD_SIGNAL)
        self.macd: float | None = None
        self.macd_signal: float | None = None
        self.macd_hist: float | None = None
        self._rsi_gain = _Wilder(RSI_PERIOD)
        self._rsi_loss = _Wilder(RSI_PERIOD)
        self.rsi: float | None = None
        self._atr = _Wilder(ATR_PERIOD)
        self.atr: float | None = None
        # ADX: Wilder running sums for the first `period` bars, then S - S/n + x
        self._dmi_n = 0
        self._s_tr = self._s_p = self._s_m = 0.0
        self._adx = _Wilder(ADX_PERIOD)
        self.adx: float | None = None
        self.plus_di: float | None = None
        self.minus_di: float | None = None
        self._bb: deque[float] = deque(maxlen=BB_PERIOD)
        self.bb: tuple[float, float, float] | None = None
        self._vol: deque[float] = deque(maxlen=VOLUME_PERIOD)
        self.volume_avg: float | None = None
        # VWAP (session or rolling)
        self._session_day: int | None = None
        self._sess_pv = 0.0
        self._sess_v = 0.0
        self._roll: deque[tuple[float, float]] = deque(maxlen=DAILY_VWAP_WINDOW)
        self.vwap: float | None = None
        # short histories for slopes, ranks and swings
        self._ema21_hist: deque[float] = deque(maxlen=6)
        self._ema50_hist: deque[float] = deque(maxlen=11)
        self._hist_hist: deque[float] = deque(maxlen=2)
        self._adx_hist: deque[float] = deque(maxlen=2)
        self._atr_pct_hist: deque[float] = deque(maxlen=RANK_HISTORY)
        self._bbw_hist: deque[float] = deque(maxlen=RANK_HISTORY)
        self._bbw_recent: deque[float] = deque(maxlen=20)
        self._highs: deque[float] = deque(maxlen=SWING_LOOKBACK)
        self._lows: deque[float] = deque(maxlen=SWING_LOOKBACK)
        self._snapshot: IndicatorSnapshot | None = None
        self._features: Features | None = None

    @property
    def ema(self) -> dict[int, float | None]:
        return {p: e.value for p, e in self._emas.items()}

    def update(self, candle: Candle) -> None:
        o, h, lo, c, v = candle.open, candle.high, candle.low, candle.close, candle.volume
        prev = self.last
        self.prev_close = prev.close if prev is not None else None
        self.bars += 1
        for e in self._emas.values():
            e.update(c)
        fast, slow = self._ema_fast.update(c), self._ema_slow.update(c)
        if fast is not None and slow is not None:
            self.macd = fast - slow
            self.macd_signal = self._signal.update(self.macd)
            if self.macd_signal is not None:
                if self.macd_hist is not None:
                    self._hist_hist.append(self.macd_hist)
                self.macd_hist = self.macd - self.macd_signal
        if prev is not None:
            d = c - prev.close
            g = self._rsi_gain.update(d if d > 0 else 0.0)
            ls = self._rsi_loss.update(-d if d < 0 else 0.0)
            if g is not None and ls is not None:
                self.rsi = _rsi_value(g, ls)
            tr = max(h - lo, abs(h - prev.close), abs(lo - prev.close))
            self.atr = self._atr.update(tr)
            self._update_dmi(h, lo, tr, prev)
        self._bb.append(c)
        if len(self._bb) == BB_PERIOD:
            mean = sum(self._bb) / BB_PERIOD
            std = math.sqrt(sum((x - mean) ** 2 for x in self._bb) / BB_PERIOD)
            self.bb = (mean + BB_MULT * std, mean, mean - BB_MULT * std)
        self._vol.append(v)
        self.volume_avg = sum(self._vol) / VOLUME_PERIOD if len(self._vol) == VOLUME_PERIOD else None
        self._update_vwap(candle)
        e21, e50 = self._emas[21].value, self._emas[50].value
        if e21 is not None:
            self._ema21_hist.append(e21)
        if e50 is not None:
            self._ema50_hist.append(e50)
        if self.atr is not None and c > 0:
            self._atr_pct_hist.append(self.atr / c * 100.0)
        if self.bb is not None and self.bb[1] > 0:
            width = (self.bb[0] - self.bb[2]) / self.bb[1] * 100.0
            self._bbw_hist.append(width)
            rank = _rank(self._bbw_hist, width)
            if rank is not None:
                self._bbw_recent.append(rank)
        self._highs.append(h)
        self._lows.append(lo)
        self.last = candle
        self._snapshot = None
        self._features = None

    def _update_dmi(self, h: float, lo: float, tr: float, prev: Candle) -> None:
        up = h - prev.high
        down = prev.low - lo
        pdm = up if (up > down and up > 0) else 0.0
        mdm = down if (down > up and down > 0) else 0.0
        self._dmi_n += 1
        if self._dmi_n <= ADX_PERIOD:
            self._s_tr += tr
            self._s_p += pdm
            self._s_m += mdm
            if self._dmi_n < ADX_PERIOD:
                return
        else:
            self._s_tr = self._s_tr - self._s_tr / ADX_PERIOD + tr
            self._s_p = self._s_p - self._s_p / ADX_PERIOD + pdm
            self._s_m = self._s_m - self._s_m / ADX_PERIOD + mdm
        pdi = 100.0 * self._s_p / self._s_tr if self._s_tr > 0 else 0.0
        mdi = 100.0 * self._s_m / self._s_tr if self._s_tr > 0 else 0.0
        dx = 100.0 * abs(pdi - mdi) / (pdi + mdi) if (pdi + mdi) > 0 else 0.0
        self.plus_di, self.minus_di = pdi, mdi
        if self.adx is not None:
            self._adx_hist.append(self.adx)
        self.adx = self._adx.update(dx)

    def _update_vwap(self, candle: Candle) -> None:
        tp = (candle.high + candle.low + candle.close) / 3.0
        v = candle.volume
        if self.daily:
            self._roll.append((tp * v, v))
            if len(self._roll) == DAILY_VWAP_WINDOW:
                spv = sum(p for p, _ in self._roll)
                sv = sum(q for _, q in self._roll)
                self.vwap = spv / sv if sv > 0 else tp
            return
        day = candle.time // _DAY
        if day != self._session_day:
            self._session_day = day
            self._sess_pv = 0.0
            self._sess_v = 0.0
        self._sess_pv += tp * v
        self._sess_v += v
        self.vwap = self._sess_pv / self._sess_v if self._sess_v > 0 else tp

    # -- read side -----------------------------------------------------------

    def snapshot(self) -> IndicatorSnapshot:
        """Contract snapshot at the latest closed candle (rounded for display / prompts)."""
        if self._snapshot is not None:
            return self._snapshot
        if self.last is None:
            raise ValueError("no candles yet")
        c = self.last.close
        bb = self.bb
        atr_pct = self.atr / c * 100.0 if (self.atr is not None and c > 0) else None
        width = (bb[0] - bb[2]) / bb[1] * 100.0 if (bb is not None and bb[1] > 0) else None
        ratio = self.last.volume / self.volume_avg if (self.volume_avg and self.volume_avg > 0) else None
        snap = IndicatorSnapshot.model_construct(
            price=c,
            ema9=round_sig(self._emas[9].value),
            ema21=round_sig(self._emas[21].value),
            ema50=round_sig(self._emas[50].value),
            ema200=round_sig(self._emas[200].value),
            vwap=round_sig(self.vwap),
            bb_upper=round_sig(bb[0]) if bb else None,
            bb_middle=round_sig(bb[1]) if bb else None,
            bb_lower=round_sig(bb[2]) if bb else None,
            bb_width_pct=_r(width, 4),
            rsi=_r(self.rsi, 2),
            macd=round_sig(self.macd, 6),
            macd_signal=round_sig(self.macd_signal, 6),
            macd_hist=round_sig(self.macd_hist, 6),
            atr=round_sig(self.atr, 6),
            atr_pct=_r(atr_pct, 4),
            adx=_r(self.adx, 2),
            volume=round_sig(self.last.volume, 8),
            volume_avg20=round_sig(self.volume_avg, 8),
            volume_ratio=_r(ratio, 3),
        )
        self._snapshot = snap
        return snap

    def features(self) -> Features:
        if self._features is not None:
            return self._features
        last = self.last
        if last is None:
            raise ValueError("no candles yet")
        c = last.close
        e21h, e50h = self._ema21_hist, self._ema50_hist
        slope21 = (e21h[-1] / e21h[0] - 1.0) * 100.0 if len(e21h) == e21h.maxlen and e21h[0] > 0 else None
        slope50 = (e50h[-1] / e50h[0] - 1.0) * 100.0 if len(e50h) == e50h.maxlen and e50h[0] > 0 else None
        atr_pct = self.atr / c * 100.0 if (self.atr is not None and c > 0) else None
        bb = self.bb
        width = (bb[0] - bb[2]) / bb[1] * 100.0 if (bb is not None and bb[1] > 0) else None
        pct_b = (c - bb[2]) / (bb[0] - bb[2]) if (bb is not None and bb[0] > bb[2]) else None
        ratio = last.volume / self.volume_avg if (self.volume_avg and self.volume_avg > 0) else None
        prev_close = self.prev_close
        feats = Features(
            timeframe=self.timeframe,
            bars=self.bars,
            time=last.time,
            open=last.open,
            high=last.high,
            low=last.low,
            price=c,
            prev_close=prev_close,
            change_pct=(c / prev_close - 1.0) * 100.0 if prev_close else None,
            ema9=self._emas[9].value,
            ema21=self._emas[21].value,
            ema50=self._emas[50].value,
            ema200=self._emas[200].value,
            ema21_slope_pct=slope21,
            ema50_slope_pct=slope50,
            rsi=self.rsi,
            macd=self.macd,
            macd_signal=self.macd_signal,
            macd_hist=self.macd_hist,
            macd_hist_prev=self._hist_hist[-1] if self._hist_hist else None,
            atr=self.atr,
            atr_pct=atr_pct,
            atr_pct_rank=_rank(self._atr_pct_hist, atr_pct) if atr_pct is not None else None,
            adx=self.adx,
            adx_prev=self._adx_hist[-1] if self._adx_hist else None,
            plus_di=self.plus_di,
            minus_di=self.minus_di,
            bb_upper=bb[0] if bb else None,
            bb_middle=bb[1] if bb else None,
            bb_lower=bb[2] if bb else None,
            bb_width_pct=width,
            bb_width_rank=_rank(self._bbw_hist, width) if width is not None else None,
            squeeze_rank=min(self._bbw_recent) if self._bbw_recent else None,
            bb_pct_b=pct_b,
            vwap=self.vwap,
            volume=last.volume,
            volume_avg20=self.volume_avg,
            volume_ratio=ratio,
            swing_high=max(self._highs) if self._highs else None,
            swing_low=min(self._lows) if self._lows else None,
        )
        self._features = feats
        return feats

    def overlay_values(self) -> dict[str, float | None]:
        """The eight chart-overlay values at the latest closed candle (same rounding as the API)."""
        bb = self.bb
        d = price_decimals(self.last.close) if self.last is not None else 8
        raw = {
            "ema9": self._emas[9].value,
            "ema21": self._emas[21].value,
            "ema50": self._emas[50].value,
            "ema200": self._emas[200].value,
            "vwap": self.vwap,
            "bb_upper": bb[0] if bb else None,
            "bb_middle": bb[1] if bb else None,
            "bb_lower": bb[2] if bb else None,
        }
        return {k: (round(v, d) if v is not None and math.isfinite(v) else None) for k, v in raw.items()}
