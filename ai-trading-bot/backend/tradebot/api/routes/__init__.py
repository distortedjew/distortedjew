"""REST routes, grouped by domain and mounted under ``/api``.

``GET /api/health`` is always open; everything else requires the dashboard token when
``DASHBOARD_TOKEN`` is set.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..auth import require_auth
from . import activity, ai, backtests, market, performance, portfolio, settings, status, trades


def api_router() -> APIRouter:
    router = APIRouter(prefix="/api")
    router.include_router(status.public)
    protected = APIRouter(dependencies=[Depends(require_auth)])
    for module in (status, portfolio, trades, performance, ai, market, backtests, activity, settings):
        protected.include_router(module.router)
    router.include_router(protected)
    return router
