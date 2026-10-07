"""Indicators against hand-computed references, and streaming == batch."""

from __future__ import annotations

import math

import numpy as np
import pytest

from tradebot import indicators as ind
from tradebot.schemas import Candle

from .conftest import T0, walk_candles


def _close(a: float | None, b: float | None, rel: float = 1e-9) -> bool:
    if a is None or b is None:
        return a is b
    return math.isclose(a, b, rel_tol=rel, abs_tol=1e-12)


def test_sma_and_ema_reference_values():
    np.testing.assert_allclose(ind.sma([1, 2, 3, 4, 5], 3)[2:], [2, 3, 4])
    assert np.isnan(ind.sma([1, 2, 3, 4, 5], 3)[:2]).all()
    # EMA(3): seeded with SMA(1, 2, 3) = 2, then alpha = 0.5 on a linear series -> x - 1
    ema = ind.ema(list(range(1, 11)), 3)
    assert np.isnan(ema[:2]).all()
    np.testing.assert_allclose(ema[2:], [2, 3, 4, 5, 6, 7, 8, 9])


def test_rsi_wilder_reference_values():
    # changes +1 +1 -1 +1 +1, period 2: seed gain 1 / loss 0 -> 100; then Wilder smoothing
    rsi = ind.rsi([1, 2, 3, 2, 3, 4], 2)
    assert np.isnan(rsi[:2]).all()
    np.testing.assert_allclose(rsi[2:], [100.0, 50.0, 75.0, 87.5])
    assert ind.rsi([5.0] * 20)[-1] == 50.0  # flat window reads 50


def test_bollinger_uses_population_std():
    upper, middle, lower = ind.bollinger([1, 2, 3, 4], 3, 2.0)
    std = math.sqrt(2 / 3)
    np.testing.assert_allclose(middle[2:], [2, 3])
    np.testing.assert_allclose(upper[2:], [2 + 2 * std, 3 + 2 * std])
    np.testing.assert_allclose(lower[2:], [2 - 2 * std, 3 - 2 * std])


def test_true_range_and_wilder_atr():
    high = [10, 11, 12, 14, 13, 20]
    low = [8, 9, 10, 11, 10, 19]
    close = [9, 10, 11, 13, 11, 19.5]
    tr = ind.true_range(high, low, close)
    np.testing.assert_allclose(tr, [2, 2, 2, 3, 3, 9])  # the last bar gaps up: |20 - 11| = 9
    atr = ind.atr(high, low, close, 3)
    assert np.isnan(atr[:3]).all()
    np.testing.assert_allclose(atr[3:], [7 / 3, 23 / 9, (23 / 9 * 2 + 9) / 3])


def test_macd_is_ema12_minus_ema26_with_ema9_signal():
    closes = [c.close for c in walk_candles(120, seed=3)]
    line, signal, hist = ind.macd(closes)
    expected_line = ind.ema(closes, 12) - ind.ema(closes, 26)
    np.testing.assert_allclose(line[25:], expected_line[25:])
    assert np.isnan(signal[:33]).all() and np.isfinite(signal[33:]).all()  # 26 + 9 - 2
    np.testing.assert_allclose(hist[33:], line[33:] - signal[33:])


def test_adx_reads_strong_trend_and_starts_at_2p_minus_1():
    n = 80
    high = [100 + i * 1.0 + 0.5 for i in range(n)]
    low = [100 + i * 1.0 - 0.5 for i in range(n)]
    close = [100 + i * 1.0 + 0.2 for i in range(n)]
    adx, pdi, mdi = ind.adx(high, low, close, 14)
    assert np.isnan(adx[:27]).all() and np.isfinite(adx[27])
    assert adx[-1] > 50 and pdi[-1] > mdi[-1]
    flat_h = [101 + (i % 2) for i in range(n)]
    flat_l = [99 - (i % 2) for i in range(n)]
    flat_c = [100.0] * n
    assert ind.adx(flat_h, flat_l, flat_c, 14)[0][-1] < 20


def test_session_vwap_resets_at_utc_midnight():
    day = 86_400
    candles = [
        Candle(time=T0 + day - 120, open=10, high=11, low=9, close=10, volume=1),
        Candle(time=T0 + day - 60, open=10, high=13, low=11, close=12, volume=3),
        Candle(time=T0 + day, open=20, high=21, low=19, close=20, volume=2),  # new UTC day
        Candle(time=T0 + day + 60, open=20, high=24, low=22, close=23, volume=2),
    ]
    t = [c.time for c in candles]
    h, lo, cl, v = ([getattr(c, k) for c in candles] for k in ("high", "low", "close", "volume"))
    vwap = ind.vwap(t, h, lo, cl, v, "1m")
    np.testing.assert_allclose(vwap, [10, (10 * 1 + 12 * 3) / 4, 20, (20 * 2 + 23 * 2) / 4])


