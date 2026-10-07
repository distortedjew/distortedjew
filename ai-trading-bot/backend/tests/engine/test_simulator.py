"""Simulated market: determinism, timeframe consistency, history depth, live reveal, restarts."""

from __future__ import annotations

import numpy as np
import pytest

from tradebot.market.candles import aggregate
from tradebot.market.feed import CandleEvent, StoredMarket, TickerEvent, TickEvent
from tradebot.market.simulated import SimulatedFeed
from tradebot.market.simulator import RECENT_SUBSTEPS, asset_spec, generate_history
from tradebot.schemas import TIMEFRAME_SECONDS

END = 1_790_000_000 - 1_790_000_000 % 60  # 2026-09-21, minute aligned
SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT"]


class Clock:
    def __init__(self, now: float) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now


def _arrays_equal(a, b) -> bool:
    return all(np.array_equal(getattr(a, f), getattr(b, f)) for f in ("t", "o", "h", "lo", "c", "v"))


def test_history_is_deterministic_per_seed():
    a = generate_history(7, SYMBOLS[:2], END, 3)
    b = generate_history(7, SYMBOLS[:2], END, 3)
    c = generate_history(8, SYMBOLS[:2], END, 3)
    for sym in SYMBOLS[:2]:
        assert _arrays_equal(a.minutes[sym], b.minutes[sym])
        assert not np.array_equal(a.minutes[sym].c, c.minutes[sym].c)


def test_adding_a_symbol_does_not_change_the_others():
    alone = generate_history(7, ["BTC/USDT"], END, 3)
    together = generate_history(7, ["BTC/USDT", "SOL/USDT"], END, 3)
    assert _arrays_equal(alone.minutes["BTC/USDT"], together.minutes["BTC/USDT"])


def test_candles_are_well_formed_and_anchored():
    hist = generate_history(7, SYMBOLS, END, 3)
    for sym in SYMBOLS:
        m = hist.minutes[sym]
        assert np.all(m.h >= np.maximum(m.o, m.c)) and np.all(m.lo <= np.minimum(m.o, m.c))
        assert np.all(m.v > 0) and np.all(np.diff(m.t) == 60)
        assert np.all(m.o[1:] == m.c[:-1])  # every minute opens at the previous close
        assert m.c[-1] == pytest.approx(asset_spec(sym).price, rel=1e-3)  # BTC ≈ 97,000 on first open


def test_higher_timeframes_are_exact_aggregations():
    hist = generate_history(7, ["BTC/USDT"], END, 3)
    minutes = hist.minutes["BTC/USDT"].to_candles()
    for tf in ("5m", "15m", "1h", "4h"):
        sec = TIMEFRAME_SECONDS[tf]
        expected = aggregate(minutes, tf, include_partial=False)
        got = hist.candles("BTC/USDT", sec).to_candles()
        assert got[-50:] == expected[-50:]


def test_cross_asset_correlation_and_volatility_are_plausible():
    hist = generate_history(7, SYMBOLS, END, 120)
    daily = {s: np.diff(np.log(hist.minutes[s].aggregate(86_400).c)) for s in SYMBOLS}
    assert 1.5 < daily["BTC/USDT"].std() * 100 < 4.5
    assert daily["SOL/USDT"].std() > daily["BTC/USDT"].std()
    assert np.corrcoef(daily["BTC/USDT"], daily["ETH/USDT"])[0, 1] > 0.5
    assert np.corrcoef(daily["BTC/USDT"], daily["SOL/USDT"])[0, 1] > 0.4


@pytest.fixture(scope="module")
def opened_feed():
    clock = Clock(END + 0.2)
    feed = SimulatedFeed(7, clock=clock)
    import asyncio

    history = asyncio.run(feed.open(["BTC/USDT", "ETH/USDT"], StoredMarket()))
    return feed, history, clock


