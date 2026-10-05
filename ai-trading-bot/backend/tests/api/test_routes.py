"""Every REST endpoint against a temporary database with realistic rows."""

from __future__ import annotations

import csv
import io
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from tradebot.db import Database, utcnow
from tradebot.schemas import (
    AIAnalysis,
    AIAnalytics,
    AIDecisionPage,
    AIModelInfo,
    BotStatus,
    EventPage,
    MarketSnapshot,
    MTFReport,
    NotificationList,
    PerformanceReport,
    Portfolio,
    Position,
    PositionDetail,
    RegimeReport,
    RiskSnapshot,
    SettingsResponse,
    SystemHealth,
    Ticker,
    TradeDetail,
    TradePage,
)

from . import factories as f
from .conftest import Seed

ENGINE_MISSING = {"detail": "Trading engine has not published state yet"}


# --------------------------------------------------------------------------
# Liveness and the "engine never published" path
# --------------------------------------------------------------------------


def test_health(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


@pytest.mark.parametrize(
    "path", ["/api/portfolio", "/api/positions", "/api/risk", "/api/market", "/api/market/watchlist"]
)
def test_live_state_endpoints_503_before_the_engine_publishes(client: TestClient, path: str) -> None:
    response = client.get(path)
    assert response.status_code == 503
    assert response.json() == ENGINE_MISSING
    assert response.headers["retry-after"] == "5"


def test_history_endpoints_answer_on_an_empty_database(client: TestClient) -> None:
    status = BotStatus.model_validate(client.get("/api/status").json())
    assert (status.state, status.online, status.engine, status.heartbeat_age_sec) == (
        "offline",
        False,
        None,
        None,
    )
    assert status.mode == "paper"

    page = TradePage.model_validate(client.get("/api/trades").json())
    assert page.total == 0 and page.items == [] and page.summary.win_rate is None

    report = PerformanceReport.model_validate(client.get("/api/performance").json())
    assert report.starting_equity == report.ending_equity == 10_000.0
    assert report.stats.total_trades == 0

    analytics = AIAnalytics.model_validate(client.get("/api/ai/analytics").json())
    assert analytics.total_signals == 0 and analytics.rejection_rate_pct == 0.0
    assert client.get("/api/ai/latest").json() is None
    assert EventPage.model_validate(client.get("/api/events").json()).items == []
    assert client.get("/api/backtests").json() == []
    assert client.get("/api/market/mtf").json() is None

    health = SystemHealth.model_validate(client.get("/api/system").json())
    states = {c.key: c.state for c in health.components}
    assert states["bot"] == "error" and states["market_data"] == "error"
    assert states["openrouter"] == "disabled" and states["api"] == "operational"


# --------------------------------------------------------------------------
# Status
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("age", "running", "state"),
    [(2, True, "online"), (25, True, "degraded"), (75, True, "offline"), (1, False, "offline")],
)
def test_status_from_heartbeat_age(
    client: TestClient, db: Database, age: int, running: bool, state: str
) -> None:
    db.put_live("status", f.engine_status(heartbeat_at=utcnow() - timedelta(seconds=age), running=running))
    status = BotStatus.model_validate(client.get("/api/status").json())
    assert status.state == state
    assert status.online is (state != "offline")
    assert status.heartbeat_age_sec == pytest.approx(age, abs=2)
    assert status.engine is not None and status.engine.pid == 4242


def test_stale_state_is_still_served(client: TestClient, db: Database) -> None:
    f.publish_live_state(db)
    db.put_live("status", f.engine_status(heartbeat_at=utcnow() - timedelta(minutes=10)))
    assert client.get("/api/portfolio").status_code == 200
    assert client.get("/api/status").json()["state"] == "offline"


# --------------------------------------------------------------------------
# Portfolio, positions, risk
# --------------------------------------------------------------------------


