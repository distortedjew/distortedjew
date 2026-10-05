"""Helpers shared by the route modules."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import HTTPException, Query

from ...schemas import EngineStatus, Timeframe
from .. import queries
from ..context import ApiContext
from ..errors import ENGINE_STATE_MISSING
from ..validation import SYMBOL_QUERY_PATTERN, normalize_symbol

NOT_PUBLISHED: dict[int | str, dict[str, Any]] = {
    503: {
        "description": "The trading engine has not published this state yet",
        "content": {"application/json": {"example": {"detail": ENGINE_STATE_MISSING}}},
    }
}

SymbolQuery = Annotated[
    str | None,
    Query(
        pattern=SYMBOL_QUERY_PATTERN,
        description="BASE/QUOTE, e.g. BTC/USDT (case-insensitive); defaults to the primary symbol",
    ),
]


def decision_timeframe(ctx: ApiContext, engine: EngineStatus | None = None) -> Timeframe:
    engine = engine if engine is not None else queries.engine_status(ctx.db)
    return (
        engine.decision_timeframe if engine is not None else ctx.db.get_settings().trading.decision_timeframe
    )


def resolve_symbol(ctx: ApiContext, symbol: str | None, engine: EngineStatus | None = None) -> str:
    """The ``symbol`` query parameter, normalized; the primary symbol when omitted.

    404 for a symbol the bot neither trades nor has market data for.
    """
    if symbol is None:
        return queries.primary_symbol(ctx.db, engine)
    normalized = normalize_symbol(symbol)
    if normalized in queries.active_symbols(ctx.db, engine) or queries.has_candles(ctx.db, normalized):
        return normalized
    raise HTTPException(status_code=404, detail=f"Unknown symbol {normalized}")


def as_utc(value: datetime | None) -> datetime | None:
    """Query datetimes without an offset are taken as UTC."""
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=UTC)
