"""FastAPI application: REST API, WebSocket hub and, in production, the built dashboard.

Run it with ``tradebot-api`` or ``python -m tradebot.api.main [--host] [--port] [--db]
[--reload] [--log-level]``; ``create_app`` is also a uvicorn factory
(``uvicorn --factory tradebot.api.main:create_app``).
"""

from __future__ import annotations

import argparse
import copy
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from uvicorn.config import LOGGING_CONFIG

from ..config import VERSION, EnvConfig, get_config
from ..db import Database
from .auth import WS_UNAUTHORIZED_CODE, websocket_authorized
from .context import ApiContext, build_context
from .errors import UnhandledErrorMiddleware, install_error_handlers
from .redaction import RedactingLogFilter, RedactionMiddleware, Redactor, install_log_redaction
from .routes import api_router
from .static import mount_dashboard

log = logging.getLogger("tradebot.api")
PACKAGE_DIR = Path(__file__).resolve().parents[1]
GZIP_MINIMUM_BYTES = 1_024

DESCRIPTION = """Read-mostly gateway between the trading engine (via SQLite) and the dashboard.

There are no endpoints that place, close or modify trades: the dashboard can only read
state, edit validated settings (applied by the engine on its own schedule), manage
notification read flags and run backtests. Live updates stream over `WS /ws`.
"""


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    ctx: ApiContext = app.state.ctx
    ctx.jobs.recover()
    await ctx.hub.start()
    log.info(
        "API v%s ready (database %s, auth %s, dashboard %s)",
        VERSION,
        ctx.db.path,
        "on" if ctx.auth_token else "off",
        "served" if ctx.dashboard_served else "not built",
    )
    try:
        yield
    finally:
        await ctx.hub.stop()
        ctx.jobs.shutdown()
        if ctx.owns_db:
            ctx.db.close()


def create_app(config: EnvConfig | None = None, db: Database | None = None) -> FastAPI:
    """Build the app. ``db`` defaults to ``config.tradebot_db`` (created / migrated if needed)."""
    config = config or get_config()
    owns_db = db is None
    db = (db or Database(config.tradebot_db)).init()
    ctx = build_context(config, db, owns_db=owns_db)

    app = FastAPI(
        title="AI Trading Bot API",
        version=VERSION,
        description=DESCRIPTION,
        docs_url="/api/docs",
        redoc_url=None,
        swagger_ui_oauth2_redirect_url="/api/docs/oauth2-redirect",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    app.state.ctx = ctx
    install_error_handlers(app)
    app.include_router(api_router())

    @app.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket) -> None:
        if not websocket_authorized(websocket, ctx.auth_token):
            await websocket.accept()
            await websocket.close(code=WS_UNAUTHORIZED_CODE, reason="Unauthorized")
            return
        await ctx.hub.serve(websocket)

    ctx.dashboard_served = mount_dashboard(app, config.dashboard_dist)

    # Added innermost first: errors become JSON, secrets are redacted before compression,
    # and CORS headers wrap every response including the 500s.
    app.add_middleware(UnhandledErrorMiddleware)
    app.add_middleware(RedactionMiddleware, redactor=ctx.redactor)
    app.add_middleware(GZipMiddleware, minimum_size=GZIP_MINIMUM_BYTES)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_log_redaction(ctx.redactor)
    return app


def redacting_filter() -> RedactingLogFilter:
    """Logging-config factory: masks this process's configured secrets in every record."""
    return RedactingLogFilter(Redactor(get_config().secret_values()))


def log_config(level: str) -> dict[str, Any]:
    """uvicorn's logging setup plus the ``tradebot`` loggers, with secrets masked everywhere."""
    config = copy.deepcopy(LOGGING_CONFIG)
    config["filters"] = {"redact": {"()": "tradebot.api.main.redacting_filter"}}
    config["formatters"]["tradebot"] = {
        "()": "uvicorn.logging.DefaultFormatter",
        "fmt": "%(levelprefix)s [%(name)s] %(message)s",
        "use_colors": None,
    }
    config["handlers"]["tradebot"] = {
        "formatter": "tradebot",
        "class": "logging.StreamHandler",
        "stream": "ext://sys.stderr",
    }
    for handler in config["handlers"].values():
        handler["filters"] = ["redact"]
    config["loggers"]["tradebot"] = {"handlers": ["tradebot"], "level": level, "propagate": False}
    return config


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        prog="tradebot-api", description="AI Trading Bot API: REST, WebSocket and the built dashboard."
    )
    parser.add_argument("--host", help="bind address (default: API_HOST, 127.0.0.1)")
    parser.add_argument("--port", type=int, help="port (default: API_PORT, 8000)")
    parser.add_argument("--db", help="SQLite database shared with the engine (default: TRADEBOT_DB)")
    parser.add_argument("--reload", action="store_true", help="restart on code changes (development)")
    parser.add_argument("--log-level", help="DEBUG, INFO, WARNING, ... (default: LOG_LEVEL, INFO)")
    args = parser.parse_args(argv)

    if args.db:
        # through the environment so the --reload worker process sees it too
        os.environ["TRADEBOT_DB"] = str(Path(args.db).expanduser().resolve())
    config = EnvConfig()
    level = (args.log_level or config.log_level).upper()
    uvicorn.run(
        "tradebot.api.main:create_app",
        factory=True,
        host=args.host or config.api_host,
        port=args.port or config.api_port,
        reload=args.reload,
        reload_dirs=[str(PACKAGE_DIR)] if args.reload else None,
        log_level=level.lower(),
        log_config=log_config(level),
        ws_ping_interval=20.0,
        ws_ping_timeout=20.0,
        timeout_graceful_shutdown=5,
    )


if __name__ == "__main__":
    main()
