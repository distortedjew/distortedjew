"""Closed trades: filtered and sorted pages with a summary, CSV export, and detail charts."""

from __future__ import annotations

import csv
import io
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response

from ...db import utcnow
from ...schemas import ExitReason, Side, StrategyName, Timeframe, Trade, TradeDetail, TradePage, TradeResult
from .. import charts, queries
from ..context import Ctx
from ..queries import SortOrder, TradeFilters, TradeSort
from ..validation import SYMBOL_QUERY_PATTERN, normalize_symbol, validation_error
from .common import as_utc

router = APIRouter(tags=["trades"])

EXPORT_CAP = 100_000
CSV_COLUMNS: tuple[str, ...] = (
    "id",
    "symbol",
    "side",
    "opened_at",
    "closed_at",
    "duration_sec",
    "entry_price",
    "exit_price",
    "stop_loss",
    "take_profit",
    "size",
    "notional",
    "pnl",
    "pnl_pct",
    "gross_pnl",
    "fees",
    "result",
    "exit_reason",
    "r_multiple",
    "ai_confidence",
    "analysis_id",
    "strategy",
    "regime",
    "entry_reason",
    "mfe_pct",
    "mae_pct",
)
# Spreadsheet apps execute cells starting with these; entry reasons are model-written text.
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")

TradeId = Annotated[str, Path(min_length=1, max_length=64)]


def trade_filters(
    symbol: Annotated[str | None, Query(pattern=SYMBOL_QUERY_PATTERN)] = None,
    side: Side | None = None,
    result: TradeResult | None = None,
    strategy: StrategyName | None = None,
    exit_reason: ExitReason | None = None,
    min_confidence: Annotated[float | None, Query(ge=0, le=100)] = None,
    max_confidence: Annotated[float | None, Query(ge=0, le=100)] = None,
    start: Annotated[datetime | None, Query(description="Closed at or after (UTC when no offset)")] = None,
    end: Annotated[datetime | None, Query(description="Closed at or before (UTC when no offset)")] = None,
    q: Annotated[str | None, Query(max_length=100, description="Search id, symbol, reasons, ...")] = None,
) -> TradeFilters:
    start, end = as_utc(start), as_utc(end)
    if start is not None and end is not None and start > end:
        raise validation_error(("query", "end"), "end must not be before start", end.isoformat())
    if min_confidence is not None and max_confidence is not None and min_confidence > max_confidence:
        raise validation_error(
            ("query", "max_confidence"), "max_confidence must not be below min_confidence", max_confidence
        )
    return TradeFilters(
        symbol=normalize_symbol(symbol) if symbol else None,
        side=side,
        result=result,
        strategy=strategy,
        exit_reason=exit_reason,
        min_confidence=min_confidence,
        max_confidence=max_confidence,
        start=start,
        end=end,
        q=(q or "").strip() or None,
    )


Filters = Annotated[TradeFilters, Depends(trade_filters)]


@router.get("/trades", response_model=TradePage)
def list_trades(
    ctx: Ctx,
    filters: Filters,
    sort: TradeSort = "closed_at",
    order: SortOrder = "desc",
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> TradePage:
    """A page of closed trades; ``summary`` covers the whole filtered set."""
    return queries.trade_page(ctx.db, filters, sort, order, limit, offset)


@router.get(
    "/trades/export.csv",
    response_class=Response,
    responses={200: {"content": {"text/csv": {}}, "description": "Every trade matching the filters"}},
)
def export_trades(
    ctx: Ctx, filters: Filters, sort: TradeSort = "closed_at", order: SortOrder = "desc"
) -> Response:
    trades = queries.trades_for_export(ctx.db, filters, sort, order, EXPORT_CAP)
    filename = f"trades-{utcnow():%Y%m%d-%H%M%S}.csv"
    return Response(
        content=render_csv(trades),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/trades/{trade_id}", response_model=TradeDetail)
def get_trade(trade_id: TradeId, ctx: Ctx, timeframe: Timeframe | None = None) -> TradeDetail:
    """The trade with its analysis and a chart around entry and exit.

    Without ``timeframe`` the chart uses the timeframe the decision was made on, stepping
    up when the trade lasted too long to fit.
    """
    trade = queries.find_trade(ctx.db, trade_id)
    if trade is None:
        raise HTTPException(status_code=404, detail="Trade not found")
    analysis = queries.find_analysis(ctx.db, trade.analysis_id)
    if timeframe is None:
        base = analysis.timeframe if analysis else queries.stored_settings(ctx.db).trading.decision_timeframe
        timeframe = charts.detail_timeframe(base, trade.opened_at, trade.closed_at)
    candles = charts.detail_candles(
        ctx.db, trade.symbol, timeframe, trade.opened_at, trade.closed_at, utcnow()
    )
    markers = charts.markers_for([trade], [], timeframe, candles[0].time, candles[-1].time) if candles else []
    return TradeDetail(trade=trade, analysis=analysis, timeframe=timeframe, candles=candles, markers=markers)


def _cell(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%dT%H:%M:%SZ")
    if isinstance(value, str) and value.startswith(_FORMULA_PREFIXES):
        return "'" + value
    return value


def render_csv(trades: list[Trade]) -> str:
    """UTF-8 CSV with a BOM (so spreadsheet apps detect the encoding), formula-safe text."""
    buffer = io.StringIO()
    buffer.write("﻿")
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(CSV_COLUMNS)
    for trade in trades:
        row = trade.model_dump()
        writer.writerow([_cell(row[column]) for column in CSV_COLUMNS])
    return buffer.getvalue()
