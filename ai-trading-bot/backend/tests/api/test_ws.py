"""WebSocket hub: greeting, streaming, resume, chart subscriptions, client frames, back-pressure."""

from __future__ import annotations

import json
import time
from collections.abc import Iterator
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from tradebot.api.ws import HubOptions, SendQueue
from tradebot.db import Database, utcnow
from tradebot.indicators import OVERLAY_KEYS
from tradebot.schemas import BotSettings, Candle, MarketSnapshot, Trade

from . import factories as f
from .conftest import Seed, tune_for_tests, ws_receive, ws_receive_until

SNAPSHOT_TYPES = [
    "hello",
    "status",
    "portfolio",
    "positions",
    "risk",
    *["ticker"] * 3,
    *["mtf", "regime"] * 3,
    *["ai_analysis"] * 3,
]


@pytest.fixture
def live(seeded: Seed, app: Any) -> Iterator[TestClient]:
    """A client whose hub primed on the seeded database (seeding happens first)."""
    with TestClient(app) as client:
        yield client


def of_type(kind: str) -> Any:
    return lambda frame: frame["type"] == kind


def skip_snapshot(ws: Any) -> list[dict[str, Any]]:
    return [ws_receive(ws) for _ in SNAPSHOT_TYPES]


def wait_for(predicate: Any, timeout: float = 5.0) -> None:
    deadline = time.monotonic() + timeout
    while not predicate():
        assert time.monotonic() < deadline, "condition not met in time"
        time.sleep(0.01)


# --------------------------------------------------------------------------
# Greeting
# --------------------------------------------------------------------------


def test_hello_then_the_snapshot_burst(live: TestClient, seeded: Seed) -> None:
    with live.websocket_connect("/ws") as ws:
        frames = skip_snapshot(ws)
    assert [fr["type"] for fr in frames] == SNAPSHOT_TYPES

    hello = frames[0]["data"]
    assert hello["last_event_id"] == 5 and hello["api_version"] and hello["server_time"].endswith("Z")
    status = frames[1]["data"]
    assert status["state"] == "online" and status["engine"]["pid"] == 4242
    assert frames[2]["data"]["equity"] == 10_250.0 and "kpis" in frames[2]["data"]
    assert [p["id"] for p in frames[3]["data"]] == [seeded.position.id]
    assert [fr["data"]["symbol"] for fr in frames[5:8]] == ["BTC/USDT", "ETH/USDT", "SOL/USDT"]
    assert [fr["data"]["symbol"] for fr in frames[8:14]] == [
        "BTC/USDT",
        "BTC/USDT",
        "ETH/USDT",
        "ETH/USDT",
        "SOL/USDT",
        "SOL/USDT",
    ]
    latest = {fr["data"]["symbol"]: fr["data"]["id"] for fr in frames[14:]}
    assert latest["BTC/USDT"] == seeded.hold.id  # the newest BTC analysis
    eth = [a for a in seeded.analyses if a.symbol == "ETH/USDT"]
    assert latest["ETH/USDT"] == max(eth, key=lambda a: a.created_at).id


def test_unpublished_state_is_left_out_of_the_snapshot(app: Any, db: Database) -> None:
    db.put_live("status", f.engine_status(heartbeat_at=utcnow() - timedelta(seconds=75)))
    with TestClient(app) as client, client.websocket_connect("/ws") as ws:
        hello, status = ws_receive(ws), ws_receive(ws)
        assert (hello["type"], hello["data"]["last_event_id"]) == ("hello", 0)
        # a heartbeat older than 60 s: the engine is reported offline, its last status kept
        assert status["type"] == "status"
        assert (status["data"]["state"], status["data"]["online"]) == ("offline", False)
        assert status["data"]["heartbeat_age_sec"] >= 75
        ws.send_json({"type": "ping"})
        assert ws_receive_until(ws, lambda fr: fr["type"] != "status")["type"] == "pong"


