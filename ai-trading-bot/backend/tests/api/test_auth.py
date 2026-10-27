"""Optional dashboard token, CORS, compression and serving the built dashboard."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from tradebot.api.main import create_app
from tradebot.db import Database

from . import factories as f
from .conftest import make_config, tune_for_tests, ws_receive

TOKEN = "s3cret-dashboard-token"


@pytest.fixture
def secured(tmp_path: Path) -> Iterator[TestClient]:
    config = make_config(tmp_path, dashboard_token=TOKEN)
    db = Database(config.tradebot_db).init()
    f.publish_live_state(db)
    with TestClient(tune_for_tests(create_app(config, db))) as client:
        yield client
    db.close()


# --------------------------------------------------------------------------
# REST
# --------------------------------------------------------------------------


@pytest.mark.parametrize("path", ["/api/status", "/api/portfolio", "/api/trades", "/api/settings"])
def test_rest_requires_the_token(secured: TestClient, path: str) -> None:
    for headers in (
        {},
        {"Authorization": "Bearer wrong"},
        {"Authorization": TOKEN},
        {"Authorization": f"Basic {TOKEN}"},
    ):
        response = secured.get(path, headers=headers)
        assert response.status_code == 401, headers
        assert response.json() == {"detail": "Not authenticated"}
        assert response.headers["www-authenticate"] == "Bearer"
    assert secured.get(path, headers={"Authorization": f"Bearer {TOKEN}"}).status_code == 200
    assert secured.get(path, headers={"Authorization": f"bearer  {TOKEN} "}).status_code == 200


def test_the_cookie_works_too(secured: TestClient) -> None:
    secured.cookies.set("tb_token", TOKEN)
    assert secured.get("/api/status").status_code == 200
    secured.cookies.set("tb_token", "wrong")
    assert secured.get("/api/status").status_code == 401


def test_writes_are_protected(secured: TestClient) -> None:
    assert secured.put("/api/settings", json={"risk": {"max_positions": 9}}).status_code == 401
    assert secured.post("/api/notifications/read", json={}).status_code == 401
    assert secured.post("/api/backtests", json={}).status_code == 401
    assert secured.delete("/api/backtests/bt_000000000000").status_code == 401


def test_health_stays_open(secured: TestClient) -> None:
    assert secured.get("/api/health").json() == {"ok": True}


def test_everything_is_open_without_a_token(client: TestClient, db: Database) -> None:
    f.publish_live_state(db)
    assert client.get("/api/portfolio").status_code == 200
    assert client.get("/api/portfolio", headers={"Authorization": "Bearer anything"}).status_code == 200


def test_a_blank_token_means_no_auth(tmp_path: Path) -> None:
    config = make_config(tmp_path, dashboard_token="   ")
    with TestClient(create_app(config)) as client:
        assert client.get("/api/status").status_code == 200


# --------------------------------------------------------------------------
# WebSocket
# --------------------------------------------------------------------------


@pytest.mark.parametrize("url", ["/ws", "/ws?token=wrong", f"/ws?token={TOKEN[:-1]}"])
def test_websocket_without_the_token_is_closed_4401(secured: TestClient, url: str) -> None:
    with pytest.raises(WebSocketDisconnect) as closed, secured.websocket_connect(url) as ws:
        ws.receive_json()
    assert closed.value.code == 4401


def test_websocket_with_the_token(secured: TestClient) -> None:
    with secured.websocket_connect(f"/ws?token={TOKEN}") as ws:
        assert ws_receive(ws)["type"] == "hello"
    secured.cookies.set("tb_token", TOKEN)
    with secured.websocket_connect("/ws") as ws:
        assert ws_receive(ws)["type"] == "hello"


# --------------------------------------------------------------------------
# CORS and compression
# --------------------------------------------------------------------------


def test_cors_allows_only_the_configured_origins(client: TestClient) -> None:
    preflight = {"Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "authorization"}
    allowed = client.options("/api/settings", headers={"Origin": "http://localhost:5173", **preflight})
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert allowed.headers["access-control-allow-credentials"] == "true"
    other = client.get("/api/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in other.headers


def test_errors_carry_cors_headers(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from tradebot.api import queries

    def explode(*_args: object, **_kwargs: object) -> None:
        raise RuntimeError("boom")

    monkeypatch.setattr(queries, "trade_page", explode)
    response = client.get("/api/trades", headers={"Origin": "http://localhost:5173"})
    assert response.status_code == 500
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_large_responses_are_gzipped(client: TestClient) -> None:
    response = client.get("/api/openapi.json", headers={"Accept-Encoding": "gzip"})
    assert response.headers["content-encoding"] == "gzip" and response.json()["openapi"]
    small = client.get("/api/health", headers={"Accept-Encoding": "gzip"})
    assert "content-encoding" not in small.headers


# --------------------------------------------------------------------------
# The built dashboard
# --------------------------------------------------------------------------


@pytest.fixture
def dist(tmp_path: Path) -> Path:
    root = tmp_path / "dist"
    (root / "assets").mkdir(parents=True)
    (root / "index.html").write_text("<!doctype html><title>AI Trading Bot</title>")
    (root / "assets" / "index-abc123.js").write_text("console.log('dashboard')")
    (root / "favicon.svg").write_text("<svg/>")
    (tmp_path / "secret.txt").write_text("outside the dist")
    return root


def serving(tmp_path: Path, dist: Path, **overrides: Any) -> TestClient:
    return TestClient(create_app(make_config(tmp_path, dashboard_dist=dist, **overrides)))


def test_the_dashboard_is_served_with_an_spa_fallback(tmp_path: Path, dist: Path) -> None:
    with serving(tmp_path, dist) as client:
        index = client.get("/")
        assert index.status_code == 200 and "AI Trading Bot" in index.text
        assert index.headers["cache-control"] == "no-cache"
        for route in ("/trades", "/settings", "/markets/BTC-USDT"):
            routed = client.get(route)
            assert routed.status_code == 200 and routed.text == index.text, route
        asset = client.get("/assets/index-abc123.js")
        assert asset.status_code == 200 and "immutable" in asset.headers["cache-control"]
        assert client.get("/favicon.svg").headers["cache-control"] == "no-cache"
        assert client.get("/assets/missing-123.js").status_code == 404
        assert client.get("/robots.txt").status_code == 404


def test_the_dashboard_never_shadows_the_api(tmp_path: Path, dist: Path) -> None:
    with serving(tmp_path, dist) as client:
        assert client.get("/api/health").json() == {"ok": True}
        missing = client.get("/api/not-a-route")
        assert missing.status_code == 404 and missing.json() == {"detail": "Not Found"}
        assert client.get("/api").status_code == 404 and client.get("/ws").status_code == 404
        assert client.get("/api/docs").status_code == 200


def test_files_outside_the_dist_are_not_served(tmp_path: Path, dist: Path) -> None:
    with serving(tmp_path, dist) as client:
        for path in ("/../secret.txt", "/%2e%2e/secret.txt", "/assets/..%2f..%2fsecret.txt"):
            response = client.get(path)
            assert "outside the dist" not in response.text, path


def test_the_dashboard_loads_without_the_token(tmp_path: Path, dist: Path) -> None:
    with serving(tmp_path, dist, dashboard_token=TOKEN) as client:
        assert client.get("/").status_code == 200 and client.get("/trades").status_code == 200
        assert client.get("/api/status").status_code == 401


def test_a_placeholder_when_the_dashboard_is_not_built(client: TestClient) -> None:
    root = client.get("/").json()
    assert root["docs"] == "/api/docs" and "not built" in root["dashboard"]
