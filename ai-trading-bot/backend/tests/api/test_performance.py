"""Performance report math: periods, metrics, curves, breakdowns, and exact compression."""

from __future__ import annotations

import random
from datetime import UTC, datetime, timedelta

import pytest

from tradebot.analytics import metrics
from tradebot.analytics.performance import build_performance_report, compress_extremes
from tradebot.db import Database

from . import factories as f

NOW = datetime(2026, 3, 15, 12, 0, tzinfo=UTC)


def utc(day: int, hour: int) -> datetime:
    return datetime(2026, 3, day, hour, tzinfo=UTC)


@pytest.fixture
def history(db: Database) -> Database:
    f.insert_equity(
        db,
        [
            (f.ts(utc(1, 0)), 10_000.0),
            (f.ts(utc(8, 6)), 10_100.0),  # the 7d period starts at 03-08 12:00 on this value
            (f.ts(utc(9, 12)), 10_300.0),
            (f.ts(utc(10, 12)), 10_094.0),  # -2.0 % from 10,300
            (f.ts(utc(14, 13)), 10_400.0),
        ],
    )
    trades = [
        f.trade(pnl=50.0, closed_at=utc(5, 12), symbol="SOL/USDT"),
        f.trade(pnl=200.0, closed_at=utc(9, 12), exit_reason="TAKE_PROFIT"),
        f.trade(pnl=-206.0, closed_at=utc(10, 12), symbol="ETH/USDT", side="SHORT", exit_reason="STOP_LOSS"),
        f.trade(pnl=306.0, closed_at=utc(14, 13), exit_reason="TIME_EXIT"),
    ]
    for t in trades:
        f.insert_trade(db, t)
    return db


def test_seven_day_report(history: Database) -> None:
    report = build_performance_report(history, "7d", starting_balance=10_000.0, live_equity=10_302.0, now=NOW)
    assert (report.range, report.starting_equity, report.ending_equity) == ("7d", 10_100.0, 10_302.0)
    m = report.metrics
    assert m.total_return_pct == pytest.approx(2.0)
    assert m.net_profit == pytest.approx(202.0)  # equity based: fees and open P&L included
    assert (m.gross_profit, m.gross_loss) == (506.0, -206.0)
    assert m.profit_factor == pytest.approx(506 / 206)
    assert m.max_drawdown_pct == pytest.approx(-2.0)
    assert m.max_drawdown_usd == pytest.approx(-206.0)
    assert m.total_fees == pytest.approx(6.0)
    assert m.cagr_pct is not None  # 7 days is enough to annualise
    assert report.win_loss.win_rate == pytest.approx(200 / 3)
    assert report.win_loss.largest_loss == -206.0
    assert (report.stats.total_trades, report.stats.long_trades, report.stats.short_trades) == (3, 2, 1)

    curve = report.equity_curve
    assert [(p.time, p.equity) for p in curve] == [
        (f.ts(NOW - timedelta(days=7)), 10_100.0),
        (f.ts(utc(9, 12)), 10_300.0),
        (f.ts(utc(10, 12)), 10_094.0),
        (f.ts(utc(14, 13)), 10_400.0),
        (f.ts(NOW), 10_302.0),
    ]
    assert [p.drawdown_pct for p in curve] == [0.0, 0.0, -2.0, 0.0, pytest.approx(-0.9423, abs=1e-4)]

    assert [(b.symbol, b.trades, b.win_rate, b.pnl) for b in report.by_symbol] == [
        ("BTC/USDT", 2, 100.0, 506.0),
        ("ETH/USDT", 1, 0.0, -206.0),
    ]
    assert [(r.reason, r.count, r.pnl) for r in report.by_exit_reason] == [
        ("STOP_LOSS", 1, -206.0),
        ("TAKE_PROFIT", 1, 200.0),
        ("TIME_EXIT", 1, 306.0),
    ]
    assert sum(b.count for b in report.distribution) == 3
    assert {d.date.isoformat(): (d.pnl, d.trades) for d in report.daily_pnl if d.trades} == {
        "2026-03-09": (200.0, 1),
        "2026-03-10": (-206.0, 1),
        "2026-03-14": (306.0, 1),
    }
    assert [m.month for m in report.monthly] == ["2026-03"]


def test_all_starts_at_the_first_activity(history: Database) -> None:
    report = build_performance_report(history, "all", starting_balance=10_000.0, live_equity=10_302.0, now=NOW)
    assert report.starting_equity == 10_000.0
    assert report.equity_curve[0].time == f.ts(utc(1, 0))
    assert report.stats.total_trades == 4
    assert report.metrics.total_return_pct == pytest.approx(3.02)


def test_short_period_and_no_live_equity(history: Database) -> None:
    report = build_performance_report(history, "24h", starting_balance=10_000.0, live_equity=None, now=NOW)
    # the period opens on the last snapshot before it (03-10) and ends on the last one inside it
    assert (report.starting_equity, report.ending_equity) == (10_094.0, 10_400.0)
    assert report.stats.total_trades == 1
    assert report.metrics.cagr_pct is None  # too short to annualise


def test_empty_history_reports_the_starting_balance(db: Database) -> None:
    report = build_performance_report(db, "all", starting_balance=5_000.0, live_equity=None, now=NOW)
    assert (report.starting_equity, report.ending_equity) == (5_000.0, 5_000.0)
    assert report.metrics.total_return_pct == 0.0 and report.stats.total_trades == 0
    assert len(report.equity_curve) == 1 and report.by_symbol == [] and report.by_exit_reason == []


def random_walk(start: int, count: int, step: int = 60, seed: int = 7) -> list[tuple[int, float]]:
    rng = random.Random(seed)
    equity = 10_000.0
    points = []
    for i in range(count):
        equity *= 1 + rng.gauss(0, 0.0008)
        points.append((start + i * step, round(equity, 4)))
    return points


def test_compression_keeps_drawdown_and_day_closes_exact() -> None:
    points = random_walk(f.ts(utc(1, 0)), 20_000)
    compressed = compress_extremes(points, 600)
    assert len(compressed) <= 3 * (20_000 * 60 // 600 + 1) < len(points)
    assert [t for t, _ in compressed] == sorted({t for t, _ in compressed})
    assert metrics.max_drawdown([e for _, e in compressed]) == metrics.max_drawdown([e for _, e in points])
    assert metrics.daily_closes(compressed) == metrics.daily_closes(points)
    assert compressed[0] == points[0] and compressed[-1] == points[-1]


def test_long_ranges_are_compressed_without_changing_the_numbers(db: Database) -> None:
    start = f.ts(NOW - timedelta(days=30))
    points = random_walk(start + 60, 30 * 1_440 - 2)
    f.insert_equity(db, [(start, 10_000.0), *points])
    report = build_performance_report(db, "30d", starting_balance=10_000.0, live_equity=None, now=NOW)

    full = [10_000.0, *[e for _, e in points]]
    assert report.metrics.max_drawdown_pct == pytest.approx(metrics.max_drawdown(full)[0])
    assert report.ending_equity == pytest.approx(points[-1][1], abs=0.01)
    assert len(report.equity_curve) == 1_000
    assert report.equity_curve[0].time == start and report.equity_curve[-1].time == points[-1][0]
    expected_closes = {d.isoformat(): e for d, e in metrics.daily_closes([(start, 10_000.0), *points])}
    returns = {d.date.isoformat(): d.return_pct for d in report.daily_pnl}
    previous = 10_000.0
    for day, close in expected_closes.items():
        assert returns[day] == pytest.approx((close / previous - 1) * 100, abs=1e-3)
        previous = close
