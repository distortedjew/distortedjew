"""Market-data feed abstraction shared by the Binance adapter and the simulator.

A feed has two phases:

1. ``open(symbols, stored)`` returns the closed candles the engine must persist and warm the
   trading core with: full history on an empty database, or only the gap since the last
   stored candle after a restart.
2. ``run(emit)`` streams events until cancelled: ``TickEvent`` (latest trade price),
   ``CandleEvent`` (forming and closed candles of every timeframe), ``TickerEvent`` (24h
   statistics) and ``StatusEvent`` (connection changes). ``emit`` is a plain synchronous
   callback; the engine queues the events and processes them in order.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field

from ..schemas import Candle, FeedKind, Ticker, Timeframe
from .candles import CandleArrays


class FeedUnavailable(RuntimeError):
    """The feed cannot deliver market data (unreachable, blocked, or misconfigured)."""


@dataclass(slots=True)
class TickEvent:
    symbol: str
    price: float
    ts: float  # unix seconds


@dataclass(slots=True)
class CandleEvent:
    symbol: str
    timeframe: Timeframe
    candle: Candle
    closed: bool


@dataclass(slots=True)
class TickerEvent:
    ticker: Ticker


@dataclass(slots=True)
class StatusEvent:
    connected: bool
    message: str | None = None


FeedEvent = TickEvent | CandleEvent | TickerEvent | StatusEvent
Emit = Callable[[FeedEvent], None]


@dataclass
class StoredMarket:
    """What the database already holds, so a feed only fills the gap after a restart."""

    last_1m: dict[str, Candle] = field(default_factory=dict)  # latest closed 1m candle per symbol
    recent_1m: dict[str, list[Candle]] = field(default_factory=dict)  # closed 1m since 00:00 UTC of that day
    sim_state: dict | None = None  # simulator state saved by the previous run


@dataclass
class MarketHistory:
    """Closed candles from a feed's ``open``: ``candles[symbol][timeframe]`` in time order."""

    candles: dict[str, dict[str, CandleArrays]]
    end: int  # unix seconds: the history covers candles closing at or before this time
    generated: bool = False  # simulator history created on an empty database

    def count(self) -> int:
        return sum(len(a) for tfs in self.candles.values() for a in tfs.values())


class Feed(ABC):
    kind: FeedKind

    def __init__(self) -> None:
        self.connected = False
        self.message: str | None = None
        self.symbols: list[str] = []

    @abstractmethod
    async def open(self, symbols: Sequence[str], stored: StoredMarket) -> MarketHistory:
        """Prepare the feed and return the history the engine must persist (raises FeedUnavailable)."""

    @abstractmethod
    async def run(self, emit: Emit) -> None:
        """Stream events until cancelled."""

    @abstractmethod
    async def add_symbols(self, symbols: Sequence[str], stored: StoredMarket) -> MarketHistory:
        """Start streaming more symbols; returns their history (or gap) like ``open``."""

    def remove_symbols(self, symbols: Sequence[str]) -> None:
        drop = set(symbols)
        self.symbols = [s for s in self.symbols if s not in drop]

    def state(self) -> dict | None:
        """Feed state worth persisting for an exact restart (simulator only)."""
        return None

    async def close(self) -> None:
        self.connected = False
