"""Historical candles for backtests: Binance when reachable, else the deterministic simulator.

``load_history`` is synchronous (backtests run in a worker process). Binance is probed with a
short connect timeout so an unreachable exchange costs a second or two, not a hang; the
simulator fallback is a pure function of ``(SIM_SEED, symbol, timeframe, start, end)``.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

import httpx

from ..config import get_config
from ..schemas import TIMEFRAME_SECONDS, Candle, FeedKind
from .binance import KLINE_PAGE, kline_to_candle
from .simulator import DAY, generate_history
from .symbols import normalize, to_exchange

log = logging.getLogger(__name__)

PROBE_TIMEOUT = 3.0
MAX_PAGES = 400  # 400k candles: far beyond any sensible backtest
SIM_BURN_IN_DAYS = 3


def _ts(dt: datetime) -> int:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return int(dt.timestamp())


def load_history(
    symbol: str,
    timeframe: str,
    start: datetime,
    end: datetime,
    *,
    seed: int | None = None,
    rest_url: str | None = None,
    allow_network: bool = True,
) -> tuple[list[Candle], FeedKind]:
    """Closed ``timeframe`` candles with ``start <= open time < end`` and their source."""
    sym = normalize(symbol)
    start_ts, end_ts = _ts(start), _ts(end)
    if end_ts <= start_ts:
        return [], "simulated"
    cfg = get_config()
    if allow_network and cfg.feed != "simulated":
        try:
            candles = _binance(sym, timeframe, start_ts, end_ts, rest_url or cfg.binance_rest_url)
            if candles:
                return candles, "binance"
        except (httpx.HTTPError, ValueError, KeyError, IndexError) as exc:
            log.info("backtest history: Binance unavailable (%s); using the simulator", type(exc).__name__)
    return simulated_history(sym, timeframe, start_ts, end_ts, cfg.sim_seed if seed is None else seed), "simulated"


def _binance(symbol: str, timeframe: str, start: int, end: int, rest_url: str) -> list[Candle]:
    sec = TIMEFRAME_SECONDS[timeframe]
    base = rest_url.rstrip("/")
    timeout = httpx.Timeout(15.0, connect=PROBE_TIMEOUT)
    now = datetime.now(UTC).timestamp()
    out: list[Candle] = []
    with httpx.Client(timeout=timeout) as client:
        client.get(f"{base}/api/v3/ping").raise_for_status()
        cursor = start
        for _ in range(MAX_PAGES):
            resp = client.get(
                f"{base}/api/v3/klines",
                params={
                    "symbol": to_exchange(symbol),
                    "interval": timeframe,
                    "startTime": cursor * 1000,
                    "endTime": end * 1000 - 1,
                    "limit": KLINE_PAGE,
                },
            )
            resp.raise_for_status()
            rows = resp.json()
            if not rows:
                break
            out.extend(kline_to_candle(r) for r in rows if int(r[6]) / 1000 < now)
            cursor = int(rows[-1][0]) // 1000 + sec
            if len(rows) < KLINE_PAGE or cursor >= end:
                break
    return [c for c in out if start <= c.time < end]


def simulated_history(symbol: str, timeframe: str, start: int, end: int, seed: int) -> list[Candle]:
    """Deterministic simulated candles for ``[start, end)``.

    The market is generated from a few burn-in days before ``start`` (so the process state is
    warmed up) to ``end`` and anchored so the final close is the asset's reference price.
    """
    sec = TIMEFRAME_SECONDS[timeframe]
    end_minute = end - end % 60
    origin = start // DAY - SIM_BURN_IN_DAYS
    days = end_minute // DAY - origin
    hist = generate_history(seed, [symbol], end_minute, days, origin_day=origin)
    minutes = hist.minutes[symbol]
    first_bucket = start - start % sec
    window = minutes.window(first_bucket - first_bucket % DAY, end_minute)
    candles = window.aggregate(sec).window(first_bucket, end - end % sec)
    return [c for c in candles.to_candles() if c.time >= start]
