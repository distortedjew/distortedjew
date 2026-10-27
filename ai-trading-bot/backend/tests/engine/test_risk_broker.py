"""Risk manager checks, sizing, halts and meters; paper broker fills, costs and exits."""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta

import pytest

from tradebot.broker import EntryMeta, PaperBroker
from tradebot.risk import PortfolioView, RiskManager, meter_status
from tradebot.schemas import Candle, ExecutionSettings, RiskSettings, TradingSettings

NOW = datetime(2026, 3, 2, 12, 0, tzinfo=UTC)


def manager(**risk) -> RiskManager:
    return RiskManager(RiskSettings(**risk), ExecutionSettings(), TradingSettings())


def view(**kw) -> PortfolioView:
    base = dict(
        equity=10_000.0, exposure=0.0, open_positions=0, open_risk=0.0, daily_pnl=0.0,
        drawdown_pct=0.0, max_drawdown_pct=0.0,
    )  # fmt: skip
    base.update(kw)
    return PortfolioView(**base)


def assess(rm: RiskManager, *, side="LONG", confidence=75.0, price=100.0, stop=98.0, target=104.0, v=None):
    return rm.assess(
        side=side, confidence=confidence, price=price, entry=price, stop=stop, target=target,
        view=v or view(), now=NOW,
    )  # fmt: skip


def test_approved_trade_lists_every_check_and_sizes_by_risk():
    out = assess(manager())
    d = out.decision
    assert d.status == "APPROVED" and d.reasons == []
    names = [c.name for c in d.checks]
    assert names == [
        "Direction allowed", "Trading not halted", "Confidence", "Valid levels", "Risk / reward",
        "Existing position", "Open positions", "Exposure after entry", "Daily loss budget", "Minimum notional",
    ]  # fmt: skip
    assert all(c.passed and c.value for c in d.checks)
    # 1 % of 10,000 at risk, stop 2 % away plus costs -> about 100 USDT
    assert d.risk_amount == pytest.approx(100, abs=1.5) and d.risk_pct == pytest.approx(1.0, abs=0.02)
    assert d.position_size == out.sizing.size and d.notional < 5_000.01  # 50 % max position cap


@pytest.mark.parametrize(
    "kwargs,reason",
    [
        ({"confidence": 50}, "Confidence below minimum"),
        ({"target": 101.0}, "Risk/reward below minimum"),
        ({"stop": 101.0}, "Invalid stop/target levels"),
        ({"v": view(open_positions=3)}, "Max open positions reached"),
        ({"v": view(daily_pnl=-120.0, open_risk=80.0)}, "Daily loss limit reached"),
        ({"v": view(exposure=15_000.0)}, "Exposure limit exceeded"),
    ],
)
def test_rejections_carry_stable_reasons_without_numbers(kwargs, reason):
    d = assess(manager(), **kwargs).decision
    assert d.status == "REJECTED" and reason in d.reasons
    assert all(not re.search(r"\d", r) for r in d.reasons)
    assert any(not c.passed for c in d.checks)


def test_shorts_toggle_and_existing_positions():
    rm = RiskManager(RiskSettings(), ExecutionSettings(), TradingSettings(allow_shorts=False))
    d = assess(rm, side="SHORT", stop=102.0, target=96.0).decision
    assert d.status == "REJECTED" and "Shorts disabled" in d.reasons
    same = assess(manager(), v=view(side_on_symbol="LONG", open_positions=1)).decision
    assert same.status == "NOT_APPLICABLE" and same.reasons == ["Position already open"]
    weak = assess(manager(), side="SHORT", stop=102, target=96, confidence=70, v=view(side_on_symbol="LONG"))
    assert weak.decision.status == "REJECTED" and "Opposite position open" in weak.decision.reasons
    strong = assess(
        manager(), side="SHORT", stop=102, target=96, confidence=80, v=view(side_on_symbol="LONG")
    )
    assert strong.reverse and strong.decision.status == "APPROVED"