def test_portfolio_is_live_state_plus_kpis(client: TestClient, seeded: Seed) -> None:
    portfolio = Portfolio.model_validate(client.get("/api/portfolio").json())
    assert portfolio.equity == 10_250.0
    kpis = portfolio.kpis
    assert kpis.equity.value == 10_250.0 and kpis.equity.comparison_label == "vs 24h ago"
    assert kpis.equity.sparkline[-1] == 10_250.0
    assert kpis.total_pnl.value == 250.0
    assert kpis.today_pnl.value == 35.0 and kpis.today_pnl.comparison_label == "vs yesterday"
    assert kpis.win_rate.comparison_label == kpis.profit_factor.comparison_label == "vs prior 7d"
    assert kpis.max_drawdown.value is not None and kpis.max_drawdown.value <= 0
    assert kpis.open_positions.value == 1


def test_positions_list_and_detail(client: TestClient, seeded: Seed) -> None:
    assert seeded.position is not None
    positions = [Position.model_validate(p) for p in client.get("/api/positions").json()]
    assert [p.id for p in positions] == [seeded.position.id]

    detail = PositionDetail.model_validate(client.get(f"/api/positions/{seeded.position.id}").json())
    assert detail.analysis is not None and detail.analysis.id == seeded.position.analysis_id
    assert detail.timeframe == "5m"
    entry = int(seeded.position.opened_at.timestamp())
    assert detail.candles[0].time < entry <= detail.candles[-1].time + 300
    assert [m.kind for m in detail.markers] == ["entry_long"]
    assert detail.markers[0].time == entry - entry % 300

    hourly = PositionDetail.model_validate(
        client.get(f"/api/positions/{seeded.position.id}", params={"timeframe": "1h"}).json()
    )
    assert hourly.timeframe == "1h" and all(c.time % 3600 == 0 for c in hourly.candles)


def test_position_errors(client: TestClient, seeded: Seed) -> None:
    missing = client.get("/api/positions/pos_000000000000")
    assert missing.status_code == 404 and "not found" in missing.json()["detail"]
    assert client.get(f"/api/positions/{seeded.position.id}", params={"timeframe": "2m"}).status_code == 422


def test_risk(client: TestClient, seeded: Seed) -> None:
    risk = RiskSnapshot.model_validate(client.get("/api/risk").json())
    assert risk.max_positions == 3 and risk.meters[0].key == "daily_loss"


# --------------------------------------------------------------------------
# Trades
# --------------------------------------------------------------------------


def test_trade_page_and_summary(client: TestClient, seeded: Seed) -> None:
    page = TradePage.model_validate(client.get("/api/trades").json())
    assert page.total == 8 and len(page.items) == 8
    closed = [t.closed_at for t in page.items]
    assert closed == sorted(closed, reverse=True)
    wins = sum(1 for t in seeded.trades if t.pnl > 0)
    assert (page.summary.count, page.summary.wins, page.summary.losses) == (8, wins, 8 - wins)
    assert page.summary.win_rate == pytest.approx(wins / 8 * 100)
    assert page.summary.net_pnl == pytest.approx(sum(t.pnl for t in seeded.trades), abs=0.01)
    assert page.summary.fees == pytest.approx(16.0)


def test_trade_summary_covers_the_filtered_set_not_the_page(client: TestClient, seeded: Seed) -> None:
    page = TradePage.model_validate(client.get("/api/trades", params={"limit": 3, "offset": 3}).json())
    assert (len(page.items), page.total, page.limit, page.offset) == (3, 8, 3, 3)
    assert page.summary.count == 8
    everything = TradePage.model_validate(client.get("/api/trades").json())
    assert [t.id for t in page.items] == [t.id for t in everything.items[3:6]]


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"symbol": "btc/usdt"}, 5),
        ({"symbol": "ETH/USDT"}, 2),
        ({"side": "SHORT"}, 2),
        ({"result": "LOSS"}, 3),
        ({"exit_reason": "TAKE_PROFIT"}, 4),
        ({"strategy": "ai"}, 8),
        ({"strategy": "baseline"}, 0),
        ({"min_confidence": 75}, 4),
        ({"max_confidence": 70}, 2),
        ({"min_confidence": 70, "max_confidence": 80}, 4),
        ({"q": "breakout"}, 8),
        ({"q": "100%_"}, 0),
    ],
)
def test_trade_filters(client: TestClient, seeded: Seed, params: dict, expected: int) -> None:
    page = TradePage.model_validate(client.get("/api/trades", params=params).json())
    assert page.total == expected == len(page.items)


