"""Regime classifier, MTF report and the heuristic analyst on trending / ranging fixtures."""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta

import pytest

from tradebot.ai import levels
from tradebot.ai.heuristic import HeuristicAnalyst
from tradebot.indicators import IndicatorState
from tradebot.market.candles import CandleBook
from tradebot.mtf import build_report
from tradebot.regime import RegimeReading, RegimeTracker, classify
from tradebot.schemas import RegimeState

from .conftest import context_from, path_candles, walk_candles


def _features(candles, tf="5m"):
    state = IndicatorState(tf)
    for c in candles:
        state.update(c)
    return state.features()


def test_regime_reads_trends_and_quiet_markets():
    up = path_candles([100 * 1.004**i for i in range(300)], step=300)
    down = path_candles([100 * 0.996**i for i in range(300)], step=300)
    assert classify(_features(up)).regime == "TRENDING_BULLISH"
    assert classify(_features(down)).regime == "TRENDING_BEARISH"
    flat = path_candles([100 + 0.6 * math.sin(i / 1.5) for i in range(300)], step=300)
    assert classify(_features(flat)).regime in ("RANGING", "LOW_VOLATILITY")
    assert classify(_features(up[:20])).regime == "UNKNOWN"
    reading = classify(_features(up))
    assert 50 <= reading.confidence <= 95
    assert {"adx", "atr_pct", "bb_width_pct", "ema_slope_pct"} <= set(reading.metrics)


def test_regime_tracker_needs_confirmation_to_switch():
    t0 = datetime(2026, 1, 1, tzinfo=UTC)
    tracker = RegimeTracker("BTC/USDT")
    state, switched = tracker.update(RegimeReading("RANGING", 60, {}), t0)
    assert switched and state.regime == "RANGING"
    state, switched = tracker.update(RegimeReading("TRENDING_BULLISH", 60, {}), t0 + timedelta(minutes=5))
    assert not switched and state.regime == "RANGING"  # one bar is not enough
    state, switched = tracker.update(RegimeReading("TRENDING_BULLISH", 62, {}), t0 + timedelta(minutes=10))
    assert switched and state.regime == "TRENDING_BULLISH" and state.since == t0 + timedelta(minutes=10)
    state, switched = tracker.update(RegimeReading("RANGING", 80, {}), t0 + timedelta(minutes=15))
    assert switched  # a confident reading switches at once
    assert tracker.cached(t0 + timedelta(minutes=15)) == (state, True)


def test_mtf_report_aligned_uptrend():
    book = CandleBook("BTC/USDT", "1m")
    for c in path_candles([100 * 1.0004**i for i in range(4000)], step=60):
        book.add(c)
    feats = {tf: book.features(tf) for tf in ("1h", "15m", "5m", "1m")}
    report = build_report("BTC/USDT", feats, datetime(2026, 1, 1, tzinfo=UTC))
    assert report is not None
    assert report.dominant == "BULL" and report.alignment_label == "4/4 TIMEFRAMES ALIGNED"
    assert [t.timeframe for t in report.timeframes] == ["1h", "15m", "5m", "1m"]
    assert all(t.ema_alignment == "BULLISH" and 0 <= t.strength <= 100 for t in report.timeframes)


def _check_result_valid(ctx, result):
    assert result.signal in ("LONG", "SHORT", "HOLD")
    assert 0 <= result.confidence <= 100
    assert result.summary and result.reasons and result.detailed_reasoning
    if result.signal == "HOLD":
        assert result.entry is None and result.stop_loss is None and result.take_profit is None
        return
    assert levels.levels_valid(result.signal, result.entry, result.stop_loss, result.take_profit)
    stop_dist = abs(result.entry - result.stop_loss)
    assert stop_dist >= levels.min_stop_distance(ctx)[0] * 0.999
    assert result.risk_reward == pytest.approx(abs(result.take_profit - result.entry) / stop_dist, abs=0.01)
    assert result.invalidation and result.invalidation.startswith("Close ")
    assert "\n\n" in result.detailed_reasoning


@pytest.mark.parametrize("seed,drift", [(1, 0.0), (2, 0.0002), (3, -0.0002), (4, 0.0), (5, 0.0004)])
def test_heuristic_output_is_always_valid(seed, drift):
    candles = walk_candles(6000, drift=drift, vol=0.0012, seed=seed)
    analyst = HeuristicAnalyst()
    for cut in range(4000, 6000, 250):
        ctx = context_from(candles[:cut])
        _check_result_valid(ctx, analyst.analyze(ctx))


def test_heuristic_buys_a_pullback_in_an_uptrend():
    # a steady 4h uptrend, then a sharp intraday dip
    closes = [100 * 1.00012**i for i in range(15_000)]
    dip = [closes[-1] * (1 - 0.0009 * k) for k in range(1, 25)]
    candles = path_candles(closes + dip, step=60)
    ctx = context_from(candles)
    ctx.regime = RegimeState(
        symbol="BTC/USDT", regime="RANGING", confidence=60, metrics={}, updated_at=ctx.ts
    )
    result = HeuristicAnalyst().analyze(ctx)
    _check_result_valid(ctx, result)
    assert result.signal == "LONG"
    assert result.reasons[0].startswith("Trend pullback")
    assert any("4h EMA 21" in r for r in result.reasons)


def test_heuristic_stands_aside_in_high_volatility_and_while_warming_up():
    candles = walk_candles(3000, vol=0.002, seed=8)
    ctx = context_from(candles)
    ctx.regime = RegimeState(
        symbol="BTC/USDT", regime="HIGH_VOLATILITY", confidence=70, metrics={}, updated_at=ctx.ts
    )
    result = HeuristicAnalyst().analyze(ctx)
    assert result.signal == "HOLD" and "High-volatility" in result.reasons[0]
    warm = context_from(candles[:100])
    result = HeuristicAnalyst().analyze(warm)
    assert result.signal == "HOLD" and "warming up" in result.summary
