"""Chart data: candle windows with indicator overlays, trade markers and price levels.

Overlays are computed over extra history loaded before the first visible candle, so
the lines are settled where the chart starts: ~5× the slowest EMA (EMA 200) and, on
intraday charts, a whole UTC session for the session-anchored VWAP. The WebSocket
hub computes its per-candle ``overlay_values`` over the same depth, so live updates
continue the REST series seamlessly.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from datetime import datetime

from ..db import Database
from ..indicators import overlay_series
from ..schemas import (
    TIMEFRAME_SECONDS,
    TIMEFRAMES,
    Candle,
    ChartMarker,
    IndicatorSeries,
    Position,
    PriceLevel,
    Side,
    Timeframe,
    Trade,
)
from . import queries

EMA_WARMUP_BARS = 1_000
MAX_MARKER_TRADES = 500
DETAIL_LEAD_BARS = 60
DETAIL_TAIL_BARS = 30
DETAIL_MAX_BARS = 1_000
_DAY = 86_400
_EXIT_PREFIX = {"SIGNAL_REVERSAL": "Reversal", "TIME_EXIT": "Time exit", "KILL_SWITCH": "Kill switch"}


def warmup_bars(timeframe: str) -> int:
    session = _DAY // TIMEFRAME_SECONDS[timeframe] if timeframe != "1d" else 0
    return max(EMA_WARMUP_BARS, session)


def snap(ts: int, timeframe: str) -> int:
    """Open time of the ``timeframe`` candle containing ``ts`` (candles are epoch-aligned)."""
    return ts - ts % TIMEFRAME_SECONDS[timeframe]


def trim_series(series: IndicatorSeries, start: int) -> IndicatorSeries:
    return IndicatorSeries(**{name: [p for p in points if p.time >= start] for name, points in series})


def chart_window(
    db: Database, symbol: str, timeframe: Timeframe, limit: int
) -> tuple[list[Candle], IndicatorSeries]:
    """The latest ``limit`` candles (the last one forming) and their overlay series."""
    candles = queries.latest_candles(db, symbol, timeframe, limit + warmup_bars(timeframe))
    if not candles:
        return [], IndicatorSeries()
    series = overlay_series(candles, timeframe)
    visible = candles[-limit:]
    return visible, trim_series(series, visible[0].time)


# --------------------------------------------------------------------------
# Markers and levels
# --------------------------------------------------------------------------


def entry_marker(
    *,
    trade_id: str,
    side: Side,
    opened_at: datetime,
    price: float,
    confidence: float | None,
    timeframe: str,
) -> ChartMarker:
    label = side + (f" {confidence:.0f}%" if confidence is not None else "")
    return ChartMarker(
        time=snap(int(opened_at.timestamp()), timeframe),
        kind="entry_long" if side == "LONG" else "entry_short",
        price=price,
        label=label,
        trade_id=trade_id,
    )


def exit_marker(trade: Trade, timeframe: str) -> ChartMarker:
    if trade.exit_reason == "TAKE_PROFIT":
        kind, prefix = "take_profit", "TP"
    elif trade.exit_reason == "STOP_LOSS":
        kind, prefix = "stop_loss", "SL"
    else:
        kind = "exit_win" if trade.result == "WIN" else "exit_loss"
        prefix = _EXIT_PREFIX.get(trade.exit_reason, "Exit")
    return ChartMarker(
        time=snap(int(trade.closed_at.timestamp()), timeframe),
        kind=kind,
        price=trade.exit_price,
        label=f"{prefix} {trade.pnl_pct:+.2f}%",
        trade_id=trade.id,
    )


def trade_markers(trade: Trade, timeframe: str) -> list[ChartMarker]:
    return [
        entry_marker(
            trade_id=trade.id,
            side=trade.side,
            opened_at=trade.opened_at,
            price=trade.entry_price,
            confidence=trade.ai_confidence,
            timeframe=timeframe,
        ),
        exit_marker(trade, timeframe),
    ]


def position_markers(position: Position, timeframe: str) -> list[ChartMarker]:
    return [
        entry_marker(
            trade_id=position.id,
            side=position.side,
            opened_at=position.opened_at,
            price=position.entry_price,
            confidence=position.ai_confidence,
            timeframe=timeframe,
        )
    ]


def markers_for(
    trades: Iterable[Trade], positions: Iterable[Position], timeframe: str, first: int, last: int
) -> list[ChartMarker]:
    """Entry/exit markers that fall on the visible candles, in time order (exits first on a tie)."""
    markers = [m for t in trades for m in trade_markers(t, timeframe)]
    markers += [m for p in positions for m in position_markers(p, timeframe)]
    visible = [m for m in markers if first <= m.time <= last]
    return sorted(visible, key=lambda m: (m.time, m.kind.startswith("entry")))


def position_levels(positions: Sequence[Position]) -> list[PriceLevel]:
    levels: list[PriceLevel] = []
    for p in positions:
        common = {"position_id": p.id, "side": p.side}
        levels.append(PriceLevel(kind="entry", price=p.entry_price, label=f"{p.side} entry", **common))
        levels.append(PriceLevel(kind="stop_loss", price=p.stop_loss, label="SL", **common))
        levels.append(PriceLevel(kind="take_profit", price=p.take_profit, label="TP", **common))
    return levels


# --------------------------------------------------------------------------
# Position / trade detail charts
# --------------------------------------------------------------------------


def detail_timeframe(base: Timeframe, opened_at: datetime, closed_at: datetime) -> Timeframe:
    """``base`` or the first higher timeframe on which the trade (plus margins) fits the chart."""
    span = max(0.0, (closed_at - opened_at).total_seconds())
    index = TIMEFRAMES.index(base)
    while index < len(TIMEFRAMES) - 1 and (
        span / TIMEFRAME_SECONDS[TIMEFRAMES[index]] + DETAIL_LEAD_BARS + DETAIL_TAIL_BARS > DETAIL_MAX_BARS
    ):
        index += 1
    return TIMEFRAMES[index]


def detail_candles(
    db: Database,
    symbol: str,
    timeframe: Timeframe,
    opened_at: datetime,
    closed_at: datetime | None,
    now: datetime,
) -> list[Candle]:
    """Candles from a margin before the entry to a margin after the exit (to now while open)."""
    step = TIMEFRAME_SECONDS[timeframe]
    start = snap(int(opened_at.timestamp()), timeframe) - DETAIL_LEAD_BARS * step
    if closed_at is None:
        end = snap(int(now.timestamp()), timeframe)
    else:
        end = snap(int(closed_at.timestamp()), timeframe) + DETAIL_TAIL_BARS * step
    return queries.candles_between(db, symbol, timeframe, start, end)[-DETAIL_MAX_BARS:]
