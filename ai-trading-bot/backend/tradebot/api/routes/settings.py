"""Bot settings: read, and validated updates the engine applies on its next check (~2 s)."""

from __future__ import annotations

import logging

from fastapi import APIRouter

from ...schemas import BotSettings, SettingsResponse
from .. import bot_settings, queries
from ..context import ApiContext, Ctx

router = APIRouter(tags=["settings"])
log = logging.getLogger("tradebot.api.settings")


def _response(ctx: ApiContext, settings: BotSettings) -> SettingsResponse:
    engine = queries.engine_status(ctx.db)
    online = queries.bot_status(engine, ctx.config).state != "offline"
    return bot_settings.settings_response(settings, ctx.config, engine, online)


@router.get("/settings", response_model=SettingsResponse)
def get_settings(ctx: Ctx) -> SettingsResponse:
    return _response(ctx, queries.stored_settings(ctx.db))


@router.put("/settings", response_model=SettingsResponse)
def update_settings(body: BotSettings, ctx: Ctx) -> SettingsResponse:
    """Merge the sent fields onto the current settings and save a new version.

    Read-only fields (paper/live trading, ``*_configured``, version) are ignored: they are
    owned by the server environment. A save emits ``SETTINGS_CHANGED`` and every dashboard
    receives a ``settings`` frame. Sending nothing new changes nothing.
    """
    current = queries.stored_settings(ctx.db)
    candidate = bot_settings.with_server_fields(
        bot_settings.normalize(bot_settings.merge(current, body)), ctx.config
    )
    changed = bot_settings.changed_paths(current, candidate)
    if not changed:
        return _response(ctx, current)
    saved = ctx.db.save_settings(candidate)
    listed = ", ".join(changed[:8]) + (f" and {len(changed) - 8} more" if len(changed) > 8 else "")
    ctx.db.append_event(
        "SETTINGS_CHANGED",
        "Settings updated",
        f"Version {saved.version}: {listed}",
        data={"version": saved.version, "changed": changed},
    )
    log.info("Settings saved as version %d (%s)", saved.version, ", ".join(changed))
    return _response(ctx, saved)
