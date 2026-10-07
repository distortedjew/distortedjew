"""Engine persistence: batch round-trips, live flushes, retention and restart loaders."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from tradebot.ai.base import UsageRecord
from tradebot.core import Batch, EquityRecord, EventRecord, NotificationRecord
from tradebot.db import iso
from tradebot.risk import RiskState
from tradebot.schemas import (
    AIAnalysis,
    Candle,
    IndicatorSnapshot,
    Position,
    RegimeState,
    RiskDecision,
    SignalEvaluation,
    Trade,
)
from tradebot.store import Store, candle_row

NOW = datetime(2026, 3, 2, 12, 0, tzinfo=UTC)


def analysis(id_: str = "dec_000000000001", **kw) -> AIAnalysis:
    data = dict(
        id=id_, symbol="BTC/USDT", timeframe="5m", created_at=NOW, signal="LONG", confidence=72.0,
        regime="TRENDING_BULLISH", regime_confidence=70.0, price=100.0, entry=100.0, stop_loss=99.0,
        take_profit=102.0, risk_reward=2.0, summary="s", reasons=["r"], detailed_reasoning="d",
        indicators=IndicatorSnapshot(price=100.0), strategy="ai", provider="heuristic", model="heuristic-v1",
        latency_ms=1, risk=RiskDecision(status="APPROVED"), evaluation=SignalEvaluation(status="PENDING"),
    )  # fmt: skip
    data.update(kw)
    return AIAnalysis(**data)


def position(id_: str = "pos_000000000001") -> Position:
    return Position(
        id=id_, symbol="BTC/USDT", side="LONG", size=1.0, notional=100.0, entry_price=100.0, current_price=101.0,
        stop_loss=99.0, take_profit=102.0, unrealized_pnl=0.95, unrealized_pnl_pct=0.95, r_multiple=0.9,
        fees_paid=0.05, risk_amount=1.06, risk_pct=0.01, opened_at=NOW, duration_sec=60, strategy="ai",
        regime="RANGING", order_type="market",
    )  # fmt: skip


def trade(id_: str = "pos_000000000001", pnl: float = 1.9, closed_at: datetime = NOW) -> Trade:
    return Trade(
        id=id_, symbol="BTC/USDT", side="LONG", size=1.0, notional=100.0, entry_price=100.0, exit_price=102.0,
        stop_loss=99.0, take_profit=102.0, opened_at=NOW - timedelta(hours=1), closed_at=closed_at,
        duration_sec=3600, pnl=pnl, pnl_pct=pnl, gross_pnl=2.0, fees=0.1, result="WIN" if pnl > 0 else "LOSS",
        exit_reason="TAKE_PROFIT", r_multiple=1.8, strategy="ai", regime="RANGING", analysis_id="dec_000000000001",
    )  # fmt: skip


def test_batch_round_trip_and_atomic_close(db):
    store = Store(db)
    delivered = []
    store.on_notifications = delivered.extend
    state = RegimeState(symbol="BTC/USDT", regime="RANGING", confidence=60, since=NOW, updated_at=NOW)
    store.write(
        Batch(
            analyses=[analysis()],
            positions=[position()],
            equity=[EquityRecord(int(NOW.timestamp()), 10_000.95, 10_000, 0, 0.95, 101, 0)],
            usage=[UsageRecord(NOW, "openrouter", "m", False, 120.0, 10, 0, 0.0, "HTTP 429")],
            regimes=[(state, True)],
            events=[EventRecord("AI_ANALYSIS", "t", "m", NOW, data={"analysis_id": "dec_000000000001"})],
            notifications=[NotificationRecord("TRADE_OPENED", "t", "m", NOW)],
            risk_state=RiskState(consecutive_losses=2).to_dict(),
        )
    )
    row = db.read_one("SELECT * FROM ai_decisions")
    assert (row["signal"], row["risk_status"], row["eval_status"], row["trade_id"]) == (
        "LONG",
        "APPROVED",
        "PENDING",
        None,
    )
    assert db.read_one("SELECT COUNT(*) AS n FROM positions")["n"] == 1
    assert db.read_one("SELECT error FROM ai_usage")["error"] == "HTTP 429"
    assert db.get_live("regime:BTC/USDT")["regime"] == "RANGING"
    assert len(delivered) == 1 and delivered[0].type == "TRADE_OPENED"
    # the decision is rewritten, the position becomes a trade with the same id
    store.write(
        Batch(
            analyses=[analysis(trade_id="pos_000000000001", evaluation=SignalEvaluation(status="CORRECT"))],
            closed=[trade()],
            notifications=[NotificationRecord("TRADE_CLOSED", "t", "m", NOW, read=True)],
        )
    )
    row = db.read_one("SELECT * FROM ai_decisions")
    assert (row["eval_status"], row["trade_id"]) == ("CORRECT", "pos_000000000001")
    assert db.read_one("SELECT COUNT(*) AS n FROM positions")["n"] == 0
    assert db.read_one("SELECT id FROM trades")["id"] == "pos_000000000001"
    assert db.read_one("SELECT read FROM notifications WHERE type = 'TRADE_CLOSED'")["read"] == 1
    assert len(delivered) == 1  # read (bootstrap) notifications are not delivered


def test_regime_history_is_kept_as_segments(db):
    store = Store(db)
    for minutes, regime, switched in (
        (0, "RANGING", True),
        (5, "RANGING", False),
        (10, "TRENDING_BULLISH", True),
    ):
        ts = NOW + timedelta(minutes=minutes)
        state = RegimeState(symbol="BTC/USDT", regime=regime, confidence=60, since=ts, updated_at=ts)
        store.write(Batch(regimes=[(state, switched)]))
    rows = db.read("SELECT regime, start, end FROM regime_history ORDER BY id")
    assert [(r["regime"], r["end"]) for r in rows] == [
        ("RANGING", iso(NOW + timedelta(minutes=10))),
        ("TRENDING_BULLISH", None),
    ]


def test_live_flush_bumps_versions_and_upserts_forming_candles(db):
    store = Store(db)
    c = Candle(time=60, open=1, high=2, low=0.5, close=1.5, volume=3)
    store.flush_live([candle_row("BTC/USDT", "1m", c)], {"portfolio": {"equity": 1}})
    store.flush_live(
        [candle_row("BTC/USDT", "1m", c.model_copy(update={"close": 1.7}))], {"portfolio": {"equity": 2}}
    )
    assert db.live_versions()["portfolio"] == 2
    rows = db.read("SELECT close FROM candles")
    assert [r["close"] for r in rows] == [1.7]


def test_housekeeping_applies_retention(db):
    store = Store(db)
    old, recent = int((NOW - timedelta(days=20)).timestamp()), int((NOW - timedelta(days=2)).timestamp())
    rows = [
        candle_row("BTC/USDT", tf, Candle(time=t, open=1, high=1, low=1, close=1, volume=1))
        for tf in ("1m", "1h")
        for t in (old, recent)
    ]
    store.write_candles(rows)
    db.append_event("MARKET_UPDATE", "t", "m", ts=NOW - timedelta(days=8))
    db.append_event("MARKET_UPDATE", "t", "m", ts=NOW - timedelta(days=1))
    db.append_event("TRADE_EXECUTED", "t", "m", ts=NOW - timedelta(days=30))
    report = store.housekeeping(NOW)
    assert (report.market_updates, report.candles) == (1, 1)
    assert db.read_one("SELECT COUNT(*) AS n FROM candles WHERE timeframe = '1h'")["n"] == 2
    assert db.read_one("SELECT COUNT(*) AS n FROM events")["n"] == 2


def test_restored_state_rebuilds_the_day(db):
    store = Store(db)
    yesterday = NOW - timedelta(days=1)
    store.write(
        Batch(
            analyses=[analysis()],
            positions=[position("pos_000000000002")],
            closed=[
                trade("pos_000000000009", pnl=-5.0, closed_at=yesterday),
                trade("pos_000000000010", pnl=3.0),
            ],
            equity=[
                EquityRecord(int(yesterday.timestamp()), 10_050, 0, 0, 0, 0, 0),
                EquityRecord(int(NOW.timestamp()), 10_000, 0, 0, 0, 0, -0.5),
            ],
            risk_state=RiskState(consecutive_losses=1, cooldown_until=NOW + timedelta(minutes=30)).to_dict(),
        )
    )
    state = store.restored_state(NOW + timedelta(minutes=5))
    assert [p.id for p in state.positions] == ["pos_000000000002"]
    assert state.realized_total == -2.0 and state.realized_today == 3.0
    assert state.day_start_equity == 10_050 and state.peak_equity == 10_050 and state.max_drawdown_pct == -0.5
    assert state.risk_state.consecutive_losses == 1 and state.risk_state.cooldown_until == NOW + timedelta(
        minutes=30
    )
    assert [a.id for a in state.pending_evaluations] == ["dec_000000000001"]
    assert state.latest_analysis["BTC/USDT"].id == "dec_000000000001"
    assert [t.id for t in state.recent_trades] == ["pos_000000000009", "pos_000000000010"]


def test_stored_market_treats_the_newest_row_as_forming(db):
    store = Store(db)
    rows = [
        candle_row(
            "BTC/USDT", "1m", Candle(time=86_400 + i * 60, open=1, high=1, low=1, close=1 + i, volume=1)
        )
        for i in range(5)
    ]
    store.write_candles(rows)
    stored = store.stored_market(["BTC/USDT", "ETH/USDT"])
    assert stored.last_1m["BTC/USDT"].time == 86_400 + 3 * 60
    assert len(stored.recent_1m["BTC/USDT"]) == 4 and "ETH/USDT" not in stored.last_1m
    assert store.is_empty() is False