def test_status_is_repeated_so_a_silent_engine_turns_degraded(app: Any, db: Database) -> None:
    db.put_live("status", f.engine_status(heartbeat_at=utcnow() - timedelta(seconds=9.0)))
    with TestClient(app) as client, client.websocket_connect("/ws") as ws:
        ws_receive(ws)  # hello
        assert ws_receive(ws)["data"]["state"] == "online"
        # no engine write happens: the hub's periodic status frames age the heartbeat
        degraded = ws_receive_until(
            ws, lambda fr: fr["type"] == "status" and fr["data"]["state"] == "degraded", timeout=5
        )
        assert degraded["data"]["heartbeat_age_sec"] >= 10


# --------------------------------------------------------------------------
# Streaming
# --------------------------------------------------------------------------


def test_new_events_stream_with_their_full_payloads(live: TestClient, db: Database) -> None:
    with live.websocket_connect("/ws") as ws:
        skip_snapshot(ws)

        event_id = db.append_event("SYSTEM_INFO", "Engine started", "Paper trading on 3 symbols")
        frame = ws_receive_until(ws, of_type("event"))
        assert frame["data"]["id"] == event_id and frame["data"]["title"] == "Engine started"

        analysis = f.insert_analysis(db, f.analysis(symbol="ETH/USDT", signal="SHORT", confidence=81.0))
        db.append_event(
            "AI_ANALYSIS",
            "SHORT ETH/USDT",
            "81% confidence",
            symbol="ETH/USDT",
            data={"analysis_id": analysis.id, "signal": "SHORT", "confidence": 81.0},
        )
        event = ws_receive_until(ws, of_type("event"))
        assert event["data"]["type"] == "AI_ANALYSIS"
        pushed = ws_receive(ws)  # right behind its event
        assert pushed["type"] == "ai_analysis" and pushed["data"]["id"] == analysis.id
        assert pushed["data"]["risk"]["status"] == "APPROVED"

        trade = f.insert_trade(db, f.trade(pnl=18.0, closed_at=utcnow(), exit_reason="TAKE_PROFIT"))
        db.append_event(
            "TAKE_PROFIT", "Take profit", "+18.00", symbol="BTC/USDT", data={"trade_id": trade.id}
        )
        assert ws_receive_until(ws, of_type("event"))["data"]["type"] == "TAKE_PROFIT"
        closed = ws_receive(ws)
        assert closed["type"] == "trade_closed"
        assert Trade.model_validate(closed["data"]) == trade


def test_a_close_event_without_a_stored_trade_streams_alone(live: TestClient, db: Database) -> None:
    with live.websocket_connect("/ws") as ws:
        skip_snapshot(ws)
        db.append_event("STOP_LOSS", "Stop loss", "-9.00", data={"trade_id": "pos_000000000bad"})
        db.append_event("SYSTEM_INFO", "Next", "")
        frames = [ws_receive_until(ws, lambda fr: fr["type"] != "status") for _ in range(2)]
        assert [fr["type"] for fr in frames] == ["event", "event"]


def test_live_state_changes_are_pushed(live: TestClient, db: Database) -> None:
    with live.websocket_connect("/ws") as ws:
        skip_snapshot(ws)
        db.put_live("ticker:BTC/USDT", f.ticker("BTC/USDT", 98_123.0))
        ticker = ws_receive_until(ws, of_type("ticker"))
        assert (ticker["data"]["symbol"], ticker["data"]["price"]) == ("BTC/USDT", 98_123.0)

        db.put_live("portfolio", f.portfolio_state(equity=10_400.0, open_positions=0))
        portfolio = ws_receive_until(ws, of_type("portfolio"))
        assert portfolio["data"]["equity"] == 10_400.0
        assert portfolio["data"]["kpis"]["equity"]["value"] == 10_400.0
        assert portfolio["data"]["kpis"]["open_positions"]["value"] == 0

        db.put_live("positions", [])
        assert ws_receive_until(ws, of_type("positions"))["data"] == []
        db.put_live("risk", f.risk_snapshot(trading_allowed=False, halt_reason="Daily loss limit"))
        assert ws_receive_until(ws, of_type("risk"))["data"]["halt_reason"] == "Daily loss limit"
        db.put_live("mtf:SOL/USDT", f.mtf_report("SOL/USDT"))
        assert ws_receive_until(ws, of_type("mtf"))["data"]["symbol"] == "SOL/USDT"
        db.put_live("regime:ETH/USDT", f.regime_state("ETH/USDT", "RANGING"))
        assert ws_receive_until(ws, of_type("regime"))["data"]["regime"] == "RANGING"


