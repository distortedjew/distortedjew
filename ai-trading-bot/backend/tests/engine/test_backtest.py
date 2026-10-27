"""Backtester: determinism, comparison runs, limits, cancellation, speed and the LLM call cap."""

from __future__ import annotations

import pickle
import threading
import time
from datetime import UTC, date, datetime

import pytest

from tradebot.ai.base import AnalystResult
from tradebot.backtest import BacktestCancelled, BacktestOutcome, run_backtest
from tradebot.backtest.runner import MAX_LLM_CALLS, SharedAnalyst, holding_minutes
from tradebot.schemas import BacktestRequest

from .conftest import context_from, walk_candles


def request(**kw) -> BacktestRequest:
    base = dict(
        symbol="BTC/USDT", timeframe="1h", start=date(2025, 3, 1), end=date(2025, 4, 30), compare=True
    )
    base.update(kw)
    return BacktestRequest(**base)


def test_deterministic_comparison_with_requested_strategy_first():
    progress: list[float] = []
    a = run_backtest(request(strategy="baseline"), progress.append, seed=5, allow_network=False)
    b = run_backtest(request(strategy="baseline"), seed=5, allow_network=False)
    assert isinstance(a, BacktestOutcome) and a.data_source == "simulated"
    assert [r.strategy for r in a.runs] == ["baseline", "ai", "hybrid"]
    assert [r.model_dump() for r in a.runs] == [r.model_dump() for r in b.runs]
    assert progress[-1] == 1.0 and progress == sorted(progress)
    assert len(a.candles) == 61 * 24 and a.candles[0].time == int(
        datetime(2025, 3, 1, tzinfo=UTC).timestamp()
    )
    run = a.runs[0]
    m = run.metrics
    assert m.trades == len(run.trades) and m.buy_hold_return_pct is not None
    assert run.equity_curve and run.equity_curve[0].time >= a.candles[0].time and m.max_drawdown_pct <= 0
    assert sum(b.count for b in run.distribution) == m.trades
    assert all(t.exit_time >= t.entry_time for t in run.trades)
    assert pickle.loads(pickle.dumps(a)).runs[0].metrics == m
    other = run_backtest(request(strategy="baseline"), seed=6, allow_network=False)
    assert other.runs[0].metrics != m


def test_single_run_and_candle_cap():
    out = run_backtest(request(compare=False, timeframe="15m"), seed=5, allow_network=False)
    assert [r.strategy for r in out.runs] == ["hybrid"]
    assert len(out.candles) <= 2000


def test_cancel_stops_the_run():
    cancel = threading.Event()
    cancel.set()
    with pytest.raises(BacktestCancelled):
        run_backtest(request(), cancel=cancel, seed=5, allow_network=False)
    with pytest.raises(ValueError):
        run_backtest(request(start=date(2025, 5, 1), end=date(2025, 4, 1)), allow_network=False)


def test_one_year_hourly_comparison_takes_seconds():
    t0 = time.perf_counter()
    out = run_backtest(request(start=date(2025, 1, 1), end=date(2025, 12, 31)), seed=7, allow_network=False)
    assert time.perf_counter() - t0 < 20
    assert len(out.runs) == 3 and all(r.metrics.trades > 0 for r in out.runs if r.strategy != "hybrid")


def test_holding_horizon_scales_with_the_timeframe():
    assert holding_minutes("5m") == 720 and holding_minutes("1h") == 2880 and holding_minutes("1d") == 10_080


def test_llm_backtests_consult_the_model_every_nth_bar():
    class Counting:
        provider = "openrouter"
        is_remote = True
        model = "some/llm"
        calls = 0

        def analyze(self, ctx) -> AnalystResult:
            Counting.calls += 1
            return AnalystResult(
                "HOLD", 60, None, None, None, "s", ["r"], [], None, "d", "openrouter", "some/llm"
            )

    bars = 900
    ctx = context_from(walk_candles(2000, seed=2))
    start = int(ctx.ts.timestamp())
    shared = SharedAnalyst(Counting(), stride=-(-bars // MAX_LLM_CALLS), start=start, bar_seconds=300)
    for i in range(bars):
        ctx.ts = ctx.ts.fromtimestamp(start + i * 300, ctx.ts.tzinfo)
        shared.analyze(ctx)
        shared.analyze(ctx)  # a second strategy on the same bar reuses the answer
    assert Counting.calls == shared.calls == MAX_LLM_CALLS
