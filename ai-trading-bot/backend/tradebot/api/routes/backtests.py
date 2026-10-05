"""Backtest jobs: create (runs in a worker process), poll, list and delete."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Path, Response
from fastapi.exceptions import RequestValidationError

from ...db import utcnow
from ...schemas import TIMEFRAME_SECONDS, BacktestRequest, BacktestResult, BacktestSummary
from ..backtests import TooManyBacktests
from ..context import Ctx
from ..validation import error_item, is_symbol, normalize_symbol

router = APIRouter(prefix="/backtests", tags=["backtests"])

MAX_SPAN_DAYS = 3 * 365
MAX_BARS = 250_000

BacktestId = Annotated[str, Path(min_length=1, max_length=64)]


def validate_request(request: BacktestRequest) -> BacktestRequest:
    """Checks beyond the model's bounds: symbol format, a past date range, a sane bar count."""
    errors: list[dict[str, Any]] = []
    symbol = normalize_symbol(request.symbol)
    if not is_symbol(symbol):
        errors.append(
            error_item(("body", "symbol"), "Symbol must look like BASE/QUOTE, e.g. BTC/USDT", request.symbol)
        )
    if request.end <= request.start:
        errors.append(error_item(("body", "end"), "end must be after start", request.end.isoformat()))
    if request.end > utcnow().date():
        errors.append(error_item(("body", "end"), "end cannot be in the future", request.end.isoformat()))
    span_days = (request.end - request.start).days
    if span_days > MAX_SPAN_DAYS:
        errors.append(
            error_item(
                ("body", "start"), f"The period is limited to {MAX_SPAN_DAYS} days", request.start.isoformat()
            )
        )
    bars = span_days * 86_400 // TIMEFRAME_SECONDS[request.timeframe]
    if bars > MAX_BARS:
        errors.append(
            error_item(
                ("body", "timeframe"),
                f"{bars:,} {request.timeframe} candles is too many (max {MAX_BARS:,}): "
                "choose a higher timeframe or a shorter period",
                request.timeframe,
            )
        )
    if errors:
        raise RequestValidationError(errors)
    return request.model_copy(update={"symbol": symbol})


@router.get("", response_model=list[BacktestSummary])
def list_backtests(ctx: Ctx) -> list[BacktestSummary]:
    """The 100 most recent jobs, newest first."""
    return ctx.jobs.list()


@router.post("", response_model=BacktestSummary, status_code=202)
def create_backtest(request: BacktestRequest, ctx: Ctx) -> BacktestSummary:
    """Queue a backtest; poll ``GET /api/backtests/{id}`` while it is queued or running."""
    try:
        return ctx.jobs.submit(validate_request(request))
    except TooManyBacktests as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc


@router.get("/{backtest_id}", response_model=BacktestResult)
def get_backtest(backtest_id: BacktestId, ctx: Ctx) -> BacktestResult:
    result = ctx.jobs.get(backtest_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Backtest not found")
    return result


@router.delete("/{backtest_id}", status_code=204, response_class=Response)
def delete_backtest(backtest_id: BacktestId, ctx: Ctx) -> Response:
    """Delete a job; a running one is cancelled."""
    if not ctx.jobs.delete(backtest_id):
        raise HTTPException(status_code=404, detail="Backtest not found")
    return Response(status_code=204)
