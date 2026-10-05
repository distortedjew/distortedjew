"""Market data: chart snapshots, watchlist, multi-timeframe report and regimes."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Query

from ...db import utcnow
from ...schemas import TIMEFRAME_SECONDS, MarketSnapshot, MTFReport, RegimeReport, Ticker, Timeframe
from .. import charts, queries
from ..context import Ctx
from .common import NOT_PUBLISHED, SymbolQuery, resolve_symbol

router = APIRouter(prefix="/market", tags=["market"])

REGIME_HISTORY_DAYS = 30


@router.get("", response_model=MarketSnapshot, responses=NOT_PUBLISHED)
def market_snapshot(
    ctx: Ctx,
    symbol: SymbolQuery = None,
    timeframe: Timeframe | None = None,
    limit: Annotated[int, Query(ge=10, le=1000)] = 300,
) -> MarketSnapshot:
    """Candles (the last one forming), overlay series, trade markers and open-position levels.

    ``timeframe`` defaults to the engine's decision timeframe.
    """
    engine = queries.require(queries.engine_status(ctx.db))
    symbol = resolve_symbol(ctx, symbol, engine)
    timeframe = timeframe or engine.decision_timeframe
    candles, overlays = charts.chart_window(ctx.db, symbol, timeframe, limit)
    positions = queries.open_positions(ctx.db, symbol)
    markers = []
    if candles:
        first, last = candles[0].time, candles[-1].time
        trades = queries.trades_in_window(
            ctx.db,
            symbol,
            datetime.fromtimestamp(first, UTC),
            datetime.fromtimestamp(last + TIMEFRAME_SECONDS[timeframe], UTC),
            charts.MAX_MARKER_TRADES,
        )
        markers = charts.markers_for(trades, positions, timeframe, first, last)
    return MarketSnapshot(
        symbol=symbol,
        timeframe=timeframe,
        feed=engine.feed,
        ticker=queries.ticker(ctx.db, symbol),
        candles=candles,
        indicators=overlays,
        markers=markers,
        levels=charts.position_levels(positions),
        updated_at=utcnow(),
    )


@router.get("/watchlist", response_model=list[Ticker], responses=NOT_PUBLISHED)
def watchlist(ctx: Ctx) -> list[Ticker]:
    """Tickers (with 24 h hourly sparklines) for the symbols the engine trades."""
    engine = queries.engine_status(ctx.db)
    tickers = [
        t for s in queries.active_symbols(ctx.db, engine) if (t := queries.ticker(ctx.db, s)) is not None
    ]
    return queries.require(tickers or None)


@router.get("/mtf", response_model=MTFReport | None)
def multi_timeframe(ctx: Ctx, symbol: SymbolQuery = None) -> MTFReport | None:
    return queries.mtf_report(ctx.db, resolve_symbol(ctx, symbol))


@router.get("/regime", response_model=RegimeReport)
def regime(ctx: Ctx, symbol: SymbolQuery = None) -> RegimeReport:
    """Current regime, the bot's results per regime on this symbol, and 30 days of history."""
    symbol = resolve_symbol(ctx, symbol)
    return RegimeReport(
        symbol=symbol,
        current=queries.regime_state(ctx.db, symbol),
        performance=queries.regime_performance(ctx.db, symbol),
        history=queries.regime_history(ctx.db, symbol, utcnow() - timedelta(days=REGIME_HISTORY_DAYS)),
    )
