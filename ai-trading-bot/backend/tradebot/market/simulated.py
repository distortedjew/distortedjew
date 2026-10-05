"""Live simulated feed: reveals the generated market once per second per symbol.

The minutes come from ``simulator.MarketSimulator`` day blocks; within a minute the price
walks the minute's 60-step Brownian bridge (one step per second), so the forming candle
grows naturally and closes exactly on the candle the history generator would have produced.

Restarts are exact: the simulator state at the start of the current UTC day is persisted
(``state()``), so the gap since the last stored candle is regenerated from the same random
streams. Without a saved state the market continues from the last stored close.
"""

from __future__ import annotations

import asyncio
import logging
import math
import time
from collections import deque
from collections.abc import Callable, Sequence

import numpy as np

from ..schemas import TIMEFRAME_SECONDS, TIMEFRAMES, Candle, Ticker
from .candles import Aggregator, aggregate
from .feed import CandleEvent, Emit, Feed, MarketHistory, StatusEvent, StoredMarket, TickerEvent, TickEvent
from .simulator import (
    DAY,
    MINUTES,
    RECENT_SUBSTEPS,
    DayBlock,
    MarketSimulator,
    MarketState,
    MinuteArrays,
    _copy_state,
    _round,
    generate_history,
)
from .symbols import normalize, qty_decimals, tick_size

log = logging.getLogger(__name__)

HISTORY_DAYS = 400  # ≥ 365 daily candles plus warm-up
# Days of each timeframe returned on an empty database (retention keeps 1m 14 d, 5m 60 d, 15m 180 d).
DEPTH_DAYS: dict[str, int | None] = {"1m": 14, "5m": 60, "15m": 180, "1h": None, "4h": None, "1d": None}
MAX_GAP_DAYS = 400
STATE_VERSION = 1


def _utc_day(ts: int) -> int:
    return ts // DAY


class _Live:
    """Per-symbol state of the minute being revealed."""

    __slots__ = (
        "cum_volume",
        "high",
        "last",
        "low",
        "minute_volume",
        "open",
        "prices",
        "tick",
        "vol_decimals",
        "window",
        "window_quote",
        "window_volume",
    )

    def __init__(self) -> None:
        self.prices: list[float] = []
        self.cum_volume: list[float] = []
        self.open = self.high = self.low = self.last = 0.0
        self.minute_volume = 0.0
        self.tick = 0.01
        self.vol_decimals = 4
        self.window: deque[Candle] = deque(maxlen=MINUTES)  # last 24 h of closed 1m candles
        self.window_volume = 0.0
        self.window_quote = 0.0


