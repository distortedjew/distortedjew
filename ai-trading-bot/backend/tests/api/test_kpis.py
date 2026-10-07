"""Portfolio KPI math on a hand-built history (every expectation worked out by hand)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from tradebot.analytics.performance import (
    DrawdownTracker,
    PortfolioKpiService,
    assemble_kpis,
    load_kpi_history,
    make_kpi,
)
from tradebot.db import Database

from . import factories as f

NOW = datetime(2026, 3, 15, 12, 0, tzinfo=UTC)


def utc(day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 3, day, hour, minute, tzinfo=UTC)


# Equity snapshots (starting balance 10,000; peaks 10,100 → 10,300 → 10,330):
EQUITY = [
    (utc(1, 0), 10_000.0),  # history starts
    (utc(10, 10), 10_100.0),  # peak
    (utc(10, 18), 9_898.0),  # -2.0 % from 10,100: the all-time worst
    (utc(12, 9), 10_300.0),  # new peak
    (utc(13, 15), 10_197.0),  # -1.0 %
    (utc(14, 11), 10_250.0),  # -0.485 %; also the equity "24 h ago" (14th 12:00)
    (utc(14, 20), 10_330.0),  # new peak
    (utc(15, 8), 10_226.7),  # -1.0 % from 10,330
]
# Closed trades (pnl, opened, closed): last 7 days = A..D, prior 7 days = E..G
TRADES = {
    "A": (50.0, utc(15, 9), utc(15, 10)),
    "B": (-20.0, utc(14, 10), utc(14, 16)),
    "C": (30.0, utc(13, 11), utc(13, 12)),
    "D": (-10.0, utc(10, 8), utc(10, 12)),
    "E": (40.0, utc(6, 10), utc(6, 12)),
    "F": (-40.0, utc(5, 11), utc(5, 12)),
    "G": (0.0, utc(2, 11), utc(2, 12)),
}
LIVE_EQUITY = 10_268.02  # -0.6 % from the 10,330 peak


@pytest.fixture
def history_db(db: Database) -> Database:
    f.insert_equity(db, [(f.ts(t), e) for t, e in EQUITY])
    for pnl, opened, closed in TRADES.values():
        f.insert_trade(db, f.trade(pnl=pnl, closed_at=closed, duration=closed - opened))
    f.insert_position(db, f.position(opened_at=utc(15, 11)))
    return db


def live_state(**overrides: object):
    values = {
        "equity": LIVE_EQUITY,
        "starting_balance": 10_000.0,
        "today_pnl": 20.0,
        "open_positions": 1,
        "trades_today": 2,
    }
    values.update(overrides)
    return f.portfolio_state(**values)


def test_kpis_on_a_known_history(history_db: Database) -> None:
    history = load_kpi_history(history_db, DrawdownTracker(10_000.0), 10_000.0, NOW)
    kpis = assemble_kpis(history, live_state())

    # equity: previous = equity at 14th 12:00; sparkline every 30 min from then, live value last
    assert (kpis.equity.value, kpis.equity.previous) == (10_268.02, 10_250.0)
    assert kpis.equity.change == pytest.approx(18.02)
    assert kpis.equity.change_pct == pytest.approx(0.18, abs=0.01)
    assert kpis.equity.sparkline == [10_250.0] * 16 + [10_330.0] * 24 + [10_226.7] * 8 + [10_268.02]

    # today's P&L vs yesterday's full day (day-end 10,330 − day-end 10,197)
    assert (kpis.today_pnl.value, kpis.today_pnl.previous) == (20.0, 133.0)
    assert kpis.today_pnl.change == pytest.approx(-113.0)
    assert kpis.today_pnl.change_pct == pytest.approx(-84.96, abs=0.01)
    # 2nd..14th: quiet days carry the 10,000 close (P&L 0), then -102, 0, +402, -103, +133
    assert kpis.today_pnl.sparkline == [0.0] * 8 + [-102.0, 0.0, 402.0, -103.0, 133.0, 20.0]

    # total P&L: equity − starting balance, now and 24 h ago; day-end values since the 1st
    assert (kpis.total_pnl.value, kpis.total_pnl.previous) == (268.02, 250.0)
    assert kpis.total_pnl.sparkline == [0.0] * 9 + [-102.0, -102.0, 300.0, 197.0, 330.0, 268.02]

    # win rate: A..D (2 of 4) vs E..G (1 of 3; the breakeven G is not a win)
    assert kpis.win_rate.value == 50.0
    assert kpis.win_rate.previous == pytest.approx(33.33, abs=0.01)
    assert kpis.win_rate.change_pct == pytest.approx(50.0, abs=0.05)
    assert kpis.win_rate.sparkline == [0.0, 0.0, 100.0, 0.0, 100.0, 0.0, 100.0]  # days with closes only

    # profit factor: (50 + 30) / (20 + 10) vs 40 / 40; rolling 7-day value per day from the 5th
    assert kpis.profit_factor.value == pytest.approx(2.667, abs=0.001)
    assert kpis.profit_factor.previous == 1.0
    assert kpis.profit_factor.sparkline == [0.0, 1.0, 1.0, 1.0, 1.0, 0.8, 0.8, 4.0, 3.0, 1.0, 2.667]

    # max drawdown: worst ever -2.0 %, none yet 7 days ago; each day's deepest point
    assert (kpis.max_drawdown.value, kpis.max_drawdown.previous) == (-2.0, 0.0)
    assert kpis.max_drawdown.change == -2.0 and kpis.max_drawdown.change_pct is None
    assert kpis.max_drawdown.sparkline == [0.0] * 9 + [-2.0, -2.0, 0.0, -1.0, -0.485, -1.0]

    # open positions: B was open 24 h ago; A briefly this morning; the live one since 11:00
    assert (kpis.open_positions.value, kpis.open_positions.previous) == (1.0, 1.0)
    assert kpis.open_positions.change_pct == 0.0
    assert kpis.open_positions.sparkline == [1.0] * 4 + [0.0] * 17 + [1.0, 0.0, 1.0, 1.0]

    # entries: A and the open position today, B yesterday
    assert (kpis.trades_today.value, kpis.trades_today.previous) == (2.0, 1.0)
    assert kpis.trades_today.sparkline == [
        1.0,
        0.0,
        0.0,
        1.0,
        1.0,
        0.0,
        0.0,
        0.0,
        1.0,
        0.0,
        0.0,
        1.0,
        1.0,
        2.0,
    ]

    labels = {name: kpi.comparison_label for name, kpi in kpis}
    assert labels == {
        "equity": "vs 24h ago",
        "today_pnl": "vs yesterday",
        "total_pnl": "vs 24h ago",
        "win_rate": "vs prior 7d",
        "profit_factor": "vs prior 7d",
        "max_drawdown": "vs 7d ago",
        "open_positions": "vs 24h ago",
        "trades_today": "vs yesterday",
    }


def test_live_equity_below_the_worst_snapshot_deepens_the_drawdown(history_db: Database) -> None:
    history = load_kpi_history(history_db, DrawdownTracker(10_000.0), 10_000.0, NOW)
    kpis = assemble_kpis(history, live_state(equity=10_020.1))  # -3.0 % from 10,330
    assert kpis.max_drawdown.value == -3.0
    assert kpis.max_drawdown.sparkline[-1] == -3.0


def test_a_new_account_compares_against_its_starting_state(db: Database) -> None:
    db_now = NOW
    f.insert_equity(
        db, [(f.ts(db_now - timedelta(hours=2)), 10_000.0), (f.ts(db_now - timedelta(hours=1)), 10_010.0)]
    )
    history = load_kpi_history(db, DrawdownTracker(10_000.0), 10_000.0, db_now)
    kpis = assemble_kpis(history, live_state(equity=10_015.0, today_pnl=15.0, open_positions=0))
    assert kpis.equity.previous == 10_000.0  # the starting balance, 24 h ago
    assert kpis.equity.sparkline == [
        10_000.0,
        10_000.0,
        10_010.0,
        10_010.0,
        10_015.0,
    ]  # from the first snapshot
    assert kpis.today_pnl.previous == 0.0 and kpis.today_pnl.change_pct is None
    assert kpis.today_pnl.sparkline == [15.0]
    assert kpis.win_rate.value is None and kpis.win_rate.sparkline == []
    assert kpis.profit_factor.value is None
    assert kpis.open_positions.previous == 0.0
    assert kpis.max_drawdown.value == 0.0


def test_make_kpi_change_semantics() -> None:
    assert make_kpi(110.0, 100.0, "x", []).change_pct == 10.0
    negative = make_kpi(-50.0, -100.0, "x", [])
    assert (negative.change, negative.change_pct) == (50.0, 50.0)  # relative to |previous|
    assert make_kpi(5.0, 0.0, "x", []).change_pct is None
    assert make_kpi(None, 3.0, "x", []).change is None
    assert make_kpi(2.0, None, "x", [1.234], digits=1).sparkline == [1.2]


def test_drawdown_tracker_is_incremental(history_db: Database) -> None:
    rows = [(f.ts(t), e) for t, e in EQUITY]
    whole = DrawdownTracker(10_000.0)
    whole.feed(rows)
    split = DrawdownTracker(10_000.0)
    split.feed(rows[:3])
    split.feed(rows[3:])
    assert (split.worst, split.peak, split.first_time) == (whole.worst, whole.peak, whole.first_time)
    assert whole.worst == pytest.approx(-2.0)
    assert whole.worst_as_of(f.ts(utc(10, 17))) == 0.0
    assert whole.worst_as_of(f.ts(utc(10, 18))) == pytest.approx(-2.0)

    synced = DrawdownTracker(10_000.0)
    synced.sync(history_db, 10_000.0)
    assert synced.last_time == rows[-1][0]
    f.insert_equity(history_db, [(f.ts(utc(15, 9)), 9_814.8)])  # -5 % from 10,330
    synced.sync(history_db, 10_000.0)
    assert synced.worst == pytest.approx(-4.99, abs=0.01)


def test_drawdown_tracker_rebuilds_when_history_changes_underneath(history_db: Database) -> None:
    tracker = DrawdownTracker(10_000.0)
    tracker.sync(history_db, 10_000.0)
    assert tracker.worst == pytest.approx(-2.0)
    # an older dip appears (history written behind us): the first time changes -> full rebuild
    f.insert_equity(history_db, [(f.ts(utc(1, 0) - timedelta(days=1)), 12_000.0)])
    tracker.sync(history_db, 10_000.0)
    assert tracker.peak == 12_000.0
    assert tracker.worst == pytest.approx((9_898 / 12_000 - 1) * 100)
    # a different starting balance re-seeds the peak
    tracker.sync(history_db, 20_000.0)
    assert tracker.starting_balance == 20_000.0
    assert tracker.worst == pytest.approx((9_898 / 20_000 - 1) * 100)


def test_kpi_service_caches_history_but_never_the_live_values(history_db: Database) -> None:
    service = PortfolioKpiService(history_db, ttl=3_600)
    first = service.kpis(live_state(), NOW)
    f.insert_trade(history_db, f.trade(pnl=-500.0, closed_at=utc(15, 11, 30)))
    cached = service.kpis(live_state(equity=10_500.0, today_pnl=40.0), NOW)
    assert cached.win_rate == first.win_rate  # history is cached ...
    assert (
        cached.equity.value == 10_500.0 and cached.equity.sparkline[-1] == 10_500.0
    )  # ... live values are not
    assert cached.today_pnl.value == 40.0

    fresh = PortfolioKpiService(history_db, ttl=0).kpis(live_state(), NOW)
    assert fresh.win_rate.value == 40.0  # 2 wins of 5 once the new loss is seen

    portfolio = service.portfolio(live_state(), NOW)
    assert portfolio.equity == LIVE_EQUITY and portfolio.kpis.equity.value == LIVE_EQUITY