def test_fresh_history_fills_every_chart(opened_feed):
    _feed, history, _clock = opened_feed
    assert history.generated and history.end == END
    per_tf = history.candles["BTC/USDT"]
    assert len(per_tf["1d"]) >= 365
    for tf in ("1m", "5m", "15m", "1h", "4h"):
        assert len(per_tf[tf]) >= 500, tf
    minutes = per_tf["1m"].to_candles()
    hours = per_tf["1h"].to_candles()
    rebuilt = aggregate([c for c in minutes if c.time >= hours[-30].time], "1h", include_partial=False)
    assert rebuilt == hours[-30:]
    # closed candles only: nothing at or after the live minute
    assert all(arr.t[-1] + TIMEFRAME_SECONDS[tf] <= END for tf, arr in per_tf.items())


def test_live_ticks_once_per_second_and_minutes_close_on_the_generated_candle():
    clock = Clock(END + 0.2)
    feed = SimulatedFeed(7, clock=clock)
    import asyncio

    asyncio.run(feed.open(["BTC/USDT"], StoredMarket()))
    block = feed.block
    assert block is not None
    expected = block.candles("BTC/USDT", RECENT_SUBSTEPS).window(END, END + 300).to_candles()
    events: list = []
    for second in range(1, 301):
        feed.advance(END + second + 0.1, events.append)
    ticks = [e for e in events if isinstance(e, TickEvent)]
    assert len(ticks) >= 300  # one forming tick per second (+ one per minute close)
    closed_1m = [e.candle for e in events if isinstance(e, CandleEvent) and e.closed and e.timeframe == "1m"]
    assert closed_1m == expected
    closed_5m = [e.candle for e in events if isinstance(e, CandleEvent) and e.closed and e.timeframe == "5m"]
    assert closed_5m == aggregate(expected, "5m", include_partial=False)
    forming = [e.candle for e in events if isinstance(e, CandleEvent) and not e.closed and e.timeframe == "1m"]
    assert all(c.low <= c.close <= c.high for c in forming)
    tickers = [e.ticker for e in events if isinstance(e, TickerEvent)]
    assert tickers and tickers[-1].symbol == "BTC/USDT" and tickers[-1].high_24h >= tickers[-1].price


def test_restart_regenerates_the_gap_exactly():
    import asyncio

    clock = Clock(END + 0.2)
    first = SimulatedFeed(7, clock=clock)
    history = asyncio.run(first.open(["BTC/USDT"], StoredMarket()))
    events: list = []
    first.advance(END + 7 * 60 + 0.5, events.append)
    live = [e.candle for e in events if isinstance(e, CandleEvent) and e.closed and e.timeframe == "1m"]
    assert len(live) == 7
    # the engine crashed after storing the first three live minutes
    stored_minutes = [*history.candles["BTC/USDT"]["1m"].to_candles(), *live[:3]]
    last = live[2]
    day_start = last.time - last.time % 86_400
    stored = StoredMarket(
        last_1m={"BTC/USDT": last},
        recent_1m={"BTC/USDT": [c for c in stored_minutes if c.time >= day_start]},
        sim_state=first.state(),
    )
    second = SimulatedFeed(7, clock=Clock(END + 7 * 60 + 0.5))
    gap = asyncio.run(second.open(["BTC/USDT"], stored))
    assert not gap.generated
    assert gap.candles["BTC/USDT"]["1m"].to_candles() == live[3:]
    # and the live stream continues with the very same next minute
    more: list = []
    second.advance(END + 8 * 60 + 0.5, more.append)
    first.advance(END + 8 * 60 + 0.5, events.append)
    nxt_a = [e.candle for e in events if isinstance(e, CandleEvent) and e.closed and e.timeframe == "1m"][-1]
    nxt_b = [e.candle for e in more if isinstance(e, CandleEvent) and e.closed and e.timeframe == "1m"][-1]
    assert nxt_a == nxt_b


def test_unknown_symbols_get_a_stable_profile():
    a, b = asset_spec("PEPE/USDT"), asset_spec("pepe-usdt")
    assert a == b and a.price > 0 and 0.03 < a.daily_vol < 0.08