class SimulatedFeed(Feed):
    kind = "simulated"

    def __init__(
        self,
        seed: int,
        *,
        minute_days: int = 16,
        clock: Callable[[], float] = time.time,
    ) -> None:
        super().__init__()
        self.seed = int(seed)
        self.minute_days = max(DEPTH_DAYS["1m"] or 14, minute_days)
        self.clock = clock
        self.sim: MarketSimulator | None = None
        self.block: DayBlock | None = None
        self.day_state: MarketState | None = None
        self._bridges: dict[str, np.ndarray] = {}
        self._live: dict[str, _Live] = {}
        self._aggs: dict[str, dict[str, Aggregator]] = {}
        self.minute = 0  # open time of the minute being revealed
        self.revealed = 0  # seconds of it already revealed (0..60)

    # ------------------------------------------------------------------
    # history
    # ------------------------------------------------------------------

    async def open(self, symbols: Sequence[str], stored: StoredMarket) -> MarketHistory:
        syms = [normalize(s) for s in symbols]
        self.symbols = syms
        now_minute = int(self.clock()) // 60 * 60
        have = [s for s in syms if s in stored.last_1m]
        if not have:
            history = self._fresh(syms, now_minute)
        else:
            history = self._resume(syms, stored, now_minute)
        self.connected = True
        self.message = "Simulated market (deterministic, seed %d)" % self.seed
        return history

    def _fresh(self, syms: list[str], end: int) -> MarketHistory:
        hist = generate_history(self.seed, syms, end, max(HISTORY_DAYS, self.minute_days + 1))
        self.sim = hist.simulator
        self.day_state = hist.day_state
        candles = {s: self._depth_candles(hist.minutes[s], end) for s in syms}
        self._start_live(hist.current, end, {s: hist.minutes[s].window(end - DAY, end) for s in syms})
        return MarketHistory(candles=candles, end=end, generated=True)

    def _depth_candles(self, minutes: MinuteArrays, end: int) -> dict[str, list[Candle]]:
        out: dict[str, list[Candle]] = {}
        for tf in TIMEFRAMES:
            sec = TIMEFRAME_SECONDS[tf]
            days = self.minute_days if tf == "1m" else DEPTH_DAYS[tf]
            since = None if days is None else (end // DAY - days) * DAY
            agg = minutes.aggregate(sec)
            out[tf] = agg.window(since, end - end % sec).to_candles()
        return out

    def _resume(self, syms: list[str], stored: StoredMarket, end: int) -> MarketHistory:
        """Regenerate the gap since the last stored candle, then continue live."""
        have = [s for s in syms if s in stored.last_1m]
        new = [s for s in syms if s not in stored.last_1m]
        earliest = min(stored.last_1m[s].time for s in have)
        state = self._saved_state(stored, have, earliest)
        today = _utc_day(end)
        if today - state.day > MAX_GAP_DAYS:
            # very long downtime: skip ahead instead of generating years of candles
            state = MarketSimulator.initial_state(self.seed, today - 1)
            state.assets = {s: _asset_at(stored.last_1m[s].close) for s in have}
        sim = MarketSimulator(self.seed, have, state)
        candles: dict[str, dict[str, list[Candle]]] = {}
        gap: dict[str, list[MinuteArrays]] = {s: [] for s in have}
        aligned: set[str] = set()
        day_state = _copy_state(sim.state)
        current: DayBlock | None = None
        while sim.state.day <= today:
            day_state = _copy_state(sim.state)
            block = sim.next_day()
            self._align(block, sim, day_state, stored, have, aligned)
            for s in have:
                last_end = stored.last_1m[s].time + 60
                lo = max(last_end, block.start)
                hi = min(end, block.start + DAY)
                if lo < hi:
                    gap[s].append(block.candles(s, RECENT_SUBSTEPS).window(lo, hi))
            current = block
        assert current is not None
        recent: dict[str, MinuteArrays] = {}
        for s in have:
            last = stored.last_1m[s]
            prior = sorted((c for c in stored.recent_1m.get(s, []) if c.time <= last.time), key=lambda c: c.time)
            parts = [_arrays(prior)] if prior else [_arrays([last])]
            parts.extend(p for p in gap[s] if len(p))
            combined = MinuteArrays.concat(parts)
            candles[s] = _gap_candles(combined, last.time + 60, end)
            recent[s] = combined.window(end - DAY, end)
        # symbols without stored data: full history on the same market path
        if new:
            hist = generate_history(
                self.seed, new, end, max(HISTORY_DAYS, self.minute_days + 1), origin_day=self._origin(state, end)
            )
            for s in new:
                candles[s] = self._depth_candles(hist.minutes[s], end)
                recent[s] = hist.minutes[s].window(end - DAY, end)
                day_state.assets[s] = hist.day_state.assets[s]
                sim.state.assets[s] = hist.simulator.state.assets[s]
        if new:
            current, sim_after = _regenerate(self.seed, day_state, syms)
            sim = sim_after
        self.sim = sim
        self.day_state = day_state
        self._start_live(current, end, recent)
        return MarketHistory(candles=candles, end=end, generated=False)

    def _saved_state(self, stored: StoredMarket, have: list[str], earliest: int) -> MarketState:
        data = stored.sim_state or {}
        state: MarketState | None = None
        if data.get("version") == STATE_VERSION and data.get("seed") == self.seed and "state" in data:
            try:
                state = MarketState.from_dict(data["state"])
            except (TypeError, KeyError, ValueError):
                state = None
        if state is not None and (state.day > _utc_day(earliest) or any(s not in state.assets for s in have)):
            state = None
        if state is None:
            # no usable saved state: continue from the stored closes on a fresh market path
            state = MarketSimulator.initial_state(self.seed, _utc_day(earliest))
            state.assets = {s: _asset_at(stored.last_1m[s].close) for s in have}
        return state

    def _align(
        self,
        block: DayBlock,
        sim: MarketSimulator,
        day_state: MarketState,
        stored: StoredMarket,
        have: list[str],
        aligned: set[str],
    ) -> None:
        """Shift each asset so the regenerated path passes through its last stored close."""
        deltas = np.zeros(len(block.symbols))
        for s in have:
            if s in aligned:
                continue
            last = stored.last_1m[s]
            idx = (last.time - block.start) // 60
            if idx >= MINUTES:
                continue  # stored data ends after this day: align on a later block
            regen = block.logp_open[block.index(s)] if idx < 0 else block.logp[idx, block.index(s)]
            delta = math.log(last.close) - float(regen)
            if abs(delta) > 1e-12:
                deltas[block.index(s)] = delta
                sim.state.assets[s].logp += delta
                day_state.assets[s].logp += delta
            aligned.add(s)
        if np.any(deltas):
            block.shift(deltas)

    def _origin(self, state: MarketState, end: int) -> int | None:
        """Origin day to replay for new symbols: the original one when it yields a full history."""
        if state.origin_day and _utc_day(end) - state.origin_day >= max(HISTORY_DAYS, self.minute_days + 1):
            return state.origin_day
        return None

    def state(self) -> dict | None:
        if self.day_state is None:
            return None
        return {"version": STATE_VERSION, "seed": self.seed, "state": self.day_state.to_dict()}

    async def add_symbols(self, symbols: Sequence[str], stored: StoredMarket) -> MarketHistory:
        """Add symbols mid-session; stored ones resume, new ones get history on the same path."""
        if self.sim is None or self.day_state is None or self.block is None:
            raise RuntimeError("feed not opened")
        adds = [normalize(s) for s in symbols if normalize(s) not in self.symbols]
        if not adds:
            return MarketHistory(candles={}, end=self.minute)
        end = self.minute
        candles: dict[str, dict[str, list[Candle]]] = {}
        recent: dict[str, MinuteArrays] = {}
        hist = generate_history(
            self.seed,
            adds,
            end,
            max(HISTORY_DAYS, self.minute_days + 1),
            origin_day=self._origin(self.day_state, end),
        )
        for s in adds:
            minutes = hist.minutes[s]
            last = stored.last_1m.get(s)
            if last is not None and len(minutes) and minutes.t[0] <= last.time < end:
                # a symbol traded before: continue its stored chart from its last stored close
                idx = int(np.searchsorted(minutes.t, last.time))
                shift = math.log(last.close) - math.log(float(minutes.c[idx]))
                tick = tick_size(last.close)
                scale = math.exp(shift)
                minutes = MinuteArrays(
                    minutes.t,
                    _round(minutes.o * scale, tick),
                    _round(minutes.h * scale, tick),
                    _round(minutes.lo * scale, tick),
                    _round(minutes.c * scale, tick),
                    minutes.v,
                )
                hist.day_state.assets[s].logp += shift
                gap_start = last.time + 60
                candles[s] = {
                    tf: [c for c in cs if c.time + TIMEFRAME_SECONDS[tf] > gap_start]
                    for tf, cs in self._depth_candles(minutes, end).items()
                }
            else:
                candles[s] = self._depth_candles(minutes, end)
            recent[s] = minutes.window(end - DAY, end)
            self.day_state.assets[s] = hist.day_state.assets[s]
        self.symbols = [*self.symbols, *adds]
        block, sim = _regenerate(self.seed, self.day_state, self.symbols)
        self.sim = sim
        revealed = self.revealed
        self._start_live(block, end, recent, symbols=adds)
        self.revealed = revealed
        for s in adds:
            self._begin_minute(s)
            self._reveal(s, revealed)
        return MarketHistory(candles=candles, end=end)

    # ------------------------------------------------------------------
    # live
    # ------------------------------------------------------------------

    def _start_live(
        self,
        block: DayBlock,
        end: int,
        recent: dict[str, MinuteArrays],
        symbols: Sequence[str] | None = None,
    ) -> None:
        """Position the live reveal at minute ``end`` of ``block`` (initialising ``symbols``)."""
        self.block = block
        self._bridges = {}
        self.minute = end
        targets = list(symbols) if symbols is not None else self.symbols
        for s in targets:
            live = _Live()
            arrays = recent.get(s)
            closed = arrays.to_candles() if arrays is not None and len(arrays) else []
            for c in closed[-MINUTES:]:
                live.window.append(c)
                live.window_volume += c.volume
                live.window_quote += c.volume * c.close
            self._live[s] = live
            aggs = {tf: Aggregator(tf) for tf in TIMEFRAMES if tf != "1m"}
            for tf, agg in aggs.items():
                sec = TIMEFRAME_SECONDS[tf]
                start = end - end % sec
                agg.reset([c for c in closed if c.time >= start] if end % sec else [])
            self._aggs[s] = aggs
        if symbols is None:
            self.revealed = 0
            for s in self.symbols:
                self._begin_minute(s)

    def _bridge(self, symbol: str) -> np.ndarray:
        assert self.block is not None
        path = self._bridges.get(symbol)
        if path is None:
            path = self.block.bridge(symbol, RECENT_SUBSTEPS)
            self._bridges[symbol] = path
        return path

    def _begin_minute(self, symbol: str) -> None:
        assert self.block is not None
        block = self.block
        m = (self.minute - block.start) // 60
        i = block.index(symbol)
        live = self._live[symbol]
        open_log = block.logp_open[i] if m == 0 else block.logp[m - 1, i]
        price_ref = float(np.exp(block.logp[-1, i]))
        live.tick = tick_size(price_ref)
        live.vol_decimals = qty_decimals(price_ref) + 1
        path = self._bridge(symbol)[m]
        prices = _round(np.exp(path), live.tick).tolist()
        prices[-1] = float(_round(np.exp(np.array([block.logp[m, i]])), live.tick)[0])
        live.prices = prices
        live.open = float(_round(np.exp(np.array([open_log])), live.tick)[0])
        live.high = live.low = live.last = live.open
        minute_volume = float(np.round(block.volume[m, i], live.vol_decimals))
        steps = np.abs(np.diff(np.r_[open_log, path]))
        weights = steps + steps.mean() + 1e-12
        live.cum_volume = (np.cumsum(weights) / weights.sum() * minute_volume).tolist()
        live.cum_volume[-1] = minute_volume
        live.minute_volume = minute_volume

    def _reveal(self, symbol: str, seconds: int) -> None:
        live = self._live[symbol]
        if seconds <= 0:
            return
        seg = live.prices[:seconds]
        live.high = max(live.high, max(seg))
        live.low = min(live.low, min(seg))
        live.last = seg[-1]

    def _forming_1m(self, symbol: str) -> Candle:
        live = self._live[symbol]
        vol = live.cum_volume[self.revealed - 1] if self.revealed > 0 else 0.0
        return Candle.model_construct(
            time=self.minute,
            open=live.open,
            high=live.high,
            low=live.low,
            close=live.last,
            volume=round(vol, live.vol_decimals),
        )

    def _close_minute(self, emit: Emit) -> None:
        """Finish the current minute for every symbol and emit the closed candles."""
        for s in self.symbols:
            self._reveal(s, RECENT_SUBSTEPS)
        self.revealed = RECENT_SUBSTEPS
        for s in self.symbols:
            live = self._live[s]
            candle = Candle.model_construct(
                time=self.minute,
                open=live.open,
                high=live.high,
                low=live.low,
                close=live.last,
                volume=live.minute_volume,
            )
            if len(live.window) == live.window.maxlen:
                old = live.window[0]
                live.window_volume -= old.volume
                live.window_quote -= old.volume * old.close
            live.window.append(candle)
            live.window_volume += candle.volume
            live.window_quote += candle.volume * candle.close
            emit(TickEvent(s, live.last, float(self.minute + 60)))
            emit(CandleEvent(s, "1m", candle, True))
            for tf, agg in self._aggs[s].items():
                for done in agg.add(candle, 60):
                    emit(CandleEvent(s, tf, done, True))  # type: ignore[arg-type]
        self.minute += 60
        self.revealed = 0
        if self.block is not None and self.minute >= self.block.start + DAY:
            self._next_block()
        for s in self.symbols:
            self._begin_minute(s)

    def _next_block(self) -> None:
        assert self.sim is not None
        self.day_state = _copy_state(self.sim.state)
        self.sim.ensure_assets(self.symbols)
        self.block = self.sim.next_day()
        self._bridges = {}

    def _emit_forming(self, emit: Emit, now: float) -> None:
        for s in self.symbols:
            live = self._live[s]
            forming = self._forming_1m(s)
            emit(TickEvent(s, live.last, now))
            emit(CandleEvent(s, "1m", forming, False))
            for tf, agg in self._aggs[s].items():
                base = agg.forming
                if base is None:
                    candle = forming.model_copy(update={"time": self.minute - self.minute % TIMEFRAME_SECONDS[tf]})
                else:
                    candle = Candle.model_construct(
                        time=base.time,
                        open=base.open,
                        high=max(base.high, forming.high),
                        low=min(base.low, forming.low),
                        close=forming.close,
                        volume=base.volume + forming.volume,
                    )
                emit(CandleEvent(s, tf, candle, False))  # type: ignore[arg-type]
            emit(TickerEvent(self._ticker(s, forming, now)))

    def _ticker(self, symbol: str, forming: Candle, now: float) -> Ticker:
        live = self._live[symbol]
        window = live.window
        start = int(now) - DAY
        first = next((c for c in window if c.time >= start), forming)
        open_24h = first.open
        highs = max((c.high for c in window if c.time >= start), default=forming.high)
        lows = min((c.low for c in window if c.time >= start), default=forming.low)
        price = forming.close
        change = price - open_24h
        return Ticker(
            symbol=symbol,
            price=price,
            change_24h=round(change, 10),
            change_24h_pct=round(change / open_24h * 100.0, 4) if open_24h else 0.0,
            high_24h=max(highs, forming.high),
            low_24h=min(lows, forming.low),
            volume_24h=round(live.window_volume + forming.volume, 4),
            quote_volume_24h=round(live.window_quote + forming.volume * price, 2),
            ts=_dt(now),
        )

    def advance(self, now: float, emit: Emit) -> None:
        """Reveal the market up to ``now`` (catching up whole minutes after a stall)."""
        target_minute = int(now) // 60 * 60
        while self.minute < target_minute:
            self._close_minute(emit)
        seconds = min(RECENT_SUBSTEPS - 1, int(now) - self.minute)
        if seconds > self.revealed:
            for s in self.symbols:
                self._reveal(s, seconds)
            self.revealed = seconds
        self._emit_forming(emit, now)

    async def run(self, emit: Emit) -> None:
        emit(StatusEvent(True, self.message))
        while True:
            now = self.clock()
            self.advance(now, emit)
            await asyncio.sleep(max(0.05, 1.0 - (self.clock() % 1.0)))


def _asset_at(price: float):
    from .simulator import AssetState

    return AssetState(logp=math.log(price))


def _arrays(candles: Sequence[Candle]) -> MinuteArrays:
    return MinuteArrays(
        np.array([c.time for c in candles], dtype=np.int64),
        np.array([c.open for c in candles]),
        np.array([c.high for c in candles]),
        np.array([c.low for c in candles]),
        np.array([c.close for c in candles]),
        np.array([c.volume for c in candles]),
    )


def _gap_candles(combined: MinuteArrays, gap_start: int, end: int) -> dict[str, list[Candle]]:
    """Closed candles of every timeframe touched by the gap ``[gap_start, end)``.

    ``combined`` holds 1m candles from 00:00 UTC of the last stored day through the gap, so
    every bucket that straddles the restart is rebuilt from complete minutes.
    """
    out: dict[str, list[Candle]] = {}
    minutes = combined.to_candles()
    for tf in TIMEFRAMES:
        sec = TIMEFRAME_SECONDS[tf]
        first_bucket = gap_start - gap_start % sec
        closed_end = end - end % sec
        if tf == "1m":
            out[tf] = [c for c in minutes if gap_start <= c.time < end]
            continue
        rel = [c for c in minutes if first_bucket <= c.time < closed_end]
        out[tf] = aggregate(rel, tf, include_partial=False) if rel else []
    return out


def _regenerate(seed: int, day_state: MarketState, symbols: Sequence[str]) -> tuple[DayBlock, MarketSimulator]:
    sim = MarketSimulator(seed, symbols, _copy_state(day_state))
    block = sim.next_day()
    return block, sim


def _dt(ts: float):
    from datetime import UTC, datetime

    return datetime.fromtimestamp(ts, UTC)
