"""AI analyses: latest per symbol, history, analytics and model information."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from ...analytics.ai_metrics import build_ai_analytics
from ...schemas import (
    AIAnalysis,
    AIAnalytics,
    AIDecisionPage,
    AIModelInfo,
    AIProvider,
    PerformanceRange,
    RiskStatus,
    Signal,
)
from .. import queries
from ..ai_info import model_info, usage_stats
from ..context import Ctx
from ..validation import normalize_symbol
from .common import SymbolQuery

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/latest", response_model=AIAnalysis | None)
def latest_analysis(ctx: Ctx, symbol: SymbolQuery = None) -> AIAnalysis | None:
    """The most recent analysis for ``symbol`` (any symbol when omitted), or null."""
    return queries.latest_analysis(ctx.db, normalize_symbol(symbol) if symbol else None)


@router.get("/history", response_model=AIDecisionPage)
def analysis_history(
    ctx: Ctx,
    symbol: SymbolQuery = None,
    signal: Signal | None = None,
    risk_status: RiskStatus | None = None,
    provider: AIProvider | None = None,
    min_confidence: Annotated[float | None, Query(ge=0, le=100)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AIDecisionPage:
    """Analyses, newest first."""
    return queries.ai_history(
        ctx.db,
        symbol=normalize_symbol(symbol) if symbol else None,
        signal=signal,
        risk_status=risk_status,
        provider=provider,
        min_confidence=min_confidence,
        limit=limit,
        offset=offset,
    )


@router.get("/analytics", response_model=AIAnalytics)
def analytics(ctx: Ctx, range_: Annotated[PerformanceRange, Query(alias="range")] = "30d") -> AIAnalytics:
    """Signal quality by confidence, calibration, accuracy, rejections and LLM usage.

    Definitions: ``tradebot.analytics.ai_metrics``. Cached for 10 s per range.
    """
    usage = usage_stats(ctx)
    return ctx.reports.get(("ai", range_), lambda: build_ai_analytics(ctx.db, range_, usage))


@router.get("/models", response_model=AIModelInfo)
def models(ctx: Ctx) -> AIModelInfo:
    """Configured model, selectable models and usage. Never returns key material."""
    return model_info(ctx)
