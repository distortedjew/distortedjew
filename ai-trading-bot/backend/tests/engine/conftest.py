"""Shared helpers for the engine tests: temporary databases and synthetic market data."""

from __future__ import annotations

import math
import random
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path

import pytest

from tradebot.ai.base import MarketContext
from tradebot.db import Database
from tradebot.market.candles import CandleBook
from tradebot.mtf import build_report
from tradebot.regime import RegimeTracker, classify
from tradebot.schemas import BotSettings, Candle, RegimeState

T0 = 1_767_225_600  # 2026-01-01 00:00 UTC


@pytest.fixture
def db(tmp_path: Path) -> Database:
    database = Database(tmp_path / "engine.db").init()
    yield database
    database.close()


def path_candles(
    closes: Sequence[float], *, start: int = T0, step: int = 60, wick: float = 0.0004, volume: float = 10.0
) -> list[Candle]:
    """Candles whose closes follow ``closes`` (open = previous close, small symmetric wicks)."""
    out: list[Candle] = []
    prev = closes[0]
    for i, close in enumerate(closes):
        hi = max(prev, close) * (1 + wick)
        lo = min(prev, close) * (1 - wick)
        out.append(Candle(time=start + i * step, open=prev, high=hi, low=lo, close=close, volume=volume))
        prev = close
    return out


def random_walk(
    n: int, *, start_price: float = 100.0, drift: float = 0.0, vol: float = 0.002, seed: int = 1
) -> list[float]:
    rng = random.Random(seed)
    price = start_price
    out = []
    for _ in range(n):
        price *= math.exp(drift + rng.gauss(0.0, vol))
        out.append(price)
    return out


def walk_candles(
    n: int,
    *,
    start: int = T0,
    step: int = 60,
    start_price: float = 100.0,
    drift: float = 0.0,
    vol: float = 0.002,
    seed: int = 1,
) -> list[Candle]:
    """OHLC candles from a seeded random walk with intrabar noise and varying volume."""
    rng = random.Random(seed * 7919 + 1)
    closes = random_walk(n, start_price=start_price, drift=drift, vol=vol, seed=seed)
    out: list[Candle] = []
    prev = start_price
    for i, close in enumerate(closes):
        span = abs(close - prev) + prev * vol * rng.random()
        hi = max(prev, close) + span * rng.random() * 0.5
        lo = min(prev, close) - span * rng.random() * 0.5
        vol_units = 5.0 + 10.0 * rng.random()
        out.append(Candle(time=start + i * step, open=prev, high=hi, low=lo, close=close, volume=vol_units))
        prev = close
    return out


def context_from(
    candles_1m: Sequence[Candle],
    *,
    symbol: str = "BTC/USDT",
    timeframe: str = "5m",
    settings: BotSettings | None = None,
    regime: RegimeState | None = None,
) -> MarketContext:
    """A decision context after feeding 1m candles through a candle book (as the core does)."""
    book = CandleBook(symbol, "1m")
    for c in candles_1m:
        book.add(c)
    ts = datetime.fromtimestamp(candles_1m[-1].time + 60, UTC)
    features = {tf: f for tf in book.timeframes if (f := book.features(tf)) is not None}
    snapshots = {tf: s for tf in book.timeframes if (s := book.snapshot(tf)) is not None}
    if regime is None:
        tracker = RegimeTracker(symbol)
        regime, _ = tracker.update(classify(features.get(timeframe)), ts)
    mtf = build_report(symbol, features, ts)
    return MarketContext(
        symbol=symbol,
        timeframe=timeframe,  # type: ignore[arg-type]
        ts=ts,
        price=candles_1m[-1].close,
        features=features,
        snapshots=snapshots,
        mtf=mtf,
        regime=regime,
        candles=book.candles(timeframe, 30),
        position=None,
        equity=10_000.0,
        settings=settings or BotSettings(),
    )
