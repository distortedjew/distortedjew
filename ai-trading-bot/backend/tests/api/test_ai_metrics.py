"""AI analytics and LLM usage math on hand-built data with known answers."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest

from tradebot.analytics.ai_metrics import (
    AITradeRow,
    DecisionRow,
    build_ai_analytics,
    build_usage_stats,
    compute_ai_analytics,
    percentile,
)
from tradebot.db import Database
from tradebot.schemas import AIUsageStats

from . import factories as f

NOW = datetime(2026, 3, 15, 12, 30, tzinfo=UTC)
DAY1 = datetime(2026, 3, 14, 9, 0, tzinfo=UTC)
DAY2 = datetime(2026, 3, 15, 9, 0, tzinfo=UTC)
HEURISTIC = ("heuristic", "heuristic-v1")
LLM = ("openrouter", "model-a")


def decision(
    id_: str,
    when: datetime,
    signal: str,
    confidence: float,
    risk: str,
    evaluation: str,
    trade: str | None,
    who=HEURISTIC,
) -> DecisionRow:
    return DecisionRow(id_, when, signal, confidence, who[0], who[1], risk, evaluation, trade)


def trade(
    id_: str, side: str, confidence: float, pnl: float, pnl_pct: float, closed: datetime, who=HEURISTIC
) -> AITradeRow:
    result = "WIN" if pnl > 0 else "LOSS"
    return AITradeRow(id_, side, confidence, pnl, pnl_pct, result, closed, who[0], who[1])


DECISIONS = [
    decision("d1", DAY1, "LONG", 55, "APPROVED", "CORRECT", "t1"),
    decision("d2", DAY1, "LONG", 65, "REJECTED", "INCORRECT", None),
    decision("d3", DAY1, "SHORT", 72, "APPROVED", "CORRECT", "t3", LLM),
    decision("d4", DAY2, "SHORT", 78, "APPROVED", "INCORRECT", "t4", LLM),
    decision("d5", DAY2, "LONG", 85, "APPROVED", "EXPIRED", "t5", LLM),
    decision("d6", DAY2, "LONG", 95, "APPROVED", "PENDING", "t6"),
    decision("d7", DAY2, "LONG", 100, "REJECTED", "CORRECT", None),
    decision("d8", DAY2, "HOLD", 40, "NOT_APPLICABLE", "NOT_APPLICABLE", None),
    decision("d9", DAY2, "HOLD", 50, "NOT_APPLICABLE", "NOT_APPLICABLE", None),
    decision("d10", DAY2, "SHORT", 45, "REJECTED", "INCORRECT", None),
    decision("d11", DAY2, "LONG", 72, "APPROVED", "CORRECT", "t11", LLM),
]
TRADES = [
    trade("t1", "LONG", 55, 10.0, 1.0, DAY1 + timedelta(hours=1)),
    trade("t3", "SHORT", 72, 20.0, 2.0, DAY1 + timedelta(hours=2), LLM),
    trade("t4", "SHORT", 78, -10.0, -1.0, DAY2 + timedelta(hours=1), LLM),
    trade("t5", "LONG", 85, 5.0, 0.5, DAY2 + timedelta(hours=2), LLM),
    trade("t6", "LONG", 95, -8.0, -0.8, DAY2 + timedelta(hours=3)),
    trade("t11", "LONG", 72, 15.0, 1.5, DAY2 + timedelta(hours=1, minutes=30), LLM),
]
REASONS = ["Confidence below minimum", "Risk / reward below minimum", "Confidence below minimum"]


def usage() -> AIUsageStats:
    return AIUsageStats(
        provider="heuristic",
        model="heuristic-v1",
        configured=False,
        requests_today=0,
        requests_total=0,
        errors_today=0,
        error_rate_pct=0.0,
        prompt_tokens_today=0,
        completion_tokens_today=0,
        total_tokens_today=0,
        cost_today_usd=0.0,
        cost_total_usd=0.0,
        est_monthly_cost_usd=0.0,
    )


@pytest.fixture
def analytics():
    return compute_ai_analytics(DECISIONS, TRADES, REASONS, usage(), first_day=DAY1.date(), now=NOW)


def test_signal_counts_and_rates(analytics) -> None:
    a = analytics
    assert (a.total_signals, a.long_signals, a.short_signals, a.hold_signals) == (11, 6, 3, 2)
    assert a.hold_frequency_pct == pytest.approx(2 / 11 * 100, abs=0.01)
    assert a.executed_trades == 6
    assert a.ai_win_rate == pytest.approx(4 / 6 * 100, abs=0.01)
    assert a.ai_avg_return_pct == pytest.approx(3.2 / 6, abs=1e-4)
    assert a.avg_confidence == pytest.approx(667 / 9, abs=0.01)  # directional signals only
    assert a.high_confidence_threshold == 75.0
    assert a.high_confidence_win_rate == pytest.approx(100 / 3, abs=0.01)  # t4, t5, t6
    assert a.low_confidence_win_rate == 100.0  # t1, t3, t11
    assert a.long_accuracy == 75.0  # 3 correct, 1 incorrect; expired / pending left out
    assert a.short_accuracy == pytest.approx(100 / 3, abs=0.01)
    assert (a.signals_rejected, a.rejection_rate_pct) == (3, pytest.approx(100 / 3, abs=0.01))
    assert [(r.reason, r.count) for r in a.rejection_reasons] == [
        ("Confidence below minimum", 2),
        ("Risk / reward below minimum", 1),
    ]


def test_confidence_buckets(analytics) -> None:
    rows = [
        (b.label, b.min, b.max, b.signals, b.trades, b.wins, b.win_rate, b.avg_return_pct, b.shadow_accuracy)
        for b in analytics.buckets
    ]
    assert rows == [
        ("<50%", 0.0, 50.0, 1, 0, 0, None, None, 0.0),
        ("50–60%", 50.0, 60.0, 1, 1, 1, 100.0, 1.0, 100.0),
        ("60–70%", 60.0, 70.0, 1, 0, 0, None, None, 0.0),
        ("70–80%", 70.0, 80.0, 3, 3, 2, pytest.approx(66.67), pytest.approx(0.8333), pytest.approx(66.67)),
        ("80–90%", 80.0, 90.0, 1, 1, 1, 100.0, 0.5, None),
        ("90–100%", 90.0, 100.0, 2, 1, 0, 0.0, -0.8, 100.0),  # 100 % confidence lands in the top bucket
    ]


def test_the_low_bucket_only_appears_when_used() -> None:
    a = compute_ai_analytics(DECISIONS[:9], TRADES, [], usage(), first_day=DAY1.date(), now=NOW)
    assert [b.label for b in a.buckets] == ["50–60%", "60–70%", "70–80%", "80–90%", "90–100%"]


def test_calibration_needs_three_trades(analytics) -> None:
    points = [(c.predicted, c.actual, c.count) for c in analytics.calibration]
    assert points == [
        (45.0, None, 0),  # no trades: the signals' mean confidence
        (55.0, None, 1),
        (65.0, None, 0),
        (74.0, pytest.approx(66.67), 3),
        (85.0, None, 1),
        (95.0, None, 1),
    ]


def test_scatter_over_time_and_providers(analytics) -> None:
    assert [p.trade_id for p in analytics.scatter] == ["t1", "t3", "t4", "t11", "t5", "t6"]
    day1, day2 = analytics.over_time
    assert (day1.date, day1.signals, day1.trades, day1.win_rate, day1.cumulative_win_rate) == (
        date(2026, 3, 14),
        3,
        2,
        100.0,
        100.0,
    )
    assert (day1.accuracy, day1.avg_confidence, day1.pnl) == (pytest.approx(66.67), 64.0, 30.0)
    assert (day2.date, day2.signals, day2.trades, day2.win_rate) == (date(2026, 3, 15), 6, 4, 50.0)
    assert day2.cumulative_win_rate == pytest.approx(66.67) and day2.accuracy == 50.0
    assert day2.avg_confidence == pytest.approx(475 / 6, abs=0.01) and day2.pnl == 2.0
    assert [(p.provider, p.model, p.signals, p.trades, p.win_rate) for p in analytics.by_provider] == [
        ("heuristic", "heuristic-v1", 5, 2, 50.0),
        ("openrouter", "model-a", 4, 4, 75.0),
    ]


def test_quiet_days_still_get_a_point() -> None:
    a = compute_ai_analytics(DECISIONS, TRADES, [], usage(), first_day=date(2026, 3, 10), now=NOW)
    assert [p.date.day for p in a.over_time] == [10, 11, 12, 13, 14, 15]
    assert a.over_time[0].signals == 0 and a.over_time[0].cumulative_win_rate is None


def test_nothing_yet() -> None:
    a = compute_ai_analytics([], [], [], usage(), first_day=NOW.date(), now=NOW)
    assert (a.total_signals, a.hold_frequency_pct, a.rejection_rate_pct, a.ai_win_rate) == (0, 0.0, 0.0, None)
    assert a.calibration == [] and a.scatter == [] and len(a.over_time) == 1


def test_build_reads_the_range_from_the_database(db: Database) -> None:
    old = f.insert_analysis(
        db, f.analysis(signal="LONG", confidence=80.0, created_at=NOW - timedelta(days=9))
    )
    f.insert_trade(
        db, f.trade(pnl=12.0, closed_at=NOW - timedelta(days=8), analysis_id=old.id, ai_confidence=80.0)
    )
    f.insert_analysis(
        db,
        f.analysis(
            signal="SHORT",
            confidence=62.0,
            created_at=NOW - timedelta(days=1),
            risk_status="REJECTED",
            risk_reasons=["Daily loss limit reached"],
        ),
    )
    week = build_ai_analytics(db, "7d", usage(), now=NOW)
    assert (week.total_signals, week.executed_trades, week.ai_win_rate) == (1, 0, None)
    assert [(r.reason, r.count) for r in week.rejection_reasons] == [("Daily loss limit reached", 1)]
    assert week.over_time[0].date == date(2026, 3, 8) and week.over_time[-1].date == NOW.date()

    everything = build_ai_analytics(db, "all", usage(), now=NOW)
    assert (everything.total_signals, everything.ai_win_rate) == (2, 100.0)
    assert everything.scatter[0].confidence == 80.0 and everything.over_time[0].date == date(2026, 3, 6)


# --------------------------------------------------------------------------
# LLM usage
# --------------------------------------------------------------------------


def test_usage_statistics(db: Database) -> None:
    def at(day: int, hour: int, minute: int = 0) -> datetime:
        return datetime(2026, 3, day, hour, minute, tzinfo=UTC)

    f.insert_usage(
        db, at(15, 12, 10), latency_ms=800, prompt_tokens=1_000, completion_tokens=200, cost_usd=0.002
    )
    f.insert_usage(
        db, at(15, 11, 50), latency_ms=1_200, prompt_tokens=1_100, completion_tokens=300, cost_usd=0.003
    )
    f.insert_usage(
        db,
        at(15, 11, 20),
        success=False,
        latency_ms=30_000,
        prompt_tokens=0,
        completion_tokens=0,
        cost_usd=0.0,
        error="Request timed out after 30 s",
    )
    f.insert_usage(db, at(15, 1), latency_ms=1_000, prompt_tokens=900, completion_tokens=100, cost_usd=0.001)
    f.insert_usage(db, at(14, 13), latency_ms=600, cost_usd=0.004)  # 23.5 h ago
    f.insert_usage(db, at(14, 12), latency_ms=2_000, cost_usd=0.005)  # 24.5 h ago
    f.insert_usage(db, at(10, 12), cost_usd=0.010)
    f.insert_usage(db, at(1, 12), cost_usd=0.100)  # older than a week

    stats = build_usage_stats(db, provider="openrouter", model="model-a", configured=True, now=NOW)
    assert (stats.requests_today, stats.errors_today, stats.requests_total) == (4, 1, 8)
    assert stats.error_rate_pct == 20.0  # 1 of the 5 requests in the last 24 h
    assert (stats.avg_latency_ms, stats.p95_latency_ms) == (900.0, 1_200.0)  # successful ones only
    assert (stats.prompt_tokens_today, stats.completion_tokens_today, stats.total_tokens_today) == (
        3_000,
        600,
        3_600,
    )
    assert stats.cost_today_usd == pytest.approx(0.006) and stats.cost_total_usd == pytest.approx(0.125)
    assert stats.est_monthly_cost_usd == pytest.approx(0.025 / 7 * 30, abs=1e-4)
    assert (stats.last_error, stats.last_error_at) == ("Request timed out after 30 s", at(15, 11, 20))
    assert stats.last_request_at == at(15, 12, 10)

    assert len(stats.hourly) == 24
    assert stats.hourly[0].hour == at(14, 13) and stats.hourly[-1].hour == at(15, 12)
    by_hour = {h.hour: (h.requests, h.errors, h.tokens, h.avg_latency_ms) for h in stats.hourly if h.requests}
    assert by_hour == {
        at(14, 13): (1, 0, 1_500, 600.0),
        at(15, 1): (1, 0, 1_000, 1_000.0),
        at(15, 11): (2, 1, 1_400, 1_200.0),
        at(15, 12): (1, 0, 1_200, 800.0),
    }


def test_a_young_history_projects_from_the_days_observed(db: Database) -> None:
    f.insert_usage(db, NOW - timedelta(hours=2), cost_usd=0.01)
    f.insert_usage(db, NOW - timedelta(hours=1), cost_usd=0.02)
    stats = build_usage_stats(db, provider="openrouter", model="m", configured=True, now=NOW)
    assert stats.est_monthly_cost_usd == pytest.approx(0.03 * 30)  # one (partial) day observed
    empty = build_usage_stats(
        Database(":memory:").init(), provider="heuristic", model="h", configured=False, now=NOW
    )
    assert (empty.requests_total, empty.est_monthly_cost_usd, empty.avg_latency_ms, empty.last_error) == (
        0,
        0.0,
        None,
        None,
    )


def test_percentile_is_nearest_rank() -> None:
    assert percentile([], 95) is None
    assert percentile([5.0], 95) == 5.0
    values = [float(v) for v in range(1, 21)]
    assert (percentile(values, 95), percentile(values, 50), percentile(values, 100)) == (19.0, 10.0, 20.0)