def test_new_unread_notifications_are_pushed(live: TestClient, db: Database) -> None:
    with live.websocket_connect("/ws") as ws:
        skip_snapshot(ws)
        quiet = db.add_notification("SYSTEM", "Already read", "")
        with db.tx() as conn:
            conn.execute("UPDATE notifications SET read = 1 WHERE id = ?", (quiet,))
        loud = db.add_notification("TAKE_PROFIT_HIT", "Take profit BTC/USDT", "+31.00", severity="success")
        frame = ws_receive_until(ws, of_type("notification"))
        assert (frame["data"]["id"], frame["data"]["read"]) == (loud, False)


def test_a_settings_save_reaches_every_dashboard(live: TestClient) -> None:
    with live.websocket_connect("/ws") as first, live.websocket_connect("/ws") as second:
        skip_snapshot(first)
        skip_snapshot(second)
        saved = live.put("/api/settings", json={"risk": {"max_positions": 5}}).json()["settings"]
        for ws in (first, second):
            event = ws_receive_until(ws, of_type("event"))
            assert event["data"]["type"] == "SETTINGS_CHANGED"
            assert event["data"]["data"] == {"version": saved["version"], "changed": ["risk.max_positions"]}
            pushed = BotSettings.model_validate(ws_receive(ws)["data"])
            assert pushed.risk.max_positions == 5 and pushed.version == saved["version"]


def test_history_the_engine_catches_up_on_streams_as_plain_events(live: TestClient, db: Database) -> None:
    analysis = f.insert_analysis(db, f.analysis(created_at=utcnow() - timedelta(days=2)))
    with live.websocket_connect("/ws") as ws:
        skip_snapshot(ws)
        db.append_event(
            "AI_ANALYSIS",
            "LONG BTC/USDT",
            "bootstrap",
            data={"analysis_id": analysis.id},
            ts=utcnow() - timedelta(days=2),
        )
        db.append_event("SYSTEM_INFO", "Bootstrap complete", "")
        frames = [ws_receive_until(ws, lambda fr: fr["type"] != "status") for _ in range(2)]
        assert [(fr["type"], fr["data"]["type"]) for fr in frames] == [
            ("event", "AI_ANALYSIS"),
            ("event", "SYSTEM_INFO"),
        ]


# --------------------------------------------------------------------------
# Resume
# --------------------------------------------------------------------------


def test_resume_replays_the_missed_events_in_order(live: TestClient) -> None:
    with live.websocket_connect("/ws") as ws:
        assert skip_snapshot(ws)[0]["data"]["last_event_id"] == 5
        ws.send_json({"type": "resume", "last_event_id": 2})
        replayed = [ws_receive_until(ws, of_type("event"))["data"]["id"] for _ in range(3)]
        assert replayed == [3, 4, 5]
        # nothing to replay when the client is up to date
        ws.send_json({"type": "resume", "last_event_id": 5})
        ws.send_json({"type": "ping"})
        assert ws_receive_until(ws, lambda fr: fr["type"] != "status")["type"] == "pong"


def test_resume_is_capped_at_the_newest_500(live: TestClient, app: Any, db: Database) -> None:
    with db.tx() as conn:
        for i in range(600):
            db.append_event("MARKET_UPDATE", f"close {i}", "", conn=conn)
    hub = app.state.ctx.hub
    wait_for(lambda: hub.last_event_id == 605)
    with live.websocket_connect("/ws") as ws:
        assert skip_snapshot(ws)[0]["data"]["last_event_id"] == 605
        ws.send_json({"type": "resume", "last_event_id": 0})
        ids = [ws_receive_until(ws, of_type("event"))["data"]["id"] for _ in range(500)]
        assert ids == list(range(106, 606))
        ws.send_json({"type": "ping"})
        assert ws_receive_until(ws, lambda fr: fr["type"] != "status")["type"] == "pong"


