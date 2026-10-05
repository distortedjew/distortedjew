"""Candle time arithmetic, aggregation, and the per-symbol candle book of the trading core.

Higher timeframes are always exact aggregations of lower ones: open of the first candle,
max high, min low, close of the last, summed volume. Buckets are aligned to the UTC epoch,
so 1d candles open at 00:00 UTC and 4h candles at 00/04/08/12/16/20 UTC.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Iterable, Mapping, Sequence

import numpy as np

from ..indicators import Features, IndicatorState
from ..schemas import TIMEFRAME_SECONDS, TIMEFRAMES, Candle, IndicatorSnapshot, Timeframe


def tf_seconds(timeframe: str) -> int:
    return TIMEFRAME_SECONDS[timeframe]


def floor_time(ts: int, timeframe: str) -> int:
    sec = TIMEFRAME_SECONDS[timeframe]
    return ts - ts % sec


def timeframes_from(base: str) -> tuple[Timeframe, ...]:
    """``base`` and every higher timeframe, in ascending order."""
    return TIMEFRAMES[TIMEFRAMES.index(base) :]  # type: ignore[arg-type]


def merge(a: Candle, b: Candle) -> Candle:
    """``a`` extended by the later candle ``b``."""
    return Candle(
        time=a.time,
        open=a.open,
        high=max(a.high, b.high),
        low=min(a.low, b.low),
        close=b.close,
        volume=a.volume + b.volume,
    )


def aggregate(candles: Iterable[Candle], timeframe: str, *, include_partial: bool = True) -> list[Candle]:
    """Aggregate time-ordered lower-timeframe candles into ``timeframe`` buckets.

    With ``include_partial=False`` a trailing bucket that is not complete (its last candle does
    not reach the bucket end) is dropped. Completeness assumes the input timeframe is the
    spacing of its candles.
    """
    items = list(candles)
    if not items:
        return []
    sec = TIMEFRAME_SECONDS[timeframe]
    out: list[Candle] = []
    cur: Candle | None = None
    for c in items:
        bucket = c.time - c.time % sec
        if cur is None or bucket != cur.time:
            if cur is not None:
                out.append(cur)
            cur = Candle(time=bucket, open=c.open, high=c.high, low=c.low, close=c.close, volume=c.volume)
        else:
            cur = merge(cur, c)
    assert cur is not None
    if include_partial:
        out.append(cur)
    else:
        step = items[1].time - items[0].time if len(items) > 1 else sec
        if items[-1].time + step >= cur.time + sec:
            out.append(cur)
    return out


def aggregate_arrays(
    t: np.ndarray,
    o: np.ndarray,
    h: np.ndarray,
    lo: np.ndarray,
    c: np.ndarray,
    v: np.ndarray,
    factor: int,
) -> tuple[np.ndarray, ...]:
    """Vectorized aggregation of contiguous, bucket-aligned candles ``factor`` at a time.

    The trailing partial bucket (fewer than ``factor`` candles) is included.
    """
    n = t.size
    full = n - n % factor
    parts: list[tuple[np.ndarray, ...]] = []
    if full:
        shape = (full // factor, factor)
        parts.append(
            (
                t[:full:factor],
                o[:full:factor],
                h[:full].reshape(shape).max(axis=1),
                lo[:full].reshape(shape).min(axis=1),
                c[factor - 1 : full : factor],
                v[:full].reshape(shape).sum(axis=1),
            )
        )
    if full < n:
        parts.append(
            (
                t[full : full + 1],
                o[full : full + 1],
                np.array([h[full:].max()]),
                np.array([lo[full:].min()]),
                c[n - 1 : n],
                np.array([v[full:].sum()]),
            )
        )
    if not parts:
        empty = np.array([])
        return empty, empty, empty, empty, empty, empty
    return tuple(np.concatenate([p[i] for p in parts]) for i in range(6))


class CandleArrays:
    """Time-ordered OHLCV candles as numpy arrays (``t`` = open time, unix seconds).

    History moves through the engine in this form (hundreds of thousands of candles on a
    fresh simulated install); ``Candle`` objects are only built for the slices that need them.
    """

    __slots__ = ("c", "h", "lo", "o", "t", "v")

    def __init__(
        self, t: np.ndarray, o: np.ndarray, h: np.ndarray, lo: np.ndarray, c: np.ndarray, v: np.ndarray
    ) -> None:
        self.t = np.asarray(t, dtype=np.int64)
        self.o, self.h, self.lo, self.c, self.v = (np.asarray(x, dtype=np.float64) for x in (o, h, lo, c, v))

    def __len__(self) -> int:
        return int(self.t.size)

    @classmethod
    def empty(cls) -> CandleArrays:
        z = np.array([])
        return cls(z, z, z, z, z, z)

    @classmethod
    def from_candles(cls, candles: Sequence[Candle]) -> CandleArrays:
        if not candles:
            return cls.empty()
        return cls(
            np.fromiter((c.time for c in candles), dtype=np.int64, count=len(candles)),
            np.fromiter((c.open for c in candles), dtype=np.float64, count=len(candles)),
            np.fromiter((c.high for c in candles), dtype=np.float64, count=len(candles)),
            np.fromiter((c.low for c in candles), dtype=np.float64, count=len(candles)),
            np.fromiter((c.close for c in candles), dtype=np.float64, count=len(candles)),
            np.fromiter((c.volume for c in candles), dtype=np.float64, count=len(candles)),
        )

    @classmethod
    def concat(cls, parts: Sequence[CandleArrays]) -> CandleArrays:
        parts = [p for p in parts if len(p)]
        if not parts:
            return cls.empty()
        return cls(*(np.concatenate([getattr(p, f) for p in parts]) for f in ("t", "o", "h", "lo", "c", "v")))

    def window(self, start: int | None = None, end: int | None = None) -> CandleArrays:
        """Candles with ``start <= time < end``."""
        lo = 0 if start is None else int(np.searchsorted(self.t, start, side="left"))
        hi = len(self) if end is None else int(np.searchsorted(self.t, end, side="left"))
        return CandleArrays(
            self.t[lo:hi], self.o[lo:hi], self.h[lo:hi], self.lo[lo:hi], self.c[lo:hi], self.v[lo:hi]
        )

    def tail(self, n: int) -> CandleArrays:
        if n >= len(self):
            return self
        return CandleArrays(self.t[-n:], self.o[-n:], self.h[-n:], self.lo[-n:], self.c[-n:], self.v[-n:])

    def aggregate(self, seconds: int, base_seconds: int = 60) -> CandleArrays:
        """Higher-timeframe candles from contiguous candles that start on a bucket boundary."""
        if seconds == base_seconds or not len(self):
            return self
        factor = seconds // base_seconds
        return CandleArrays(*aggregate_arrays(self.t, self.o, self.h, self.lo, self.c, self.v, factor))

    def last(self) -> Candle | None:
        if not len(self):
            return None
        return Candle(
            time=int(self.t[-1]),
            open=float(self.o[-1]),
            high=float(self.h[-1]),
            low=float(self.lo[-1]),
            close=float(self.c[-1]),
            volume=float(self.v[-1]),
        )

    def to_candles(self) -> list[Candle]:
        return [
            Candle(time=t, open=o, high=h, low=lo, close=c, volume=v)
            for t, o, h, lo, c, v in zip(
                self.t.tolist(),
                self.o.tolist(),
                self.h.tolist(),
                self.lo.tolist(),
                self.c.tolist(),
                self.v.tolist(),
                strict=True,
            )
        ]

    def rows(self, symbol: str, timeframe: str) -> list[tuple]:
        """``(symbol, timeframe, time, open, high, low, close, volume)`` rows for the candles table."""
        n = len(self)
        return list(
            zip(
                [symbol] * n,
                [timeframe] * n,
                self.t.tolist(),
                self.o.tolist(),
                self.h.tolist(),
                self.lo.tolist(),
                self.c.tolist(),
                self.v.tolist(),
                strict=True,
            )
        )


class Aggregator:
    """Streams lower-timeframe candles into one higher timeframe."""

    __slots__ = ("_c", "_h", "_l", "_o", "_v", "seconds", "start", "timeframe")

    def __init__(self, timeframe: str) -> None:
        self.timeframe = timeframe
        self.seconds = TIMEFRAME_SECONDS[timeframe]
        self.start: int | None = None
        self._o = self._h = self._l = self._c = self._v = 0.0

    def _emit(self) -> Candle:
        assert self.start is not None
        candle = Candle.model_construct(
            time=self.start, open=self._o, high=self._h, low=self._l, close=self._c, volume=self._v
        )
        self.start = None
        return candle

    def add(self, candle: Candle, candle_seconds: int) -> list[Candle]:
        """Add one lower-timeframe candle; returns the higher-timeframe candles it closed.

        A bucket closes when a candle reaching its end arrives, or (after a data gap) when a
        candle of a later bucket arrives first.
        """
        closed: list[Candle] = []
        bucket = candle.time - candle.time % self.seconds
        if self.start is not None and bucket != self.start:
            closed.append(self._emit())
        if self.start is None:
            self.start = bucket
            self._o, self._h, self._l, self._c, self._v = (
                candle.open,
                candle.high,
                candle.low,
                candle.close,
                candle.volume,
            )
        else:
            if candle.high > self._h:
                self._h = candle.high
            if candle.low < self._l:
                self._l = candle.low
            self._c = candle.close
            self._v += candle.volume
        if candle.time + candle_seconds >= self.start + self.seconds:
            closed.append(self._emit())
        return closed

    def reset(self, candles: Sequence[Candle]) -> None:
        """Start the forming bucket from lower-timeframe candles already inside it."""
        self.start = None
        for c in candles:
            bucket = c.time - c.time % self.seconds
            if self.start is None:
                self.start = bucket
                self._o, self._h, self._l, self._c, self._v = c.open, c.high, c.low, c.close, c.volume
            elif bucket == self.start:
                self._h = max(self._h, c.high)
                self._l = min(self._l, c.low)
                self._c = c.close
                self._v += c.volume

    @property
    def forming(self) -> Candle | None:
        if self.start is None:
            return None
        return Candle.model_construct(
            time=self.start, open=self._o, high=self._h, low=self._l, close=self._c, volume=self._v
        )


class Series:
    """Closed candles and streaming indicators of one timeframe."""

    __slots__ = ("aggregator", "closed", "indicators", "seconds", "timeframe")

    def __init__(self, timeframe: str, maxlen: int, aggregated: bool) -> None:
        self.timeframe = timeframe
        self.seconds = TIMEFRAME_SECONDS[timeframe]
        self.closed: deque[Candle] = deque(maxlen=maxlen)
        self.indicators = IndicatorState(timeframe)
        self.aggregator = Aggregator(timeframe) if aggregated else None

    def push(self, candle: Candle) -> None:
        self.closed.append(candle)
        self.indicators.update(candle)

    @property
    def last_time(self) -> int | None:
        return self.closed[-1].time if self.closed else None


class CandleBook:
    """Every timeframe of one symbol, fed only with base-timeframe candles.

    Higher timeframes are aggregated from the base candles, so the trading core sees the
    same candles whether they come from Binance, the simulator, a bootstrap replay or a
    backtest. ``warm_up`` seeds the book from stored history without side effects.
    """

    def __init__(
        self, symbol: str, base: str = "1m", timeframes: Sequence[str] | None = None, maxlen: int = 600
    ):
        self.symbol = symbol
        self.base = base
        self.base_seconds = TIMEFRAME_SECONDS[base]
        tfs = tuple(timeframes) if timeframes else timeframes_from(base)
        if base not in tfs:
            tfs = (base, *tfs)
        self.timeframes: tuple[str, ...] = tuple(sorted(set(tfs), key=TIMEFRAMES.index))
        if any(TIMEFRAME_SECONDS[tf] < self.base_seconds for tf in self.timeframes):
            raise ValueError("a candle book cannot hold timeframes below its base")
        self.series: dict[str, Series] = {
            tf: Series(tf, maxlen, aggregated=tf != base) for tf in self.timeframes
        }
        self.last_price: float | None = None

    # -- feeding -------------------------------------------------------------

    @property
    def end_time(self) -> int | None:
        """Close time (unix seconds) of the latest base candle."""
        last = self.series[self.base].last_time
        return last + self.base_seconds if last is not None else None

    def warm_up(self, history: Mapping[str, Sequence[Candle]]) -> None:
        """Seed from history: base candles plus closed candles of the higher timeframes.

        Higher-timeframe rows that are still forming relative to the base series are ignored
        and rebuilt from the base candles; closed buckets missing from the higher-timeframe
        history are aggregated from base candles when available.
        """
        base_hist = sorted(history.get(self.base, ()), key=lambda c: c.time)
        if not base_hist:
            return
        end = base_hist[-1].time + self.base_seconds
        for tf in self.timeframes:
            if tf == self.base:
                continue
            series = self.series[tf]
            sec = series.seconds
            closed = [c for c in sorted(history.get(tf, ()), key=lambda c: c.time) if c.time + sec <= end]
            # closed buckets the higher-timeframe history is missing (only whole buckets of base data)
            first = base_hist[0].time
            missing_from = closed[-1].time + sec if closed else -(-first // sec) * sec
            bucket_now = end - end % sec
            if missing_from < bucket_now:
                fill = [c for c in base_hist if missing_from <= c.time < bucket_now]
                closed.extend(aggregate(fill, tf, include_partial=False) if fill else [])
            for c in closed:
                series.push(c)
            assert series.aggregator is not None
            series.aggregator.reset([c for c in base_hist if c.time >= bucket_now] if end % sec else [])
        base_series = self.series[self.base]
        for c in base_hist:
            base_series.push(c)
        self.last_price = base_hist[-1].close

    def add(self, candle: Candle) -> list[str]:
        """Add a closed base candle; returns the timeframes that closed with it (base first).

        Candles at or before the latest base candle are ignored (duplicates / replays).
        """
        base_series = self.series[self.base]
        last = base_series.last_time
        if last is not None and candle.time <= last:
            return []
        base_series.push(candle)
        self.last_price = candle.close
        closed = [self.base]
        for tf in self.timeframes:
            if tf == self.base:
                continue
            series = self.series[tf]
            assert series.aggregator is not None
            for done in series.aggregator.add(candle, self.base_seconds):
                if series.last_time is None or done.time > series.last_time:
                    series.push(done)
                    if tf not in closed:
                        closed.append(tf)
        return closed

    # -- reading -------------------------------------------------------------

    def candles(self, timeframe: str, n: int | None = None) -> list[Candle]:
        closed = self.series[timeframe].closed
        if n is None or n >= len(closed):
            return list(closed)
        return list(closed)[-n:]

    def forming(self, timeframe: str) -> Candle | None:
        series = self.series[timeframe]
        return series.aggregator.forming if series.aggregator is not None else None

    def bars(self, timeframe: str) -> int:
        return self.series[timeframe].indicators.bars

    def features(self, timeframe: str) -> Features | None:
        series = self.series.get(timeframe)
        if series is None or series.indicators.last is None:
            return None
        return series.indicators.features()

    def snapshot(self, timeframe: str) -> IndicatorSnapshot | None:
        series = self.series.get(timeframe)
        if series is None or series.indicators.last is None:
            return None
        return series.indicators.snapshot()
