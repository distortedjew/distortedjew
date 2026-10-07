"""Portfolio (live state + KPIs), open positions and the risk snapshot."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Path

from ...db import utcnow
from ...schemas import Portfolio, Position, PositionDetail, RiskSnapshot, Timeframe
from .. import charts, queries
from ..context import Ctx
from .common import NOT_PUBLISHED, decision_timeframe

router = APIRouter(tags=["portfolio"])

PositionId = Annotated[str, Path(min_length=1, max_length=64)]


@router.get("/portfolio", response_model=Portfolio, responses=NOT_PUBLISHED)
def get_portfolio(ctx: Ctx) -> Portfolio:
    """Live portfolio numbers with KPI cards (see ``tradebot.analytics.performance``)."""
    return ctx.kpis.portfolio(queries.require(queries.portfolio_state(ctx.db)))


@router.get("/positions", response_model=list[Position], responses=NOT_PUBLISHED)
def list_positions(ctx: Ctx) -> list[Position]:
    return queries.require(queries.live_positions(ctx.db))


@router.get("/positions/{position_id}", response_model=PositionDetail)
def get_position(position_id: PositionId, ctx: Ctx, timeframe: Timeframe | None = None) -> PositionDetail:
    """The position with its analysis and a chart from shortly before the entry until now.

    Without ``timeframe`` the chart uses the decision timeframe, stepping up when the
    position has been open too long to fit.
    """
    position = queries.find_position(ctx.db, position_id)
    if position is None:
        raise HTTPException(status_code=404, detail="Position not found (it may have closed)")
    analysis = queries.find_analysis(ctx.db, position.analysis_id)
    now = utcnow()
    chart_tf = timeframe or charts.detail_timeframe(
        analysis.timeframe if analysis else decision_timeframe(ctx), position.opened_at, now
    )
    candles = charts.detail_candles(ctx.db, position.symbol, chart_tf, position.opened_at, None, now)
    markers = (
        charts.markers_for([], [position], chart_tf, candles[0].time, candles[-1].time) if candles else []
    )
    return PositionDetail(
        position=position, analysis=analysis, timeframe=chart_tf, candles=candles, markers=markers
    )


@router.get("/risk", response_model=RiskSnapshot, responses=NOT_PUBLISHED)
def get_risk(ctx: Ctx) -> RiskSnapshot:
    return queries.require(queries.risk_snapshot(ctx.db))
