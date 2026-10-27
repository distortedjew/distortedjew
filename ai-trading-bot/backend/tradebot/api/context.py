"""Process-wide state shared by the REST routes and the WebSocket hub."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, Request

from ..analytics.performance import PortfolioKpiService
from ..config import EnvConfig
from ..db import Database
from ..system import ProcessMonitor
from .auth import dashboard_token
from .backtests import BacktestJobs
from .cache import TTLCache
from .redaction import Redactor
from .ws import Hub

REPORT_CACHE_SECONDS = 10.0
STATS_CACHE_SECONDS = 5.0


@dataclass
class ApiContext:
    config: EnvConfig
    db: Database
    owns_db: bool
    auth_token: str | None
    redactor: Redactor
    monitor: ProcessMonitor
    kpis: PortfolioKpiService
    reports: TTLCache[Any]  # performance reports and AI analytics, keyed by (kind, range)
    stats: TTLCache[Any]  # cheaper statistics (LLM usage, database row counts)
    hub: Hub
    jobs: BacktestJobs
    dashboard_served: bool = False


def build_context(config: EnvConfig, db: Database, *, owns_db: bool) -> ApiContext:
    redactor = Redactor(config.secret_values())
    kpis = PortfolioKpiService(db)
    return ApiContext(
        config=config,
        db=db,
        owns_db=owns_db,
        auth_token=dashboard_token(config),
        redactor=redactor,
        monitor=ProcessMonitor(),
        kpis=kpis,
        reports=TTLCache(REPORT_CACHE_SECONDS),
        stats=TTLCache(STATS_CACHE_SECONDS),
        hub=Hub(db, config, kpis, redactor),
        jobs=BacktestJobs(db),
    )


def get_ctx(request: Request) -> ApiContext:
    return request.app.state.ctx


Ctx = Annotated[ApiContext, Depends(get_ctx)]
