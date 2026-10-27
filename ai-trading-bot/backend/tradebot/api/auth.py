"""Optional dashboard authentication.

When ``DASHBOARD_TOKEN`` is set, REST requests need ``Authorization: Bearer <token>``
or a ``tb_token`` cookie, and the WebSocket needs ``?token=<token>`` (or the cookie).
``GET /api/health`` and the static dashboard stay open so the app can load and ask for
the token. Comparisons are constant-time. A rejected WebSocket is accepted and closed
with code 4401 so the browser can tell "unauthorized" from a network failure.
"""

from __future__ import annotations

import hmac

from fastapi import HTTPException, Request, WebSocket, status

from ..config import EnvConfig

COOKIE_NAME = "tb_token"
WS_UNAUTHORIZED_CODE = 4401


def dashboard_token(config: EnvConfig) -> str | None:
    """The configured token, or None when auth is off (unset or blank)."""
    if config.dashboard_token is None:
        return None
    return config.dashboard_token.get_secret_value().strip() or None


def _matches(candidate: str | None, token: str) -> bool:
    return bool(candidate) and hmac.compare_digest(candidate.encode(), token.encode())


def request_authorized(request: Request, token: str | None) -> bool:
    if token is None:
        return True
    scheme, _, credentials = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() == "bearer" and _matches(credentials.strip(), token):
        return True
    return _matches(request.cookies.get(COOKIE_NAME), token)


def websocket_authorized(websocket: WebSocket, token: str | None) -> bool:
    if token is None:
        return True
    return _matches(websocket.query_params.get("token"), token) or _matches(
        websocket.cookies.get(COOKIE_NAME), token
    )


def require_auth(request: Request) -> None:
    """Router dependency for every protected REST endpoint."""
    if not request_authorized(request, request.app.state.ctx.auth_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
