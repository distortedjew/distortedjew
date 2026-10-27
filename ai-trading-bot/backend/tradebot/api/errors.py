"""Consistent JSON errors: ``{"detail": ...}`` for every failure, including unexpected ones.

- 401 ``{"detail": "Not authenticated"}`` — missing / wrong dashboard token
- 404 ``{"detail": "<thing> not found"}``
- 422 ``{"detail": [{"type", "loc", "msg", "input"}, ...]}`` — FastAPI's validation shape,
  also used for the API's own cross-field checks
- 429 ``{"detail": ...}`` — too many backtests queued
- 503 ``{"detail": "Trading engine has not published state yet"}``
- 500 ``{"detail": "Internal server error"}`` — logged with the traceback, never echoed
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

ENGINE_STATE_MISSING = "Trading engine has not published state yet"

log = logging.getLogger("tradebot.api")


class EngineStateUnavailable(Exception):
    """An endpoint needs live state that the engine has never published (HTTP 503)."""

    def __init__(self, detail: str = ENGINE_STATE_MISSING):
        super().__init__(detail)
        self.detail = detail


async def _engine_unavailable(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, EngineStateUnavailable)
    return JSONResponse({"detail": exc.detail}, status_code=503, headers={"Retry-After": "5"})


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(EngineStateUnavailable, _engine_unavailable)


class UnhandledErrorMiddleware:
    """Turns an unhandled exception into a JSON 500 *inside* the CORS / GZip layers.

    Starlette's own fallback sits outside all user middleware, so its 500s would reach a
    browser without CORS headers and show up as an opaque network error.
    """

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = False

        async def tracking_send(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, receive, tracking_send)
        except Exception:
            log.exception("Unhandled error on %s %s", scope.get("method"), scope.get("path"))
            if started:
                raise
            response = JSONResponse({"detail": "Internal server error"}, status_code=500)
            await response(scope, receive, send)
