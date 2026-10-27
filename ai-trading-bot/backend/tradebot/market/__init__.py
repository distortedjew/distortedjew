"""Market data: feeds (Binance, simulator), candle aggregation and backtest history."""

from .candles import Aggregator, CandleArrays, CandleBook, aggregate, floor_time, tf_seconds, timeframes_from
from .feed import (
    CandleEvent,
    Feed,
    FeedEvent,
    FeedUnavailable,
    MarketHistory,
    StatusEvent,
    StoredMarket,
    TickerEvent,
    TickEvent,
)

__all__ = [
    "Aggregator",
    "CandleArrays",
    "CandleBook",
    "CandleEvent",
    "Feed",
    "FeedEvent",
    "FeedUnavailable",
    "MarketHistory",
    "StatusEvent",
    "StoredMarket",
    "TickEvent",
    "TickerEvent",
    "aggregate",
    "floor_time",
    "tf_seconds",
    "timeframes_from",
]