def test_daily_budget_counts_open_risk_and_caps_size():
    out = assess(manager(), v=view(open_risk=150.0, open_positions=1))
    assert out.decision.status == "APPROVED"
    assert out.sizing.capped_by == "daily loss budget"
    assert out.decision.risk_amount <= 50.0 + 1e-6


def test_kill_switch_warning_drawdown_and_streak_halts():
    rm = manager()
    rm.roll_day(NOW)
    alerts = rm.check_limits(view(daily_pnl=-165.0), NOW)
    assert [a.notification for a in alerts] == ["DAILY_LOSS_WARNING"]
    assert rm.check_limits(view(daily_pnl=-170.0), NOW) == []  # once a day
    alerts = rm.check_limits(view(daily_pnl=-201.0), NOW)
    assert alerts[0].kill_switch and alerts[0].notification == "DAILY_LOSS_LIMIT"
    assert not rm.trading_allowed(NOW)
    assert rm.halt_status(NOW)[1] == datetime(2026, 3, 3, tzinfo=UTC)
    assert rm.roll_day(NOW + timedelta(days=1)) and rm.trading_allowed(NOW + timedelta(days=1))

    rm = manager(max_drawdown_pct=10.0)
    alerts = rm.check_limits(view(drawdown_pct=-10.5, equity=8_950.0), NOW)
    assert alerts[0].meter == "drawdown" and not rm.trading_allowed(NOW + timedelta(hours=23))
    assert rm.trading_allowed(NOW + timedelta(hours=25))

    rm = manager(max_consecutive_losses=2, loss_streak_cooldown_minutes=30)
    assert rm.on_trade_closed(-5.0, NOW) == []
    alerts = rm.on_trade_closed(-5.0, NOW)
    assert alerts and not rm.trading_allowed(NOW + timedelta(minutes=29))
    assert rm.trading_allowed(NOW + timedelta(minutes=31))
    assert assess(rm).decision.status == "REJECTED"
    rm.on_trade_closed(3.0, NOW)
    assert rm.state.consecutive_losses == 0


def test_risk_snapshot_meters():
    rm = manager()
    snap = rm.snapshot(view(daily_pnl=-150.0, open_risk=40.0, open_positions=2, exposure=9_000.0), NOW)
    meters = {m.key: m for m in snap.meters}
    assert set(meters) == {
        "daily_loss",
        "drawdown",
        "exposure",
        "positions",
        "consecutive_losses",
        "daily_risk",
    }
    assert (
        meters["daily_loss"].status == "warning" and meters["daily_loss"].message == "APPROACHING DAILY LIMIT"
    )
    assert meters["daily_risk"].status == "critical"
    assert snap.daily_loss == 150 and snap.trading_allowed and snap.warnings
    assert meter_status(69.9) == "ok" and meter_status(70) == "warning"
    assert meter_status(90) == "critical" and meter_status(100) == "breached"
    breached = rm.snapshot(view(daily_pnl=-200.0), NOW)
    assert {m.key: m for m in breached.meters}["daily_loss"].message == "DAILY LIMIT REACHED — TRADING HALTED"


# --------------------------------------------------------------------------
# broker
# --------------------------------------------------------------------------


def meta(**kw) -> EntryMeta:
    return EntryMeta(risk_amount=kw.get("risk", 20.0), risk_pct=0.2, strategy="ai", regime="RANGING")


def bar(t: datetime, o, h, lo, c) -> Candle:
    return Candle(time=int(t.timestamp()), open=o, high=h, low=lo, close=c, volume=1.0)


