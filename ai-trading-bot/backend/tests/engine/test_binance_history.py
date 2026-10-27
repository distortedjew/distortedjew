"""Binance adapter (respx REST, fake WebSocket) and backtest history loading."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime

import httpx
import pytest
import respx

from tradebot.market import symbols
from tradebot.market.binance import BinanceFeed, stream_names
from tradebot.market.feed import CandleEvent, FeedUnavailable, StatusEvent, StoredMarket, TickerEvent
from tradebot.market.history import load_history

REST = "https://binance.test"
NOW = 1_790_000_000


def kline(t: int, sec: int, price: float = 100.0) -> list:
    return [
        t * 1000,
        str(price),
        str(price + 1),
        str(price - 1),
        str(price + 0.5),
        "12.5",
        (t + sec) * 1000 - 1,
    ]


def test_symbol_mapping_and_stream_names():
    assert symbols.to_exchange("BTC/USDT") == "BTCUSDT" and symbols.from_exchange("ETHUSDT") == "ETH/USDT"
    assert symbols.normalize("sol-usdt") == "SOL/USDT"
    names = stream_names(["BTC/USDT"])
    assert names == [f"btcusdt@kline_{tf}" for tf in ("1m", "5m", "15m", "1h", "4h", "1d")] + [
        "btcusdt@ticker"
    ]


class FakeWS:
    def __init__(self, frames: list[str]) -> None:
        self.frames = list(frames)
        self.closed = False

    async def recv(self) -> str:
        if not self.frames:
            await asyncio.sleep(3600)
        return self.frames.pop(0)

    async def close(self) -> None:
        self.closed = True


@respx.mock
async def test_open_backfills_and_streams_klines_and_tickers():
    respx.get(f"{REST}/api/v3/ping").mock(return_value=httpx.Response(200, json={}))

    def klines(request: httpx.Request) -> httpx.Response:
        interval = request.url.params["interval"]
        sec = {"1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400}[interval]
        end = NOW - NOW % sec
        rows = [kline(end - (k + 1) * sec, sec) for k in reversed(range(3))] + [kline(end, sec)]  # + forming
        return httpx.Response(200, json=rows)

    respx.get(f"{REST}/api/v3/klines").mock(side_effect=klines)
    frames = [
        json.dumps({"stream": "btcusdt@kline_1m", "data": {"e": "kline", "E": NOW * 1000, "s": "BTCUSDT",
                    "k": {"t": (NOW - NOW % 60) * 1000, "i": "1m", "o": "1", "h": "2", "l": "0.5", "c": "1.5",
                          "v": "3", "x": True}}}),
        json.dumps({"stream": "btcusdt@ticker", "data": {"e": "24hrTicker", "E": NOW * 1000, "s": "BTCUSDT",
                    "c": "101", "p": "1", "P": "1.0", "h": "102", "l": "99", "v": "1000", "q": "100000"}}),
    ]  # fmt: skip
    ws = FakeWS(frames)
    connects: list[str] = []

    async def connect(url, **kw):
        connects.append(url)
        return ws

    feed = BinanceFeed(REST, "wss://stream.test", clock=lambda: NOW, connect=connect)
    history = await feed.open(["BTC/USDT"], StoredMarket())
    assert all(len(history.candles["BTC/USDT"][tf]) == 3 for tf in ("1m", "1h", "1d"))  # forming one dropped
    assert "btcusdt@kline_1m" in connects[0] and "btcusdt@ticker" in connects[0]
    events: list = []
    task = asyncio.create_task(feed.run(events.append))
    await asyncio.sleep(0.05)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert isinstance(events[0], StatusEvent) and events[0].connected
    candle = next(e for e in events if isinstance(e, CandleEvent))
    assert candle.closed and candle.symbol == "BTC/USDT" and candle.candle.close == 1.5
    ticker = next(e for e in events if isinstance(e, TickerEvent)).ticker
    assert ticker.symbol == "BTC/USDT" and ticker.price == 101 and ticker.change_24h_pct == 1.0
    assert ws.closed


@respx.mock
async def test_unreachable_binance_fails_fast():
    respx.get(f"{REST}/api/v3/ping").mock(side_effect=httpx.ConnectError("blocked"))
    feed = BinanceFeed(REST, "wss://stream.test", connect_timeout=1.0)
    t0 = asyncio.get_running_loop().time()
    with pytest.raises(FeedUnavailable):
        await feed.open(["BTC/USDT"], StoredMarket())
    assert asyncio.get_running_loop().time() - t0 < 2.0
    respx.get(f"{REST}/api/v3/ping").mock(return_value=httpx.Response(403))
    with pytest.raises(FeedUnavailable, match="403"):
        await feed.open(["BTC/USDT"], StoredMarket())


def test_simulated_history_is_deterministic_and_in_range():
    start, end = datetime(2025, 3, 1, tzinfo=UTC), datetime(2025, 3, 11, tzinfo=UTC)
    a, source = load_history("BTC/USDT", "1h", start, end, seed=3, allow_network=False)
    b, _ = load_history("BTC/USDT", "1h", start, end, seed=3, allow_network=False)
    assert source == "simulated" and a == b and len(a) == 240
    assert a[0].time == int(start.timestamp()) and all(
        y.time - x.time == 3600 for x, y in zip(a, a[1:], strict=False)
    )


@respx.mock
def test_binance_history_pages_forward(monkeypatch):
    start, end = datetime(2025, 3, 1, tzinfo=UTC), datetime(2025, 3, 1, 0, 30, tzinfo=UTC)
    s0, s1 = int(start.timestamp()), int(end.timestamp())
    respx.get(f"{REST}/api/v3/ping").mock(return_value=httpx.Response(200, json={}))
    calls: list[int] = []

    def klines(request: httpx.Request) -> httpx.Response:
        cursor = int(request.url.params["startTime"]) // 1000
        calls.append(cursor)
        limit = int(request.url.params["limit"])
        rows = [kline(t, 60) for t in range(cursor, s1, 60)][:limit]
        return httpx.Response(200, json=rows)

    respx.get(f"{REST}/api/v3/klines").mock(side_effect=klines)
    monkeypatch.setattr("tradebot.market.history.KLINE_PAGE", 10)
    candles, source = load_history("BTC/USDT", "1m", start, end, rest_url=REST)
    assert source == "binance" and len(candles) == 30 and calls[:2] == [s0, s0 + 600] and len(calls) == 3