# --------------------------------------------------------------------------
# Chart subscriptions
# --------------------------------------------------------------------------


def candle_frame(ws: Any) -> dict[str, Any]:
    return ws_receive_until(ws, of_type("candle"))["data"]


def test_subscribed_charts_stream_candles_with_overlay_values(live: TestClient, db: Database) -> None:
    rest = MarketSnapshot.model_validate(
        live.get("/api/market", params={"symbol": "BTC/USDT", "timeframe": "1m", "limit": 300}).json()
    )
    last = rest.candles[-1]
    with live.websocket_connect("/ws") as ws:
        skip_snapshot(ws)
        ws.send_json({"type": "subscribe_chart", "charts": [{"symbol": "btc/usdt", "timeframe": "1m"}]})

        forming = candle_frame(ws)
        assert (forming["symbol"], forming["timeframe"], forming["closed"]) == ("BTC/USDT", "1m", False)
        assert forming["candle"] == last.model_dump()
        assert set(forming["indicators"]) == set(OVERLAY_KEYS)
        # the live values continue the REST overlay series exactly
        for name, points in rest.indicators:
            assert forming["indicators"][name] == points[-1].value, name

        updated = last.model_copy(
            update={"close": last.close + 25.0, "high": max(last.high, last.close + 25.0)}
        )
        f.insert_candles(db, "BTC/USDT", "1m", [updated])
        frame = candle_frame(ws)
        assert (frame["candle"]["close"], frame["closed"]) == (updated.close, False)

        following = Candle(
            time=last.time + 60,
            open=updated.close,
            high=updated.close + 5,
            low=updated.close - 5,
            close=updated.close + 1,
            volume=3.0,
        )
        f.insert_candles(db, "BTC/USDT", "1m", [following])
        final = candle_frame(ws)
        assert (final["candle"]["time"], final["candle"]["close"], final["closed"]) == (
            last.time,
            updated.close,
            True,
        )
        opened = candle_frame(ws)
        assert (opened["candle"]["time"], opened["closed"]) == (following.time, False)


def test_unchanged_candles_are_not_resent(live: TestClient, db: Database) -> None:
    with live.websocket_connect("/ws") as ws:
        skip_snapshot(ws)
        ws.send_json({"type": "subscribe_chart", "charts": [{"symbol": "BTC/USDT", "timeframe": "1m"}]})
        first = candle_frame(ws)
        time.sleep(0.3)  # ~15 polls without a candle change
        db.append_event("SYSTEM_INFO", "marker", "")
        frames = []
        while (frame := ws_receive_until(ws, lambda fr: fr["type"] != "status"))["type"] != "event":
            frames.append(frame)
        assert frames == [] and first["closed"] is False


def test_subscriptions_are_replaced_capped_and_validated(live: TestClient, app: Any) -> None:
    hub = app.state.ctx.hub
    charts = [
        {"symbol": s, "timeframe": tf}
        for s in ("BTC/USDT", "ETH/USDT")
        for tf in ("1m", "5m", "15m", "1h", "4h")
    ]
    with live.websocket_connect("/ws") as ws:
        skip_snapshot(ws)
        ws.send_json(
            {
                "type": "subscribe_chart",
                "charts": [*charts[:2], charts[0], {"symbol": "bad", "timeframe": "1m"}],
            }
        )
        error = ws_receive_until(ws, of_type("error"))["data"]
        assert error["code"] == "invalid_symbol" and "bad" in error["message"]
        ws.send_json({"type": "subscribe_chart", "charts": charts})  # 10 pairs: the first 8 count
        ws.send_json({"type": "ping"})
        ws_receive_until(ws, of_type("pong"))
        (conn,) = hub._connections
        assert conn.charts == [(c["symbol"], c["timeframe"]) for c in charts[:8]]
        ws.send_json({"type": "subscribe_chart", "charts": []})
        ws.send_json({"type": "ping"})
        ws_receive_until(ws, of_type("pong"))
        assert conn.charts == []


# --------------------------------------------------------------------------
# Client frames
# --------------------------------------------------------------------------


