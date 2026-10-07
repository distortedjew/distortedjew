"""Liveness, engine status and system health."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from ...config import VERSION
from ...db import parse_iso, utcnow
from ...schemas import BotStatus, SystemHealth
from ...system import (
    api_health,
    bot_health,
    database_health,
    database_stats,
    market_data_health,
    openrouter_health,
    websocket_health,
)
from .. import queries
from ..ai_info import openrouter_configured, usage_stats
from ..context import Ctx

public = APIRouter(tags=["system"])
router = APIRouter(tags=["system"])


class Health(BaseModel):
    ok: bool = True


@public.get("/health", response_model=Health, summary="Liveness probe (no auth)")
def health() -> Health:
    return Health(ok=True)


@router.get("/status", response_model=BotStatus)
def get_status(ctx: Ctx) -> BotStatus:
    """Engine liveness: online < 10 s heartbeat age, degraded < 60 s, else offline."""
    return queries.bot_status(queries.engine_status(ctx.db), ctx.config)


@router.get("/system", response_model=SystemHealth)
def get_system(ctx: Ctx) -> SystemHealth:
    now = utcnow()
    engine = queries.engine_status(ctx.db)
    status = queries.bot_status(engine, ctx.config, now)
    process = ctx.monitor.process()
    database = ctx.stats.get("database", lambda: database_stats(ctx.db))
    usage = usage_stats(ctx, engine)
    last_success = ctx.db.read_one("SELECT ts FROM ai_usage WHERE success = 1 ORDER BY id DESC LIMIT 1")
    newest_tick = queries.newest_tick(ctx.db, queries.active_symbols(ctx.db, engine))
    heuristic_fallback = queries.stored_settings(ctx.db).ai.heuristic_fallback
    components = [
        bot_health(status),
        api_health(
            process,
            version=VERSION,
            auth_enabled=ctx.auth_token is not None,
            dashboard_served=ctx.dashboard_served,
        ),
        openrouter_health(
            configured=openrouter_configured(ctx, engine),
            usage=usage,
            last_success_at=parse_iso(last_success["ts"]) if last_success else None,
            heuristic_fallback=heuristic_fallback,
        ),
        market_data_health(status, newest_tick, now, queries.feed_fallback(ctx.db, engine)),
        database_health(database),
        websocket_health(
            running=ctx.hub.running,
            clients=ctx.hub.clients,
            messages_sent=ctx.hub.messages_sent,
            dropped=ctx.hub.frames_dropped,
        ),
    ]
    engine_uptime = (
        round((now - engine.started_at).total_seconds(), 1)
        if engine is not None and status.state != "offline"
        else None
    )
    return SystemHealth(
        components=components,
        status=status,
        api=process,
        host=ctx.monitor.host(ctx.db.path),
        database=database,
        websocket_clients=ctx.hub.clients,
        websocket_messages_sent=ctx.hub.messages_sent,
        engine_uptime_sec=engine_uptime,
        recent_issues=queries.recent_issues(ctx.db),
    )
