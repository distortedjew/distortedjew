"""Multi-timeframe report: trend, signal and strength per timeframe, and their alignment.

Each timeframe gets a signed directional score in [-1, 1] from EMA alignment (9/21/50),
price vs EMA 21, the MACD histogram and its slope, RSI distance from 50 and the EMA 21
slope. ``trend`` is BULL above +0.25, BEAR below -0.25, NEUTRAL in between; ``strength`` is
``|score| · 100``. The report's dominant trend is the majority direction, and the label reads
like ``"3/4 TIMEFRAMES ALIGNED"``.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime

from .indicators import Features
from .schemas import EmaAlignment, MTFReport, Signal, TimeframeSignal, Trend

MTF_TIMEFRAMES: tuple[str, ...] = ("1h", "15m", "5m", "1m")
TREND_THRESHOLD = 0.25


def ema_alignment(f: Features) -> EmaAlignment:
    if f.ema9 is None or f.ema21 is None or f.ema50 is None:
        return "MIXED"
    if f.ema9 > f.ema21 > f.ema50:
        return "BULLISH"
    if f.ema9 < f.ema21 < f.ema50:
        return "BEARISH"
    return "MIXED"


def direction_score(f: Features) -> float:
    """Signed directional evidence in [-1, 1] for one timeframe."""
    score = 0.0
    align = ema_alignment(f)
    if align == "BULLISH":
        score += 0.35
    elif align == "BEARISH":
        score -= 0.35
    elif f.ema21 is not None and f.ema50 is not None:
        score += 0.15 if f.ema21 > f.ema50 else -0.15
    if f.ema21 is not None:
        score += 0.15 if f.price > f.ema21 else -0.15
    if f.macd_hist is not None:
        score += 0.2 if f.macd_hist > 0 else -0.2
        if f.macd_hist_prev is not None:
            rising = f.macd_hist > f.macd_hist_prev
            score += 0.05 if rising else -0.05
    if f.rsi is not None:
        score += max(-0.15, min(0.15, (f.rsi - 50.0) / 50.0 * 0.3))
    if f.ema21_slope_pct is not None and f.atr_pct:
        slope = f.ema21_slope_pct / f.atr_pct
        score += max(-0.1, min(0.1, slope * 0.2))
    return max(-1.0, min(1.0, score))


def timeframe_signal(timeframe: str, f: Features | None) -> TimeframeSignal | None:
    """None while the timeframe's EMA 50 / MACD are still warming up."""
    if f is None or f.ema50 is None or f.macd_hist is None:
        return None
    score = direction_score(f)
    trend: Trend = "BULL" if score >= TREND_THRESHOLD else "BEAR" if score <= -TREND_THRESHOLD else "NEUTRAL"
    rsi = f.rsi
    signal: Signal = "HOLD"
    if trend == "BULL" and f.macd_hist > 0 and (rsi is None or rsi < 72.0):
        signal = "LONG"
    elif trend == "BEAR" and f.macd_hist < 0 and (rsi is None or rsi > 28.0):
        signal = "SHORT"
    return TimeframeSignal(
        timeframe=timeframe,  # type: ignore[arg-type]
        trend=trend,
        signal=signal,
        rsi=round(rsi, 2) if rsi is not None else None,
        strength=round(abs(score) * 100.0, 1),
        ema_alignment=ema_alignment(f),
        macd_hist=f.macd_hist,
        price_vs_ema200_pct=round((f.price / f.ema200 - 1.0) * 100.0, 4) if f.ema200 else None,
    )


def summarize(signals: Sequence[TimeframeSignal]) -> tuple[Trend, int, str]:
    """(dominant trend, aligned count, label) for a set of timeframe signals."""
    total = len(signals)
    bull = sum(1 for s in signals if s.trend == "BULL")
    bear = sum(1 for s in signals if s.trend == "BEAR")
    neutral = total - bull - bear
    if bull > bear and bull >= neutral:
        return "BULL", bull, f"{bull}/{total} TIMEFRAMES ALIGNED"
    if bear > bull and bear >= neutral:
        return "BEAR", bear, f"{bear}/{total} TIMEFRAMES ALIGNED"
    if neutral == 0:
        return "NEUTRAL", 0, f"MIXED: {bull} BULL · {bear} BEAR"
    return "NEUTRAL", neutral, f"{neutral}/{total} TIMEFRAMES NEUTRAL"


def build_report(
    symbol: str,
    features: Mapping[str, Features | None],
    ts: datetime,
    timeframes: Sequence[str] = MTF_TIMEFRAMES,
    cache: dict[str, tuple[int, TimeframeSignal | None]] | None = None,
) -> MTFReport | None:
    """MTF report over ``timeframes`` (highest first); None until one timeframe is ready.

    ``cache`` maps timeframe → (bar time, signal) so unchanged timeframes are not recomputed.
    """
    signals: list[TimeframeSignal] = []
    for tf in timeframes:
        f = features.get(tf)
        if f is None:
            continue
        sig: TimeframeSignal | None
        if cache is not None and tf in cache and cache[tf][0] == f.time:
            sig = cache[tf][1]
        else:
            sig = timeframe_signal(tf, f)
            if cache is not None:
                cache[tf] = (f.time, sig)
        if sig is not None:
            signals.append(sig)
    if not signals:
        return None
    dominant, aligned, label = summarize(signals)
    return MTFReport(
        symbol=symbol,
        timeframes=signals,
        aligned_count=aligned,
        total=len(signals),
        dominant=dominant,
        alignment_label=label,
        updated_at=ts,
    )
