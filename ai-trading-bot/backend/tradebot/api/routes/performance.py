"""Performance report over a period."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from ...analytics.performance import build_performance_report
from ...schemas import PerformanceRange, PerformanceReport
from .. import queries
from ..context import Ctx

router = APIRouter(tags=["performance"])


@router.get("/performance", response_model=PerformanceReport)
def get_performance(
    ctx: Ctx, range_: Annotated[PerformanceRange, Query(alias="range")] = "30d"
) -> PerformanceReport:
    """Metrics, equity curve (≤ 1000 points), daily / monthly P&L, distribution and breakdowns.

    Cached for 10 s per range.
    """
    state = queries.portfolio_state(ctx.db)
    starting_balance = state.starting_balance if state else ctx.config.starting_balance
    return ctx.reports.get(
        ("performance", range_),
        lambda: build_performance_report(
            ctx.db,
            range_,
            starting_balance=starting_balance,
            live_equity=state.equity if state else None,
        ),
    )