def test_ping_pong(live: TestClient) -> None:
    with live.websocket_connect("/ws") as ws:
        skip_snapshot(ws)
        ws.send_json({"type": "ping"})
        pong = ws_receive_until(ws, of_type("pong"))
        assert pong["data"]["server_time"].endswith("Z")


@pytest.mark.parametrize(
    ("send", "code"),
    [
        (lambda ws: ws.send_text("not json"), "invalid_message"),
        (lambda ws: ws.send_json({"type": "subscribe"}), "invalid_message"),
        (lambda ws: ws.send_json({"type": "resume"}), "invalid_message"),
        (
            lambda ws: ws.send_json(
                {"type": "subscribe_chart", "charts": [{"symbol": "BTC/USDT", "timeframe": "2m"}]}
            ),
            "invalid_message",
        ),
        (lambda ws: ws.send_bytes(b"\x00\x01"), "invalid_message"),
        (lambda ws: ws.send_text(json.dumps({"type": "ping", "pad": "x" * 20_000})), "frame_too_large"),
    ],
)
def test_invalid_frames_get_an_error_frame_and_the_connection_stays(
    live: TestClient, send: Any, code: str
) -> None:
    with live.websocket_connect("/ws") as ws:
        skip_snapshot(ws)
        send(ws)
        error = ws_receive_until(ws, of_type("error"))["data"]
        assert error["code"] == code and error["message"]
        ws.send_json({"type": "ping"})
        assert ws_receive_until(ws, lambda fr: fr["type"] != "status")["type"] == "pong"


# --------------------------------------------------------------------------
# Lifecycle and back-pressure
# --------------------------------------------------------------------------


def test_shutdown_closes_connections_and_stops_the_broadcaster(live: TestClient, app: Any) -> None:
    hub = app.state.ctx.hub
    with live.websocket_connect("/ws") as ws:
        skip_snapshot(ws)
        assert hub.clients == 1 and hub.running
        live.portal.call(hub.stop)
        with pytest.raises(WebSocketDisconnect) as closed:
            while True:
                ws_receive(ws)
        assert closed.value.code == 1001
    assert not hub.running and hub.clients == 0 and hub.messages_sent >= len(SNAPSHOT_TYPES)


def test_a_connection_before_the_hub_is_ready_is_told_to_retry(config: Any, db: Database) -> None:
    from tradebot.api.main import create_app

    app = tune_for_tests(create_app(config, db))
    client = TestClient(app)  # no lifespan: the broadcaster never starts
    with pytest.raises(WebSocketDisconnect) as closed, client.websocket_connect("/ws") as ws:
        ws.receive_json()
    assert closed.value.code == 1011


def queue(**limits: Any) -> SendQueue:
    return SendQueue(
        HubOptions(**{"queue_soft_limit": 4, "queue_hard_limit": 6, "stuck_timeout": 60.0, **limits})
    )


def test_queue_coalesces_state_frames_in_place() -> None:
    q = queue()
    q.put("status-1", key="status")
    q.put("event-1")
    q.put("status-2", key="status")
    assert len(q) == 2 and [e.text for e in q._items] == ["status-2", "event-1"]


def test_queue_drops_ticker_and_candle_frames_first() -> None:
    q = queue()
    for i in range(4):
        assert q.put(f"ticker-{i}", key=f"ticker:{i}", droppable=True)
    assert q.put("ticker-late", key="ticker:late", droppable=True)  # full: dropped, client kept
    assert q.dropped == 1 and len(q) == 4
    assert q.put("event")  # full: the droppable frames make room for it
    assert [e.text for e in q._items] == ["event"] and q.dropped == 5


def test_queue_gives_up_on_a_client_that_cannot_keep_up() -> None:
    q = queue()
    assert all(q.put(f"event-{i}") for i in range(6))
    assert not q.put("event-6")  # hard limit reached with nothing droppable

    stuck = queue(stuck_timeout=0.05)
    for i in range(4):
        stuck.put(f"event-{i}")
    assert stuck.put("ticker", droppable=True)  # full, but only just
    time.sleep(0.08)
    assert not stuck.put("ticker", droppable=True)  # full for longer than stuck_timeout
