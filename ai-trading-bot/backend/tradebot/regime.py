"""Market-regime classifier on the decision timeframe, with hysteresis.

A transparent rule set over the streaming indicator features, checked in priority order:

1. ``BREAKOUT`` — a recent Bollinger squeeze (band width in the bottom 20 % of its last 120
   bars at some point in the last 20) and the close now outside the bands with expanding
   volume or a rising ADX.
2. ``HIGH_VOLATILITY`` — ATR % in the top decile of its recent history with wide bands.
3. ``TRENDING_BULLISH`` / ``TRENDING_BEARISH`` — ADX ≥ 23, the directional indicators,
   EMA 21 vs EMA 50 and the EMA 50 slope all pointing the same way.
4. ``LOW_VOLATILITY`` — narrow bands and low ATR % without a trend.
5. ``RANGING`` — everything else with enough data; ``UNKNOWN`` while indicators warm up.

Confidence (50–95) grows with how decisively the winning rule holds. ``RegimeTracker`` only
switches after a new regime is read on two consecutive bars, or once with confidence ≥ 75,
so one noisy bar does not flip the regime (and the regime history stays readable).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from .indicators import Features
from .schemas import Regime, RegimeState

TREND_ADX = 23.0
SWITCH_CONFIDENCE = 75.0
CONFIRM_BARS = 2


@dataclass(frozen=True, slots=True)
class RegimeReading:
    regime: Regime
    confidence: float
    metrics: dict[str, float]


def _clamp(x: float, lo: float, hi: float) -> float:
    return lo if x < lo else hi if x > hi else x


def regime_metrics(f: Features) -> dict[str, float]:
    """The numbers behind a classification (all floats, rounded for display)."""
    raw: dict[str, float | None] = {
        "adx": f.adx,
        "plus_di": f.plus_di,
        "minus_di": f.minus_di,
        "atr_pct": f.atr_pct,
        "atr_pct_rank": f.atr_pct_rank,
        "bb_width_pct": f.bb_width_pct,
        "bb_width_rank": f.bb_width_rank,
        "squeeze_rank": f.squeeze_rank,
        "ema_slope_pct": f.ema50_slope_pct,
        "ema21_vs_ema50_pct": (f.ema21 / f.ema50 - 1.0) * 100.0 if (f.ema21 and f.ema50) else None,
        "price_vs_ema50_pct": (f.price / f.ema50 - 1.0) * 100.0 if f.ema50 else None,
        "volume_ratio": f.volume_ratio,
        "rsi": f.rsi,
    }
    return {k: round(v, 4) for k, v in raw.items() if v is not None}


def classify(f: Features | None) -> RegimeReading:
    """Classify one bar (see the module docstring for the rules)."""
    if f is None:
        return RegimeReading("UNKNOWN", 0.0, {})
    metrics = regime_metrics(f)
    needed = (f.adx, f.plus_di, f.minus_di, f.atr_pct, f.bb_width_pct, f.ema21, f.ema50, f.ema50_slope_pct)
    if any(v is None for v in needed) or f.atr_pct_rank is None or f.bb_width_rank is None:
        return RegimeReading("UNKNOWN", 0.0, metrics)
    adx = f.adx or 0.0
    pdi, mdi = f.plus_di or 0.0, f.minus_di or 0.0
    atr_rank, bbw_rank = f.atr_pct_rank or 0.0, f.bb_width_rank or 0.0
    slope = f.ema50_slope_pct or 0.0
    atr_pct = f.atr_pct or 1e-9
    ema21, ema50 = f.ema21 or 0.0, f.ema50 or 0.0
    vol_ratio = f.volume_ratio or 1.0
    pct_b = f.bb_pct_b if f.bb_pct_b is not None else 0.5
    rising_adx = f.adx_prev is not None and adx > f.adx_prev

    # 1. breakout from a squeeze
    squeezed = f.squeeze_rank is not None and f.squeeze_rank <= 20.0
    outside = pct_b > 1.0 or pct_b < 0.0
    if squeezed and outside and (vol_ratio >= 1.5 or (rising_adx and adx >= 18.0)):
        excess = (pct_b - 1.0) if pct_b > 1.0 else -pct_b
        conf = 58.0 + _clamp((vol_ratio - 1.0) * 12.0, 0.0, 18.0) + _clamp(excess * 40.0, 0.0, 12.0)
        return RegimeReading("BREAKOUT", round(_clamp(conf, 50.0, 95.0), 1), metrics)

    # 2. volatility shock
    if atr_rank >= 90.0 and bbw_rank >= 75.0:
        conf = 55.0 + (atr_rank - 90.0) * 2.0 + (bbw_rank - 75.0) * 0.6
        return RegimeReading("HIGH_VOLATILITY", round(_clamp(conf, 50.0, 95.0), 1), metrics)

    # 3. trend
    slope_norm = slope / atr_pct  # EMA 50 drift over 10 bars in ATRs
    bull = pdi > mdi and ema21 > ema50 and slope > 0
    bear = mdi > pdi and ema21 < ema50 and slope < 0
    if adx >= TREND_ADX and (bull or bear):
        di_spread = abs(pdi - mdi) / max(pdi + mdi, 1e-9)
        price_ok = (f.price > ema50) if bull else (f.price < ema50)
        conf = (
            52.0
            + _clamp((adx - TREND_ADX) * 1.2, 0.0, 18.0)
            + _clamp(di_spread * 30.0, 0.0, 12.0)
            + _clamp(abs(slope_norm) * 6.0, 0.0, 8.0)
            + (5.0 if price_ok else -5.0)
        )
        regime: Regime = "TRENDING_BULLISH" if bull else "TRENDING_BEARISH"
        return RegimeReading(regime, round(_clamp(conf, 50.0, 95.0), 1), metrics)

    # 4. quiet market
    if bbw_rank <= 15.0 and atr_rank <= 30.0 and adx < 20.0:
        conf = 55.0 + (15.0 - bbw_rank) * 1.2 + (30.0 - atr_rank) * 0.4 + (20.0 - adx) * 0.5
        return RegimeReading("LOW_VOLATILITY", round(_clamp(conf, 50.0, 95.0), 1), metrics)

    # 5. range
    conf = 52.0 + _clamp((TREND_ADX - adx) * 1.5, 0.0, 22.0) + _clamp((1.0 - abs(slope_norm)) * 8.0, 0.0, 8.0)
    return RegimeReading("RANGING", round(_clamp(conf, 50.0, 90.0), 1), metrics)


class RegimeTracker:
    """Current regime of one symbol with switching hysteresis."""

    def __init__(self, symbol: str) -> None:
        self.symbol = symbol
        self.state: RegimeState | None = None
        self._candidate: Regime | None = None
        self._streak = 0

    def restore(self, state: RegimeState) -> None:
        self.state = state
        self._candidate = None
        self._streak = 0

    @property
    def regime(self) -> Regime:
        return self.state.regime if self.state is not None else "UNKNOWN"

    def update(self, reading: RegimeReading, ts: datetime) -> tuple[RegimeState, bool]:
        """Apply one bar's reading; returns the (possibly unchanged) state and whether it switched."""
        current = self.state
        if current is None or current.regime == "UNKNOWN" or reading.regime == current.regime:
            switched = current is None or current.regime != reading.regime
            self._candidate, self._streak = None, 0
            since = ts if switched or current is None else current.since
            self.state = RegimeState(
                symbol=self.symbol,
                regime=reading.regime,
                confidence=reading.confidence,
                since=since,
                metrics=reading.metrics,
                updated_at=ts,
            )
            return self.state, switched
        if reading.regime == self._candidate:
            self._streak += 1
        else:
            self._candidate, self._streak = reading.regime, 1
        if reading.regime != "UNKNOWN" and (
            self._streak >= CONFIRM_BARS or reading.confidence >= SWITCH_CONFIDENCE
        ):
            self._candidate, self._streak = None, 0
            self.state = RegimeState(
                symbol=self.symbol,
                regime=reading.regime,
                confidence=reading.confidence,
                since=ts,
                metrics=reading.metrics,
                updated_at=ts,
            )
            return self.state, True
        # keep the current regime, refresh its numbers
        self.state = current.model_copy(update={"metrics": reading.metrics, "updated_at": ts})
        return self.state, False
