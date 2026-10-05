"""No configured secret ever leaves the API: not in REST responses, WebSocket frames or logs.

Every secret environment variable gets a unique value; the test then calls every GET route
the app has (enumerated from the router, so a new endpoint is covered automatically) and
reads the WebSocket snapshot and pushed frames, with engine-written text that quotes the
secrets the way an upstream error message might.
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from typing import Any
from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient

from tradebot.api.ai_info import API_KEY_MASK
from tradebot.api.main import create_app
from tradebot.api.redaction import MASK, RedactingLogFilter, Redactor
from tradebot.db import Database, iso, utcnow
from tradebot.schemas import AIModelInfo, BacktestRequest, BacktestResult

from . import factories as f
from .conftest import Seed, make_config, seed_database, tune_for_tests, ws_receive, ws_receive_until

SECRETS = {
    "OPENROUTER_API_KEY": "sk-or-v1-LEAKCHECK0openrouter0a1b2c3d",
    "TELEGRAM_BOT_TOKEN": "7000000001:LEAKCHECK-telegram-e4f5",
    "DISCORD_WEBHOOK_URL": "https://discord.com/api/webhooks/42/LEAKCHECK-discord/g6h7",
    "SMTP_PASSWORD": 'LEAKCHECK smtp "password" i8j9',
    "DASHBOARD_TOKEN": "LEAKCHECK-dashboard-token-k0l1",
}
NOT_SECRET = {"TELEGRAM_CHAT_ID": "-100123", "SMTP_HOST": "smtp.example.com", "SMTP_FROM": "bot@example.com"}
AUTH = {"Authorization": f"Bearer {SECRETS['DASHBOARD_TOKEN']}"}


def forms(secret: str) -> list[str]:
    """The ways a secret could appear in a body: raw, JSON-escaped, URL-encoded."""
    return [secret, json.dumps(secret)[1:-1], quote(secret, safe="")]


def assert_no_secret(text: str, where: str) -> None:
    for name, secret in SECRETS.items():
        for form in forms(secret):
            assert form not in text, f"{name} leaked in {where}"
    assert "LEAKCHECK" not in text, f"part of a secret leaked in {where}"


@dataclass
class Leaky:
    client: TestClient
    app: Any
    db: Database
    seed: Seed
    backtest_id: str


@pytest.fixture
def leaky(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Leaky]:
    for name, value in {**SECRETS, **NOT_SECRET}.items():
        monkeypatch.setenv(name, value)
    config = make_config(tmp_path)
    assert sorted(config.secret_values()) == sorted(SECRETS.values())  # the test covers every secret
    db = Database(config.tradebot_db).init()
    seed = seed_database(db)
    db.put_live(
        "status", f.engine_status(openrouter_configured=True, ai_provider="openrouter", ai_model="x/y")
    )

    # free text written by the engine that quotes secrets, as upstream errors sometimes do
    key, telegram, discord = (
        SECRETS["OPENROUTER_API_KEY"],
        SECRETS["TELEGRAM_BOT_TOKEN"],
        SECRETS["DISCORD_WEBHOOK_URL"],
    )
    db.append_event("API_ERROR", "OpenRouter rejected the key", f"401 for key {key}", severity="error")
    db.add_notification(
        "BOT_ERROR",
        "Telegram delivery failed",
        f"POST https://api.telegram.org/bot{telegram}/sendMessage -> 404",
        severity="error",
        data={"url": f"https://api.telegram.org/bot{quote(telegram, safe='')}/sendMessage"},
    )
    f.insert_usage(db, utcnow() - timedelta(minutes=1), success=False, error=f"webhook {discord} timed out")
    f.insert_trade(
        db,
        f.trade(pnl=1.0, closed_at=utcnow(), entry_reason=f"model echoed {SECRETS['SMTP_PASSWORD']}"),
    )
    backtest_id = "bt_0123456789ab"
    request = BacktestRequest(start=utcnow().date() - timedelta(days=30), end=utcnow().date())
    result = BacktestResult(
        id=backtest_id,
        created_at=utcnow(),
        status="failed",
        progress=0.0,
        symbol=request.symbol,
        timeframe=request.timeframe,
        start=request.start,
        end=request.end,
        strategy=request.strategy,
        request=request,
        error=f"upstream said {key}",
    )
    with db.tx() as conn:
        conn.execute(
            "INSERT INTO backtests(id, created_at, status, progress, summary, result, error) "
            "VALUES (?, ?, 'failed', 0, ?, ?, ?)",
            (
                backtest_id,
                iso(result.created_at),
                result.model_dump_json(),
                result.model_dump_json(),
                result.error,
            ),
        )

    app = tune_for_tests(create_app(config, db))
    with TestClient(app, headers=AUTH) as client:
        yield Leaky(client, app, db, seed, backtest_id)
    db.close()


def get_routes(leaky: Leaky) -> list[str]:
    """Every GET operation the API documents, with its path parameters filled in."""
    params = {
        "position_id": leaky.seed.position.id,
        "trade_id": leaky.seed.trades[0].id,
        "backtest_id": leaky.backtest_id,
    }
    schema = leaky.client.get("/api/openapi.json").json()
    documented = [path for path, operations in schema["paths"].items() if "get" in operations]
    return [
        re.sub(r"\{(\w+)\}", lambda m: params[m.group(1)], path)
        for path in [*documented, "/api/openapi.json", "/api/docs", "/api/docs/oauth2-redirect"]
    ]


def test_no_get_endpoint_returns_a_secret(leaky: Leaky) -> None:
    paths = get_routes(leaky)
    assert len(paths) >= 25 and "/api/trades/export.csv" in paths and "/api/openapi.json" in paths
    variants = [
        "/api/performance?range=all",
        "/api/ai/analytics?range=all",
        "/api/market?timeframe=1h&limit=1000",
        "/api/notifications?unread_only=true",
        "/api/events?limit=500",
        "/api/trades?q=echoed",
        "/api/trades/export.csv?q=LEAKCHECK",
    ]
    for path in paths + variants:
        response = leaky.client.get(path)
        assert response.status_code == 200, (path, response.status_code)
        assert_no_secret(response.text, path)
        assert_no_secret(json.dumps(dict(response.headers)), f"{path} headers")


def test_engine_text_quoting_a_secret_is_masked(leaky: Leaky) -> None:
    client = leaky.client
    events = client.get("/api/events", params={"types": "API_ERROR"}).json()["items"]
    assert any(e["message"] == f"401 for key {MASK}" for e in events)
    notification = client.get("/api/notifications").json()["items"][0]
    assert notification["message"] == f"POST https://api.telegram.org/bot{MASK}/sendMessage -> 404"
    assert notification["data"]["url"] == f"https://api.telegram.org/bot{MASK}/sendMessage"
    usage = AIModelInfo.model_validate(client.get("/api/ai/models").json()).usage
    assert usage.last_error == f"webhook {MASK} timed out"
    csv_text = client.get("/api/trades/export.csv").text
    assert f"model echoed {MASK}" in csv_text
    assert client.get(f"/api/backtests/{leaky.backtest_id}").json()["error"] == f"upstream said {MASK}"


def test_a_configured_key_is_shown_as_a_fixed_mask(leaky: Leaky) -> None:
    info = AIModelInfo.model_validate(leaky.client.get("/api/ai/models").json())
    assert info.configured is True and info.api_key_hint == API_KEY_MASK == "••••••••••••••••"


def test_websocket_frames_never_carry_a_secret(leaky: Leaky) -> None:
    token = quote(SECRETS["DASHBOARD_TOKEN"], safe="")
    with leaky.client.websocket_connect(f"/ws?token={token}") as ws:
        frames = [ws_receive(ws) for _ in range(17)]  # hello + the full snapshot burst
        assert frames[0]["type"] == "hello" and frames[-1]["type"] == "ai_analysis"
        event_id = leaky.db.append_event(
            "API_ERROR",
            "Discord webhook failed",
            f"{SECRETS['DISCORD_WEBHOOK_URL']} returned 404",
            severity="error",
        )
        leaky.db.add_notification(
            "API_FAILURE", "OpenRouter down", f"key {SECRETS['OPENROUTER_API_KEY']} rejected"
        )
        event = ws_receive_until(ws, lambda fr: fr["type"] == "event")
        notification = ws_receive_until(ws, lambda fr: fr["type"] == "notification")
        ws.send_json({"type": "ping"})
        frames += [event, notification, ws_receive_until(ws, lambda fr: fr["type"] == "pong")]
    assert event["data"]["id"] == event_id and event["data"]["message"] == f"{MASK} returned 404"
    assert notification["data"]["message"] == f"key {MASK} rejected"
    for frame in frames:
        assert_no_secret(json.dumps(frame, ensure_ascii=False), f"ws {frame['type']} frame")


def test_access_log_lines_are_masked() -> None:
    redactor = Redactor(SECRETS.values())
    token = SECRETS["DASHBOARD_TOKEN"]
    record = logging.LogRecord(
        "uvicorn.access",
        logging.INFO,
        __file__,
        1,
        '%s - "%s %s HTTP/%s" %d',
        ("127.0.0.1:50000", "GET", f"/ws?token={quote(token, safe='')}&x=1", "1.1", 101),
        None,
    )
    RedactingLogFilter(redactor).filter(record)
    line = record.getMessage()
    assert line == f'127.0.0.1:50000 - "GET /ws?token={MASK}&x=1 HTTP/1.1" 101'

    error = logging.LogRecord(
        "tradebot", logging.ERROR, __file__, 1, "upstream: %s", (SECRETS["SMTP_PASSWORD"],), None
    )
    RedactingLogFilter(redactor).filter(error)
    assert error.getMessage() == f"upstream: {MASK}"


def test_short_values_are_not_treated_as_secrets() -> None:
    redactor = Redactor(["abc", "  ", ""])
    assert not redactor and redactor.text("abc abc") == "abc abc"