def test_trade_search_by_id(client: TestClient, seeded: Seed) -> None:
    target = seeded.trades[1]
    page = TradePage.model_validate(client.get("/api/trades", params={"q": target.id.upper()}).json())
    assert [t.id for t in page.items] == [target.id]
    by_analysis = TradePage.model_validate(client.get("/api/trades", params={"q": target.analysis_id}).json())
    assert [t.id for t in by_analysis.items] == [target.id]


def test_trade_time_filters(client: TestClient, seeded: Seed) -> None:
    since = (seeded.now - timedelta(hours=24)).isoformat()
    recent = TradePage.model_validate(client.get("/api/trades", params={"start": since}).json())
    assert recent.total == 4
    naive_until = (seeded.now - timedelta(hours=24)).replace(tzinfo=None).isoformat()
    older = TradePage.model_validate(client.get("/api/trades", params={"end": naive_until}).json())
    assert older.total == 4


@pytest.mark.parametrize(
    ("sort", "order", "key"),
    [
        ("pnl", "asc", lambda t: t.pnl),
        ("pnl_pct", "desc", lambda t: -t.pnl_pct),
        ("confidence", "desc", lambda t: -(t.ai_confidence or 0)),
        ("opened_at", "asc", lambda t: t.opened_at),
        ("symbol", "asc", lambda t: t.symbol),
    ],
)
def test_trade_sorting(client: TestClient, seeded: Seed, sort: str, order: str, key) -> None:
    page = TradePage.model_validate(client.get("/api/trades", params={"sort": sort, "order": order}).json())
    assert [key(t) for t in page.items] == sorted(key(t) for t in page.items)


@pytest.mark.parametrize(
    "params",
    [
        {"limit": 0},
        {"limit": 501},
        {"offset": -1},
        {"sort": "bogus"},
        {"order": "up"},
        {"side": "long"},
        {"min_confidence": 101},
        {"symbol": "BTCUSDT"},
        {"min_confidence": 80, "max_confidence": 70},
        {"start": "2026-10-02T00:00:00Z", "end": "2026-10-01T00:00:00Z"},
        {"q": "x" * 101},
    ],
)
def test_trade_query_validation(client: TestClient, params: dict) -> None:
    response = client.get("/api/trades", params=params)
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert isinstance(detail, list) and {"loc", "msg", "type"} <= detail[0].keys()


