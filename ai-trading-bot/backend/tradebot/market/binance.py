"""Binance spot market data: REST kline backfill and the combined WebSocket stream.

- REST ``/api/v3/klines`` (1000 candles per page) for history and for filling gaps after a
  reconnect; ``/api/v3/ping`` as a fast reachability probe.
- One combined stream ``/stream?streams=...`` carrying ``<sym>@kline_<tf>`` for the six
  timeframes and ``<sym>@ticker`` (24h statistics) for every symbol.
- Reconnects forever with exponential backoff and full jitter; after each reconnect the
  closed candles missed while disconnected are fetched over REST and emitted in order.

Symbols are ``BTC/USDT`` outside this module and ``BTCUSDT`` on the wire.
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
import time
from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from typing import Any

import httpx
import websockets

from ..schemas import TIMEFRAME_SECONDS, TIMEFRAMES, Candle, Ticker
from .candles import CandleArrays
from .feed import (
    CandleEvent,
    Emit,
    Feed,
    FeedUnavailable,
    MarketHistory,
    StatusEvent,
    StoredMarket,
    TickerEvent,
    TickEvent,
)
from .symbols import from_exchange, normalize, to_exchange

log = logging.getLogger(__name__)

KLINE_PAGE = 1000
BACKFILL: dict[str, int] = {"1m": 1500, "5m": 1000, "15m": 1000, "1h": 1000, "4h": 1000, "1d": 1000}
MAX_GAP_PAGES = 10  # per timeframe after a restart / reconnect
BACKOFF_START = 1.0
BACKOFF_MAX = 60.0


def kline_to_candle(row: Sequence[Any]) -> Candle:
    """A REST kline array ``[open_ms, o, h, l, c, v, close_ms, ...]`` as a Candle."""
    return Candle(
        time=int(row[0]) // 1000,
        open=float(row[1]),
        high=float(row[2]),
        low=float(row[3]),
        close=float(row[4]),
        volume=float(row[5]),
    )


def ws_kline(k: dict[str, Any]) -> tuple[Candle, bool]:
    """A WebSocket kline object as ``(candle, closed)``."""
    candle = Candle(
        time=int(k["t"]) // 1000,
        open=float(k["o"]),
        high=float(k["h"]),
        low=float(k["l"]),
        close=float(k["c"]),
        volume=float(k["v"]),
    )
    return candle, bool(k.get("x"))


def ws_ticker(d: dict[str, Any]) -> Ticker:
    """A ``24hrTicker`` payload as a Ticker (the engine adds the sparkline)."""
    return Ticker(
        symbol=from_exchange(d["s"]),
        price=float(d["c"]),
        change_24h=float(d["p"]),
        change_24h_pct=float(d["P"]),
        high_24h=float(d["h"]),
        low_24h=float(d["l"]),
        volume_24h=float(d["v"]),
        quote_volume_24h=float(d["q"]),
        ts=datetime.fromtimestamp(int(d["E"]) / 1000, UTC),
    )


def stream_names(symbols: Sequence[str]) -> list[str]:
    names: list[str] = []
    for sym in symbols:
        ex = to_exchange(sym).lower()
        names.extend(f"{ex}@kline_{tf}" for tf in TIMEFRAMES)
        names.append(f"{ex}@ticker")
    return names


class _Resubscribe(Exception):
    """The symbol set changed: reconnect with the new stream list."""


class BinanceRest:
    """Minimal async client for the public market-data endpoints."""

    def __init__(self, base_url: str, *, connect_timeout: float = 5.0, read_timeout: float = 10.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = httpx.Timeout(read_timeout, connect=connect_timeout)

    async def _get(self, client: httpx.AsyncClient, path: str, params: dict[str, Any] | None = None) -> Any:
        try:
            resp = await client.get(f"{self.base_url}{path}", params=params)
        except httpx.HTTPError as exc:
            raise FeedUnavailable(f"Binance unreachable ({type(exc).__name__})") from exc
        if resp.status_code != 200:
            raise FeedUnavailable(f"Binance REST {path} returned HTTP {resp.status_code}")
        try:
            return resp.json()
        except ValueError as exc:
            raise FeedUnavailable("Binance REST returned invalid JSON") from exc

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=self.timeout)

    async def ping(self, client: httpx.AsyncClient) -> None:
        await self._get(client, "/api/v3/ping")

    async def klines(
        self,
        client: httpx.AsyncClient,
        symbol: str,
        interval: str,
        *,
        start: int | None = None,
        end: int | None = None,
        limit: int = KLINE_PAGE,
    ) -> list[list[Any]]:
        params: dict[str, Any] = {
            "symbol": to_exchange(symbol),
            "interval": interval,
            "limit": min(limit, KLINE_PAGE),
        }
        if start is not None:
            params["startTime"] = int(start) * 1000
        if end is not None:
            params["endTime"] = int(end) * 1000 - 1
        rows = await self._get(client, "/api/v3/klines", params)
        if not isinstance(rows, list):
            raise FeedUnavailable("Binance REST klines: unexpected payload")
        return rows

    async def history(
        self,
        client: httpx.AsyncClient,
        symbol: str,
        interval: str,
        *,
        start: int | None = None,
        end: int | None = None,
        limit: int | None = None,
        max_pages: int = MAX_GAP_PAGES,
    ) -> list[list[Any]]:
        """Klines in time order, paging forward from ``start`` or backward from ``end``/now."""
        sec = TIMEFRAME_SECONDS[interval]
        rows: list[list[Any]] = []
        if start is not None:
            cursor = start
            for _ in range(max_pages):
                page = await self.klines(client, symbol, interval, start=cursor, end=end)
                if not page:
                    break
                rows.extend(page)
                cursor = int(page[-1][0]) // 1000 + sec
                if len(page) < KLINE_PAGE or (end is not None and cursor >= end):
                    break
            return rows
        want = limit or KLINE_PAGE
        cursor_end = end
        while len(rows) < want:
            page = await self.klines(
                client, symbol, interval, end=cursor_end, limit=min(KLINE_PAGE, want - len(rows))
            )
            if not page:
                break
            rows = page + rows
            cursor_end = int(page[0][0]) // 1000
            if len(page) < KLINE_PAGE:
                break
        return rows


class BinanceFeed(Feed):
    kind = "binance"

    def __init__(
        self,
        rest_url: str,
        ws_url: str,
        *,
        connect_timeout: float = 5.0,
        ws_open_timeout: float = 8.0,
        clock: Callable[[], float] = time.time,
        connect: Callable[..., Any] = websockets.connect,
    ) -> None:
        super().__init__()
        self.rest = BinanceRest(rest_url, connect_timeout=connect_timeout)
        self.ws_url = ws_url.rstrip("/")
        self.ws_open_timeout = ws_open_timeout
        self.clock = clock
        self._connect = connect
        self._ws: Any = None
        self._last_closed: dict[tuple[str, str], int] = {}
        self._resubscribe = asyncio.Event()
        self.reconnects = 0

    # ------------------------------------------------------------------
    # history
    # ------------------------------------------------------------------

    async def open(self, symbols: Sequence[str], stored: StoredMarket) -> MarketHistory:
        """Probe REST and the WebSocket, then backfill (raises FeedUnavailable quickly if blocked)."""
        self.symbols = [normalize(s) for s in symbols]
        async with self.rest.client() as client:
            await self.rest.ping(client)
            history = await self._backfill(client, self.symbols, stored)
        self._ws = await self._open_ws()
        self.connected = True
        self.message = f"Binance live ({', '.join(to_exchange(s) for s in self.symbols)})"
        return history

    async def add_symbols(self, symbols: Sequence[str], stored: StoredMarket) -> MarketHistory:
        adds = [normalize(s) for s in symbols if normalize(s) not in self.symbols]
        if not adds:
            return MarketHistory(candles={}, end=self._now_minute())
        async with self.rest.client() as client:
            history = await self._backfill(client, adds, stored)
        self.symbols = [*self.symbols, *adds]
        self._resubscribe.set()
        return history

    def remove_symbols(self, symbols: Sequence[str]) -> None:
        super().remove_symbols(symbols)
        self._resubscribe.set()

    def _now_minute(self) -> int:
        return int(self.clock()) // 60 * 60

    async def _backfill(
        self, client: httpx.AsyncClient, symbols: Sequence[str], stored: StoredMarket
    ) -> MarketHistory:
        now = self.clock()
        candles: dict[str, dict[str, CandleArrays]] = {}
        for sym in symbols:
            per_tf: dict[str, CandleArrays] = {}
            last = stored.last_1m.get(sym)
            for tf in TIMEFRAMES:
                sec = TIMEFRAME_SECONDS[tf]
                if last is not None:
                    since = (last.time + 60) - (last.time + 60) % sec
                    rows = await self.rest.history(client, sym, tf, start=since)
                else:
                    rows = await self.rest.history(client, sym, tf, limit=BACKFILL[tf])
                # keep closed candles only: the forming one arrives on the stream
                closed = [kline_to_candle(r) for r in rows if int(r[6]) / 1000 < now]
                per_tf[tf] = CandleArrays.from_candles(closed)
                if closed:
                    self._last_closed[(sym, tf)] = closed[-1].time
            candles[sym] = per_tf
        return MarketHistory(candles=candles, end=self._now_minute())

    # ------------------------------------------------------------------
    # streaming
    # ------------------------------------------------------------------

    def _url(self) -> str:
        return f"{self.ws_url}/stream?streams={'/'.join(stream_names(self.symbols))}"

    async def _open_ws(self) -> Any:
        try:
            return await asyncio.wait_for(
                self._connect(self._url(), open_timeout=self.ws_open_timeout, max_size=2**22),
                timeout=self.ws_open_timeout + 2,
            )
        except (OSError, TimeoutError, websockets.exceptions.WebSocketException) as exc:
            raise FeedUnavailable(f"Binance WebSocket unreachable ({type(exc).__name__})") from exc

    async def run(self, emit: Emit) -> None:
        backoff = BACKOFF_START
        reconnecting = False
        while True:
            try:
                if self._ws is None:
                    self._ws = await self._open_ws()
                    if reconnecting:
                        self.reconnects += 1
                        await self._fill_gap(emit)
                self.connected = True
                self.message = f"Binance live ({', '.join(to_exchange(s) for s in self.symbols)})"
                emit(StatusEvent(True, self.message))
                reconnecting = False
                backoff = BACKOFF_START
                await self._consume(self._ws, emit)
            except _Resubscribe:
                await self._close_ws()
            except asyncio.CancelledError:
                await self._close_ws()
                raise
            except (FeedUnavailable, OSError, TimeoutError, websockets.exceptions.WebSocketException) as exc:
                await self._close_ws()
                delay = random.uniform(0.0, backoff)  # full jitter
                self.connected = False
                self.message = f"Binance stream lost ({type(exc).__name__}); reconnecting in {delay:.0f} s"
                log.warning("%s", self.message)
                emit(StatusEvent(False, self.message))
                reconnecting = True
                await asyncio.sleep(delay)
                backoff = min(BACKOFF_MAX, backoff * 2)

    async def _consume(self, ws: Any, emit: Emit) -> None:
        """Read frames until the socket fails or the symbol set changes."""
        resubscribe = asyncio.ensure_future(self._resubscribe.wait())
        try:
            while True:
                recv = asyncio.ensure_future(ws.recv())
                done, _ = await asyncio.wait({recv, resubscribe}, return_when=asyncio.FIRST_COMPLETED)
                if resubscribe in done:
                    recv.cancel()
                    self._resubscribe.clear()
                    raise _Resubscribe
                self._handle(recv.result(), emit)
        finally:
            if not resubscribe.done():
                resubscribe.cancel()

    def _handle(self, raw: str | bytes, emit: Emit) -> None:
        try:
            msg = json.loads(raw)
        except ValueError:
            log.warning("Binance: unparseable frame ignored")
            return
        data = msg.get("data", msg)
        event = data.get("e")
        if event == "kline":
            sym = from_exchange(data["s"])
            candle, closed = ws_kline(data["k"])
            tf = data["k"]["i"]
            if tf not in TIMEFRAME_SECONDS or sym not in self.symbols:
                return
            if closed:
                last = self._last_closed.get((sym, tf))
                if last is not None and candle.time <= last:
                    return
                self._last_closed[(sym, tf)] = candle.time
            emit(CandleEvent(sym, tf, candle, closed))  # type: ignore[arg-type]
            if tf == "1m":
                emit(TickEvent(sym, candle.close, int(data.get("E", 0)) / 1000 or self.clock()))
        elif event == "24hrTicker":
            ticker = ws_ticker(data)
            if ticker.symbol in self.symbols:
                emit(TickerEvent(ticker))
                emit(TickEvent(ticker.symbol, ticker.price, ticker.ts.timestamp()))

    async def _fill_gap(self, emit: Emit) -> None:
        """Emit the closed candles missed while disconnected (REST), oldest first."""
        now = self.clock()
        async with self.rest.client() as client:
            for sym in self.symbols:
                for tf in TIMEFRAMES:
                    last = self._last_closed.get((sym, tf))
                    if last is None:
                        continue
                    sec = TIMEFRAME_SECONDS[tf]
                    rows = await self.rest.history(client, sym, tf, start=last + sec)
                    for row in rows:
                        if int(row[6]) / 1000 >= now:
                            continue
                        candle = kline_to_candle(row)
                        if candle.time <= self._last_closed.get((sym, tf), -1):
                            continue
                        self._last_closed[(sym, tf)] = candle.time
                        emit(CandleEvent(sym, tf, candle, True))  # type: ignore[arg-type]

    async def _close_ws(self) -> None:
        ws, self._ws = self._ws, None
        if ws is not None:
            try:
                await ws.close()
            except Exception:  # noqa: BLE001 - closing a broken socket must never raise
                log.debug("Binance: error while closing the WebSocket", exc_info=True)

    async def close(self) -> None:
        await self._close_ws()
        self.connected = False