def test_daily_vwap_is_a_rolling_20_bar_window():
    candles = walk_candles(25, step=86_400, seed=5)
    t = [c.time for c in candles]
    h, lo, cl, v = ([getattr(c, k) for c in candles] for k in ("high", "low", "close", "volume"))
    vwap = ind.vwap(t, h, lo, cl, v, "1d")
    assert np.isnan(vwap[:19]).all()
    tp = (np.array(h) + np.array(lo) + np.array(cl)) / 3
    vol = np.array(v)
    assert vwap[19] == pytest.approx((tp[:20] * vol[:20]).sum() / vol[:20].sum())
    assert vwap[24] == pytest.approx((tp[5:25] * vol[5:25]).sum() / vol[5:25].sum())


def test_volume_ratio_against_the_20_bar_average():
    avg, ratio = ind.volume_ratio([1.0] * 19 + [3.0])
    assert avg[-1] == pytest.approx(1.1)
    assert ratio[-1] == pytest.approx(3.0 / 1.1)
    assert np.isnan(ratio[:19]).all()


def test_streaming_state_matches_batch_functions():
    candles = walk_candles(400, seed=11)
    state = ind.IndicatorState("1m")
    for c in candles:
        state.update(c)
    f = state.features()
    closes = [c.close for c in candles]
    highs = [c.high for c in candles]
    lows = [c.low for c in candles]
    vols = [c.volume for c in candles]
    times = [c.time for c in candles]
    for period, value in ((9, f.ema9), (21, f.ema21), (50, f.ema50), (200, f.ema200)):
        assert _close(value, float(ind.ema(closes, period)[-1]))
    assert _close(f.rsi, float(ind.rsi(closes)[-1]))
    line, signal, hist = ind.macd(closes)
    assert _close(f.macd, float(line[-1])) and _close(f.macd_signal, float(signal[-1]))
    assert _close(f.macd_hist, float(hist[-1]))
    assert _close(f.macd_hist_prev, float(hist[-2]))
    upper, middle, lower = ind.bollinger(closes)
    assert _close(f.bb_upper, float(upper[-1])) and _close(f.bb_lower, float(lower[-1]))
    assert _close(f.atr, float(ind.atr(highs, lows, closes)[-1]))
    adx, pdi, mdi = ind.adx(highs, lows, closes)
    assert _close(f.adx, float(adx[-1]), 1e-7) and _close(f.plus_di, float(pdi[-1]), 1e-7)
    assert _close(f.vwap, float(ind.vwap(times, highs, lows, closes, vols, "1m")[-1]))
    avg, ratio = ind.volume_ratio(vols)
    assert _close(f.volume_avg20, float(avg[-1])) and _close(f.volume_ratio, float(ratio[-1]))


def test_overlay_series_omits_warm_up_points():
    candles = walk_candles(250, seed=2)
    series = ind.overlay_series(candles)
    assert [p.time for p in series.ema200] == [c.time for c in candles[199:]]
    assert len(series.ema9) == 242 and len(series.bb_upper) == 231
    assert len(series.vwap) == 250
    assert series.ema21[-1].value == pytest.approx(ind.ema([c.close for c in candles], 21)[-1], rel=1e-6)
    assert ind.overlay_series([]).ema9 == []


def test_overlay_values_has_all_keys_and_none_while_warming_up():
    candles = walk_candles(100, seed=4)
    values = ind.overlay_values(candles)
    assert set(values) == {"ema9", "ema21", "ema50", "ema200", "vwap", "bb_upper", "bb_middle", "bb_lower"}
    assert values["ema200"] is None and values["ema50"] is not None
    series = ind.overlay_series(candles)
    assert values["bb_middle"] == pytest.approx(series.bb_middle[-1].value)


def test_snapshot_reports_the_last_candle():
    candles = walk_candles(300, seed=6)
    snap = ind.snapshot(candles)
    last = candles[-1]
    assert snap.price == last.close
    assert snap.ema200 is not None and snap.adx is not None and snap.rsi is not None
    assert 0 <= snap.rsi <= 100
    assert snap.atr_pct == pytest.approx(snap.atr / last.close * 100, rel=1e-3)
    assert snap.bb_width_pct == pytest.approx((snap.bb_upper - snap.bb_lower) / snap.bb_middle * 100, rel=1e-4)
    with pytest.raises(ValueError):
        ind.snapshot([])


def test_infer_timeframe_from_spacing():
    assert ind.infer_timeframe([0, 300, 600]) == "5m"
    assert ind.infer_timeframe([0, 86_400]) == "1d"
    assert ind.infer_timeframe([0]) is None