def test_trade_csv_export(client: TestClient, db: Database, seeded: Seed) -> None:
    sneaky = f.trade(
        pnl=5.0,
        closed_at=seeded.now - timedelta(hours=72),
        entry_reason='=HYPERLINK("http://evil","click")',
        symbol="SOL/USDT",
    )
    f.insert_trade(db, sneaky)
    response = client.get(
        "/api/trades/export.csv", params={"symbol": "SOL/USDT", "sort": "pnl", "order": "asc"}
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert response.headers["content-disposition"].startswith('attachment; filename="trades-')
    text = response.content.decode("utf-8")
    assert text.startswith("﻿")
    rows = list(csv.DictReader(io.StringIO(text.lstrip("﻿"))))
    assert [r["id"] for r in rows] == [seeded.trades[3].id, sneaky.id]
    assert rows[1]["entry_reason"] == '\'=HYPERLINK("http://evil","click")'
    assert rows[0]["pnl"] == "-9.0" and rows[0]["closed_at"].endswith("Z")


def test_trade_detail(client: TestClient, seeded: Seed) -> None:
    trade = seeded.trades[4]  # BTC SHORT, take profit
    detail = TradeDetail.model_validate(client.get(f"/api/trades/{trade.id}").json())
    assert detail.trade.id == trade.id and detail.analysis is not None
    assert detail.analysis.id == trade.analysis_id and detail.analysis.trade_id == trade.id
    assert [m.kind for m in detail.markers] == ["entry_short", "take_profit"]
    assert detail.markers[1].label.startswith("TP +")
    assert detail.candles[0].time < detail.markers[0].time < detail.markers[1].time <= detail.candles[-1].time

    assert client.get("/api/trades/pos_ffffffffffff").status_code == 404


def test_trade_detail_steps_up_the_timeframe_for_long_trades(
    client: TestClient, db: Database, seeded: Seed
) -> None:
    long_trade = f.insert_trade(
        db, f.trade(pnl=3.0, closed_at=seeded.now - timedelta(hours=2), duration=timedelta(days=4))
    )
    detail = TradeDetail.model_validate(client.get(f"/api/trades/{long_trade.id}").json())
    # 4 days of 5m candles (1152) would not fit a 1000-candle chart; 15m (384) does
    assert detail.timeframe == "15m"
    explicit = TradeDetail.model_validate(
        client.get(f"/api/trades/{long_trade.id}", params={"timeframe": "5m"}).json()
    )
    assert explicit.timeframe == "5m" and len(explicit.candles) <= 1000


# --------------------------------------------------------------------------
# Performance
# --------------------------------------------------------------------------


@pytest.mark.parametrize("range_", ["24h", "7d", "30d", "90d", "all"])
def test_performance_ranges(client: TestClient, seeded: Seed, range_: str) -> None:
    report = PerformanceReport.model_validate(client.get("/api/performance", params={"range": range_}).json())
    assert report.range == range_
    assert 2 <= len(report.equity_curve) <= 1000
    assert report.ending_equity == 10_250.0
    times = [p.time for p in report.equity_curve]
    assert times == sorted(set(times))
    if range_ != "24h":
        assert report.stats.total_trades == 8
        assert {b.symbol for b in report.by_symbol} == {"BTC/USDT", "ETH/USDT", "SOL/USDT"}
        assert sum(b.count for b in report.distribution) == 8


def test_performance_rejects_unknown_range(client: TestClient) -> None:
    assert client.get("/api/performance", params={"range": "1y"}).status_code == 422


# --------------------------------------------------------------------------
# AI
# --------------------------------------------------------------------------


def test_ai_latest(client: TestClient, seeded: Seed) -> None:
    latest = AIAnalysis.model_validate(client.get("/api/ai/latest").json())
    assert latest.id == seeded.hold.id  # the newest analysis overall
    eth = AIAnalysis.model_validate(client.get("/api/ai/latest", params={"symbol": "eth/usdt"}).json())
    assert eth.symbol == "ETH/USDT"
    assert client.get("/api/ai/latest", params={"symbol": "DOGE/USDT"}).json() is None
    assert client.get("/api/ai/latest", params={"symbol": "nope"}).status_code == 422


def test_ai_history_filters_and_paging(client: TestClient, seeded: Seed) -> None:
    page = AIDecisionPage.model_validate(client.get("/api/ai/history").json())
    assert page.total == 11 and len(page.items) == 11
    created = [a.created_at for a in page.items]
    assert created == sorted(created, reverse=True)

    def total(**params: object) -> int:
        return client.get("/api/ai/history", params=params).json()["total"]

    assert total(signal="HOLD") == 1
    assert total(risk_status="REJECTED") == 1
    assert total(symbol="ETH/USDT") == 2
    assert total(provider="openrouter") == 0
    assert total(min_confidence=80) == 2
    second = AIDecisionPage.model_validate(
        client.get("/api/ai/history", params={"limit": 4, "offset": 4}).json()
    )
    assert [a.id for a in second.items] == [a.id for a in page.items[4:8]]
    assert client.get("/api/ai/history", params={"limit": 201}).status_code == 422
    assert client.get("/api/ai/history", params={"risk_status": "MAYBE"}).status_code == 422


def test_ai_analytics_endpoint(client: TestClient, seeded: Seed) -> None:
    analytics = AIAnalytics.model_validate(client.get("/api/ai/analytics", params={"range": "7d"}).json())
    assert analytics.total_signals == 11 and analytics.hold_signals == 1
    assert analytics.executed_trades == 8 and analytics.signals_rejected == 1
    assert [b.label for b in analytics.buckets] == ["50–60%", "60–70%", "70–80%", "80–90%", "90–100%"]
    assert analytics.usage.requests_total == 6


def test_ai_models_never_return_key_material(client: TestClient) -> None:
    info = AIModelInfo.model_validate(client.get("/api/ai/models").json())
    assert info.configured is False and info.api_key_hint is None
    assert info.active_provider == "heuristic"
    assert info.current_model in {o.id for o in info.options}
    assert sum(o.recommended for o in info.options) == 1


def test_ai_models_list_a_custom_current_model(client: TestClient, db: Database) -> None:
    settings = db.get_settings()
    db.save_settings(
        settings.model_copy(update={"ai": settings.ai.model_copy(update={"model": "acme/custom-1"})})
    )
    info = AIModelInfo.model_validate(client.get("/api/ai/models").json())
    assert info.current_model == "acme/custom-1"
    assert info.options[-1].id == "acme/custom-1"


# --------------------------------------------------------------------------
# Market
# --------------------------------------------------------------------------


def test_market_snapshot(client: TestClient, seeded: Seed) -> None:
    snapshot = MarketSnapshot.model_validate(client.get("/api/market", params={"limit": 300}).json())
    assert (snapshot.symbol, snapshot.timeframe, snapshot.feed) == ("BTC/USDT", "5m", "simulated")
    assert len(snapshot.candles) == 300
    times = [c.time for c in snapshot.candles]
    assert times == sorted(times) and all(t % 300 == 0 for t in times)
    # overlays start settled at the first visible candle thanks to the warm-up history
    for name, points in snapshot.indicators:
        assert [p.time for p in points] == times, name
    assert snapshot.markers, "trades on the visible candles are marked"
    assert all(times[0] <= m.time <= times[-1] for m in snapshot.markers)
    assert [m.time for m in snapshot.markers] == sorted(m.time for m in snapshot.markers)
    assert {lvl.kind for lvl in snapshot.levels} == {"entry", "stop_loss", "take_profit"}
    assert snapshot.ticker is not None and snapshot.ticker.symbol == "BTC/USDT"


def test_market_snapshot_parameters(client: TestClient, seeded: Seed) -> None:
    hourly = MarketSnapshot.model_validate(
        client.get("/api/market", params={"symbol": "btc/usdt", "timeframe": "1h", "limit": 50}).json()
    )
    assert hourly.timeframe == "1h" and len(hourly.candles) == 50
    eth = MarketSnapshot.model_validate(client.get("/api/market", params={"symbol": "ETH/USDT"}).json())
    assert eth.levels == []  # the open position is on BTC
    assert client.get("/api/market", params={"symbol": "DOGE/USDT"}).status_code == 404
    for params in ({"limit": 5}, {"limit": 1001}, {"timeframe": "3m"}, {"symbol": "BTC-USDT"}):
        assert client.get("/api/market", params=params).status_code == 422


def test_watchlist_follows_the_engine_symbols(client: TestClient, seeded: Seed) -> None:
    tickers = [Ticker.model_validate(t) for t in client.get("/api/market/watchlist").json()]
    assert [t.symbol for t in tickers] == ["BTC/USDT", "ETH/USDT", "SOL/USDT"]
    assert all(len(t.sparkline) == 24 for t in tickers)


def test_mtf_and_regime(client: TestClient, seeded: Seed) -> None:
    mtf = MTFReport.model_validate(client.get("/api/market/mtf", params={"symbol": "ETH/USDT"}).json())
    assert mtf.symbol == "ETH/USDT" and mtf.aligned_count == 4

    report = RegimeReport.model_validate(client.get("/api/market/regime").json())
    assert report.symbol == "BTC/USDT" and report.current is not None
    by_regime = {p.regime: p for p in report.performance}
    assert "UNKNOWN" not in by_regime and len(by_regime) == 6
    bullish = by_regime["TRENDING_BULLISH"]
    assert (bullish.trades, bullish.wins, bullish.win_rate, bullish.profit_factor) == (3, 3, 100.0, None)
    assert bullish.total_pnl == 79.0
    volatile = by_regime["HIGH_VOLATILITY"]
    assert (volatile.trades, volatile.wins, volatile.total_pnl, volatile.profit_factor) == (1, 0, -22.0, 0.0)
    # the segment that ended 20 days ago overlaps the 30-day window; none is older than that
    assert [s.regime for s in report.history] == ["RANGING", "LOW_VOLATILITY", "TRENDING_BULLISH"]
    assert report.history[-1].end is None
    assert client.get("/api/market/regime", params={"symbol": "XRP/USDT"}).status_code == 404


# --------------------------------------------------------------------------
# Events and notifications
# --------------------------------------------------------------------------


def test_events_paging_and_filters(client: TestClient, seeded: Seed) -> None:
    page = EventPage.model_validate(client.get("/api/events", params={"limit": 2}).json())
    assert page.total == 5 and page.has_more and [e.id for e in page.items] == [5, 4]
    older = EventPage.model_validate(client.get("/api/events", params={"limit": 2, "before_id": 4}).json())
    assert [e.id for e in older.items] == [3, 2] and older.has_more
    last = EventPage.model_validate(client.get("/api/events", params={"limit": 2, "before_id": 2}).json())
    assert [e.id for e in last.items] == [1] and not last.has_more

    def ids(**params: object) -> list[int]:
        return [e["id"] for e in client.get("/api/events", params=params).json()["items"]]

    assert ids(types="AI_ANALYSIS,TRADE_REJECTED") == [3, 2]
    assert client.get("/api/events?types=AI_ANALYSIS&types=MARKET_UPDATE").json()["total"] == 2
    assert ids(severity="warning") == [4, 3]
    assert ids(severity="error,warning", symbol="BTC/USDT") == [3]
    assert client.get("/api/events", params={"types": "NOPE"}).status_code == 422
    assert client.get("/api/events", params={"severity": "fatal"}).status_code == 422
    assert client.get("/api/events", params={"limit": 501}).status_code == 422


def test_notifications_and_mark_read(client: TestClient, seeded: Seed) -> None:
    listing = NotificationList.model_validate(client.get("/api/notifications").json())
    assert (listing.total, listing.unread_count) == (3, 2)
    assert [n.id for n in listing.items] == [3, 2, 1]
    unread = NotificationList.model_validate(
        client.get("/api/notifications", params={"unread_only": True}).json()
    )
    assert [n.id for n in unread.items] == [2, 1] and unread.total == 2

    after_one = NotificationList.model_validate(
        client.post("/api/notifications/read", json={"ids": [1]}).json()
    )
    assert after_one.unread_count == 1
    assert {n.id: n.read for n in after_one.items} == {3: True, 2: False, 1: True}
    after_all = NotificationList.model_validate(client.post("/api/notifications/read", json={}).json())
    assert after_all.unread_count == 0
    too_many = client.post("/api/notifications/read", json={"ids": list(range(1_001))})
    assert too_many.status_code == 422


# --------------------------------------------------------------------------
# Settings (details in test_settings.py), system and error shapes
# --------------------------------------------------------------------------


def test_settings_roundtrip_shape(client: TestClient, seeded: Seed) -> None:
    response = SettingsResponse.model_validate(client.get("/api/settings").json())
    assert response.settings.trading.symbols == ["BTC/USDT", "ETH/USDT", "SOL/USDT"]
    assert response.applied_version == 1  # the engine status reports version 1


def test_system_health(client: TestClient, seeded: Seed) -> None:
    health = SystemHealth.model_validate(client.get("/api/system").json())
    assert [c.key for c in health.components] == [
        "bot",
        "api",
        "openrouter",
        "market_data",
        "database",
        "websocket",
    ]
    states = {c.key: c.state for c in health.components}
    assert states == {
        "bot": "operational",
        "api": "operational",
        "openrouter": "disabled",
        "market_data": "operational",
        "database": "operational",
        "websocket": "operational",
    }
    assert health.database.tables["trades"] == 8 and health.database.size_mb > 0
    assert [e.type for e in health.recent_issues] == ["API_ERROR", "SYSTEM_WARNING", "TRADE_REJECTED"]
    assert health.engine_uptime_sec == pytest.approx(3 * 3600, abs=60)
    assert health.host.cpu_count >= 1 and health.api.pid > 0


def market_data(client: TestClient) -> tuple[str, str, dict]:
    health = SystemHealth.model_validate(client.get("/api/system").json())
    component = next(c for c in health.components if c.key == "market_data")
    return component.state, component.message, component.details


SIM_MESSAGE = "Simulated market (deterministic, seed 7)"


def test_a_simulator_chosen_on_purpose_is_healthy(client: TestClient, db: Database) -> None:
    f.publish_live_state(db)
    db.put_live("status", f.engine_status(feed_message=SIM_MESSAGE))
    assert market_data(client)[:2] == ("operational", SIM_MESSAGE)


def test_the_simulator_after_a_binance_fallback_is_a_warning(client: TestClient, db: Database) -> None:
    f.publish_live_state(db)
    started = utcnow() - timedelta(hours=1)
    db.put_live("status", f.engine_status(feed_message=SIM_MESSAGE, started_at=started))
    db.add_notification(
        "MARKET_DATA_UNAVAILABLE",
        "Binance unreachable — using the simulator",
        "Live market data could not be reached (403 Forbidden).",
        severity="warning",
        data={"error": "403 Forbidden"},
        ts=started + timedelta(seconds=4),
    )
    state, message, details = market_data(client)
    assert (state, message) == ("warning", f"Binance unreachable — {SIM_MESSAGE}")
    assert details["fallback_reason"] == "403 Forbidden"

    # a fallback from an earlier engine run does not count for this one
    db.put_live(
        "status", f.engine_status(feed_message=SIM_MESSAGE, started_at=utcnow() - timedelta(minutes=5))
    )
    assert market_data(client)[0] == "operational"


def test_market_data_while_starting_and_when_stale(client: TestClient, db: Database) -> None:
    phase = "Bootstrapping: replaying 14 days of simulated market"
    db.put_live("status", f.engine_status(feed_message=phase))
    assert market_data(client)[:2] == ("warning", phase)  # no tick yet

    db.put_live("ticker:BTC/USDT", f.ticker("BTC/USDT", ts=utcnow() - timedelta(seconds=30)))
    assert market_data(client)[1].startswith("Market data delayed")
    db.put_live("ticker:BTC/USDT", f.ticker("BTC/USDT", ts=utcnow() - timedelta(minutes=3)))
    assert market_data(client)[:2] == ("error", "Market data stale — last tick 3 min ago")
    db.put_live("status", f.engine_status(feed="binance", feed_connected=False, feed_message="stream lost"))
    assert market_data(client)[:2] == ("error", "Binance feed disconnected: stream lost")


def test_unknown_api_paths_and_methods_are_json(client: TestClient) -> None:
    missing = client.get("/api/does-not-exist")
    assert missing.status_code == 404 and missing.json() == {"detail": "Not Found"}
    wrong_method = client.post("/api/status")
    assert wrong_method.status_code == 405 and wrong_method.json() == {"detail": "Method Not Allowed"}


def test_unexpected_errors_become_json_500(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from tradebot.api import queries

    def explode(*_args: object, **_kwargs: object) -> None:
        raise RuntimeError("database exploded with secret details")

    monkeypatch.setattr(queries, "trade_page", explode)
    response = client.get("/api/trades")
    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error"}


def test_openapi_is_served_under_api(client: TestClient) -> None:
    schema = client.get("/api/openapi.json").json()
    assert "/api/trades/export.csv" in schema["paths"] and "/api/market" in schema["paths"]
    assert client.get("/api/docs").status_code == 200
