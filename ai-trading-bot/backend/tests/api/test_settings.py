"""Settings: server-owned read-only fields, validation, merging, versioning and the change event."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tradebot.api.main import create_app
from tradebot.db import Database, utcnow
from tradebot.schemas import BotSettings, EventPage, SettingsResponse

from . import factories as f
from .conftest import make_config, tune_for_tests, ws_receive


def get(client: TestClient) -> SettingsResponse:
    response = client.get("/api/settings")
    assert response.status_code == 200
    return SettingsResponse.model_validate(response.json())


def put(client: TestClient, body: dict[str, Any]) -> SettingsResponse:
    response = client.put("/api/settings", json=body)
    assert response.status_code == 200, response.json()
    return SettingsResponse.model_validate(response.json())


def settings_events(client: TestClient) -> list[dict[str, Any]]:
    page = EventPage.model_validate(client.get("/api/events", params={"types": "SETTINGS_CHANGED"}).json())
    return [e.data for e in page.items]


@pytest.fixture
def configured_client(tmp_path: Path) -> Iterator[TestClient]:
    """Every notification channel configured in the server environment."""
    config = make_config(
        tmp_path,
        telegram_bot_token="123456:telegram-token-value",
        telegram_chat_id="-100200300",
        discord_webhook_url="https://discord.com/api/webhooks/1/discord-secret-value",
        smtp_host="smtp.example.com",
        smtp_from="bot@example.com",
    )
    db = Database(config.tradebot_db).init()
    with TestClient(tune_for_tests(create_app(config, db))) as client:
        yield client
    db.close()


# --------------------------------------------------------------------------
# Read-only fields come from the server environment
# --------------------------------------------------------------------------


def test_defaults_on_a_new_database(client: TestClient) -> None:
    response = get(client)
    trading, notifications = response.settings.trading, response.settings.notifications
    assert (trading.paper_trading, trading.live_trading) == (True, False)
    assert not (
        notifications.telegram_configured
        or notifications.discord_configured
        or notifications.email_configured
    )
    assert response.applied_version is None  # no engine yet
    assert response.restart_required == []


def test_configured_channels_are_reported_but_never_their_credentials(configured_client: TestClient) -> None:
    response = configured_client.get("/api/settings")
    notifications = SettingsResponse.model_validate(response.json()).settings.notifications
    assert notifications.telegram_configured and notifications.discord_configured
    assert notifications.email_configured
    assert "telegram-token-value" not in response.text and "discord-secret-value" not in response.text


def test_a_client_can_never_enable_live_trading_or_fake_a_channel(client: TestClient, db: Database) -> None:
    before = get(client).settings
    response = put(
        client,
        {
            "trading": {"live_trading": True, "paper_trading": False},
            "notifications": {"telegram_configured": True, "email_configured": True},
            "version": 999,
        },
    )
    settings = response.settings
    assert (settings.trading.live_trading, settings.trading.paper_trading) == (False, True)
    assert not settings.notifications.telegram_configured and not settings.notifications.email_configured
    assert settings.version == before.version  # nothing editable changed: nothing saved
    assert settings_events(client) == []
    assert db.get_settings().trading.live_trading is False


def test_live_mode_is_shown_from_the_environment(tmp_path: Path) -> None:
    config = make_config(tmp_path, trading_mode="live")
    db = Database(config.tradebot_db).init()
    stored = db.get_settings()
    db.save_settings(
        stored.model_copy(update={"trading": stored.trading.model_copy(update={"live_trading": False})})
    )
    with TestClient(tune_for_tests(create_app(config, db))) as client:
        trading = get(client).settings.trading
        assert (trading.live_trading, trading.paper_trading) == (True, False)
        trading = put(client, {"trading": {"live_trading": False, "paper_trading": True}}).settings.trading
        assert (trading.live_trading, trading.paper_trading) == (True, False)
    db.close()


# --------------------------------------------------------------------------
# Updates
# --------------------------------------------------------------------------


def test_partial_update_merges_saves_and_announces(client: TestClient, db: Database) -> None:
    before = get(client).settings
    response = put(
        client, {"risk": {"max_positions": 5, "min_ai_confidence": 70}, "ai": {"temperature": 0.4}}
    )
    after = response.settings
    assert after.version == before.version + 1 and after.updated_at is not None
    assert (after.risk.max_positions, after.risk.min_ai_confidence, after.ai.temperature) == (5, 70.0, 0.4)
    # everything that was not sent is unchanged
    assert after.trading == before.trading and after.execution == before.execution
    assert after.risk.risk_per_trade_pct == before.risk.risk_per_trade_pct
    assert after.ai.model == before.ai.model
    assert db.get_settings().risk.max_positions == 5
    assert settings_events(client) == [
        {
            "version": after.version,
            "changed": ["risk.max_positions", "risk.min_ai_confidence", "ai.temperature"],
        }
    ]


def test_saving_the_same_values_is_a_no_op(client: TestClient) -> None:
    current = get(client).settings
    again = put(client, current.model_dump(mode="json"))
    assert again.settings.version == current.version
    assert settings_events(client) == []


def test_symbols_are_normalized(client: TestClient) -> None:
    settings = put(
        client,
        {
            "trading": {"symbols": [" eth/usdt", "BTC/USDT", "pepe/usdt"], "primary_symbol": "Eth/Usdt"},
            "notifications": {"email_to": "  me@example.com ", "events": ["TRADE_OPENED", "TRADE_OPENED"]},
            "ai": {"model": " openai/gpt-4o-mini ", "fallback_models": ["anthropic/claude-haiku-4.5"]},
        },
    ).settings
    assert settings.trading.symbols == ["ETH/USDT", "BTC/USDT", "PEPE/USDT"]
    assert settings.trading.primary_symbol == "ETH/USDT"
    assert settings.notifications.email_to == "me@example.com"
    assert settings.notifications.events == ["TRADE_OPENED"]
    assert settings.ai.model == "openai/gpt-4o-mini"


@pytest.mark.parametrize(
    ("body", "loc"),
    [
        ({"trading": {"symbols": ["BTCUSDT"]}}, ["body", "trading", "symbols", 0]),
        ({"trading": {"symbols": ["BTC/USDT", "btc/usdt"]}}, ["body", "trading", "symbols", 1]),
        ({"trading": {"symbols": ["B/USDT"]}}, ["body", "trading", "symbols", 0]),
        (
            {"trading": {"symbols": ["BTC/USDT"], "primary_symbol": "ETH/USDT"}},
            ["body", "trading", "primary_symbol"],
        ),
        ({"trading": {"primary_symbol": "DOGE/USDT"}}, ["body", "trading", "primary_symbol"]),
        ({"trading": {"symbols": []}}, ["body", "trading", "symbols"]),
        ({"trading": {"symbols": [f"C{i:02d}/USDT" for i in range(11)]}}, ["body", "trading", "symbols"]),
        ({"trading": {"decision_timeframe": "2m"}}, ["body", "trading", "decision_timeframe"]),
        ({"trading": {"strategy": "yolo"}}, ["body", "trading", "strategy"]),
        ({"risk": {"risk_per_trade_pct": 6}}, ["body", "risk", "risk_per_trade_pct"]),
        ({"risk": {"max_positions": 0}}, ["body", "risk", "max_positions"]),
        ({"risk": {"min_ai_confidence": 101}}, ["body", "risk", "min_ai_confidence"]),
        ({"risk": {"max_daily_loss_usd": "lots"}}, ["body", "risk", "max_daily_loss_usd"]),
        ({"execution": {"order_type": "stop"}}, ["body", "execution", "order_type"]),
        ({"ai": {"model": "no-slash"}}, ["body", "ai", "model"]),
        ({"ai": {"fallback_models": ["anthropic/claude-haiku-4.5"]}}, ["body", "ai", "fallback_models", 0]),
        ({"ai": {"temperature": 3}}, ["body", "ai", "temperature"]),
        ({"notifications": {"email_to": "not-an-address"}}, ["body", "notifications", "email_to"]),
        ({"notifications": {"events": ["SOMETHING"]}}, ["body", "notifications", "events", 0]),
    ],
)
def test_invalid_settings_are_rejected_with_the_field_path(client: TestClient, body: dict, loc: list) -> None:
    version = get(client).settings.version
    response = client.put("/api/settings", json=body)
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert loc in [error["loc"] for error in detail], detail
    assert all(error["msg"] for error in detail)
    assert get(client).settings.version == version and settings_events(client) == []


def test_every_error_is_reported_at_once(client: TestClient) -> None:
    response = client.put(
        "/api/settings",
        json={"trading": {"symbols": ["bad", "ETH/USDT", "eth/usdt"]}, "notifications": {"email_to": "x"}},
    )
    locs = [error["loc"] for error in response.json()["detail"]]
    assert locs == [
        ["body", "trading", "symbols", 0],
        ["body", "trading", "symbols", 2],
        ["body", "trading", "primary_symbol"],
        ["body", "notifications", "email_to"],
    ]


# --------------------------------------------------------------------------
# What the engine has applied
# --------------------------------------------------------------------------


def test_applied_version_follows_the_engine(client: TestClient, db: Database) -> None:
    saved = put(client, {"risk": {"max_positions": 4}}).settings
    db.put_live("status", f.engine_status(settings_version=saved.version - 1))
    pending = get(client)
    assert pending.applied_version == saved.version - 1 and pending.restart_required == []

    db.put_live("status", f.engine_status(settings_version=saved.version))
    assert get(client).applied_version == saved.version

    db.put_live(
        "status",
        f.engine_status(settings_version=saved.version, heartbeat_at=utcnow() - timedelta(minutes=5)),
    )
    assert get(client).applied_version is None  # an offline engine applies nothing


def test_restart_required_lists_what_the_running_engine_did_not_pick_up(
    client: TestClient, db: Database
) -> None:
    saved = put(
        client,
        {"trading": {"symbols": ["BTC/USDT", "ETH/USDT"], "strategy": "hybrid", "decision_timeframe": "15m"}},
    ).settings
    db.put_live(
        "status",
        f.engine_status(
            settings_version=saved.version,
            symbols=["BTC/USDT", "ETH/USDT", "SOL/USDT"],
            strategy="hybrid",
            decision_timeframe="5m",
        ),
    )
    assert get(client).restart_required == ["trading.symbols", "trading.decision_timeframe"]


def test_the_response_is_the_stored_document(client: TestClient, db: Database) -> None:
    response = put(client, {"execution": {"fee_bps": 7.5}})
    stored = db.get_settings()
    assert BotSettings.model_validate(response.settings.model_dump()) == stored


def test_reading_never_writes_settings(client: TestClient, db: Database) -> None:
    """Only PUT saves: concurrent readers on a fresh database (REST threads, the WebSocket
    hub) must not race each other into extra versions or overwrite a save with defaults."""
    for path in ("/api/settings", "/api/status", "/api/system", "/api/ai/models", "/api/market/regime"):
        assert client.get(path).status_code == 200, path
    with client.websocket_connect("/ws") as ws:
        assert ws_receive(ws)["type"] == "hello"
    assert db.read_one("SELECT COUNT(*) AS n FROM settings")["n"] == 0
    assert get(client).settings.version == 0  # the defaults, not yet saved by anyone
    assert put(client, {"risk": {"max_positions": 4}}).settings.version == 1