def test_market_fill_fees_slippage_and_pnl():
    b = PaperBroker(ExecutionSettings(fee_bps=5, slippage_bps=2))
    pos = b.open_market("BTC/USDT", "LONG", 1.0, 100.0, 98.0, 104.0, NOW, meta())
    assert pos.entry_price == pytest.approx(100.02) and pos.entry_fee == pytest.approx(100.02 * 0.0005)
    ex = b.close(pos.id, 102.0, NOW + timedelta(hours=1), "TIME_EXIT")
    exit_fill = 102.0 * (1 - 0.0002)
    assert ex.trade.exit_price == pytest.approx(exit_fill)
    expected = (exit_fill - 100.02) - 100.02 * 0.0005 - exit_fill * 0.0005
    assert ex.trade.pnl == pytest.approx(expected, abs=1e-4) and ex.trade.result == "WIN"
    assert ex.trade.id == pos.id and ex.trade.r_multiple == pytest.approx(expected / 20.0, abs=1e-3)


def test_stops_targets_gaps_and_time_exits_on_ticks():
    b = PaperBroker(ExecutionSettings(fee_bps=0, slippage_bps=0))
    p = b.open_market("BTC/USDT", "LONG", 1.0, 100.0, 98.0, 104.0, NOW, meta())
    assert b.on_price("BTC/USDT", 99.0, NOW, 720).exits == []
    ex = b.on_price("BTC/USDT", 97.0, NOW, 720).exits[0]  # gapped through the stop
    assert ex.reason == "STOP_LOSS" and ex.trade.exit_price == 97.0 and ex.trade.id == p.id
    assert ex.trade.mae_pct == pytest.approx(-3.0)
    s = b.open_market("BTC/USDT", "SHORT", 1.0, 100.0, 102.0, 95.0, NOW, meta())
    ex = b.on_price("BTC/USDT", 94.0, NOW, 720).exits[0]
    assert ex.reason == "TAKE_PROFIT" and ex.trade.exit_price == 95.0 and ex.trade.pnl == pytest.approx(5.0)
    assert ex.trade.id == s.id
    b.open_market("BTC/USDT", "LONG", 1.0, 100.0, 90.0, 110.0, NOW, meta())
    ex = b.on_price("BTC/USDT", 101.0, NOW + timedelta(minutes=720), 720).exits[0]
    assert ex.reason == "TIME_EXIT"


def test_bar_touching_stop_and_target_counts_as_the_stop():
    b = PaperBroker(ExecutionSettings(fee_bps=0, slippage_bps=0))
    b.open_market("BTC/USDT", "LONG", 1.0, 100.0, 98.0, 104.0, NOW, meta())
    out = b.on_bar("BTC/USDT", bar(NOW, 100, 105, 97, 103), NOW + timedelta(minutes=1), 720)
    assert out.exits[0].reason == "STOP_LOSS" and out.exits[0].trade.exit_price == 98.0
    b.open_market("BTC/USDT", "LONG", 1.0, 100.0, 98.0, 104.0, NOW, meta())
    out = b.on_bar("BTC/USDT", bar(NOW, 96, 97, 95, 96.5), NOW + timedelta(minutes=1), 720)
    assert out.exits[0].trade.exit_price == 96.0  # gap open below the stop fills at the open


def test_limit_orders_rest_fill_and_expire():
    b = PaperBroker(
        ExecutionSettings(order_type="limit", fee_bps=0, slippage_bps=0, limit_order_timeout_minutes=15)
    )
    order = b.place_limit("BTC/USDT", "LONG", 1.0, 99.0, 100.0, 97.0, 103.0, NOW, meta())
    assert order.id in b.orders
    out = b.on_price("BTC/USDT", 98.9, NOW + timedelta(minutes=5), 720)
    assert out.filled[0].entry_price == 99.0 and out.filled[0].id == order.id
    b.place_limit("BTC/USDT", "SHORT", 1.0, 105.0, 100.0, 107.0, 101.0, NOW, meta())
    out = b.on_price("BTC/USDT", 100.5, NOW + timedelta(minutes=16), 720)
    assert len(out.expired) == 1 and not b.orders
    filled = b.place_limit("BTC/USDT", "LONG", 1.0, 101.0, 100.0, 97.0, 105.0, NOW, meta())
    assert filled.entry_price == 100.0  # marketable: fills at the market, not worse than the limit
