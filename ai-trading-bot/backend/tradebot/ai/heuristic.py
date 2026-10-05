"""``heuristic-v1``: the local, transparent analyst (no network, deterministic).

Nine factors on the decision timeframe each score the evidence in [-1, +1] (positive =
bullish) and carry a fixed weight:

=============  ======  ==========================================================
factor         weight  reads
=============  ======  ==========================================================
trend          0.20    EMA 9/21/50 stack and price vs EMA 21 / EMA 50
ema200         0.05    price above / below EMA 200
slope          0.10    EMA 21 slope over 5 bars, in ATR units
momentum       0.16    MACD histogram sign, size (vs ATR) and slope
rsi            0.10    RSI zone (momentum zones score, extremes fade)
volume         0.07    volume expansion on the bar's direction
bollinger      0.07    %B: band-riding in trends, band extremes fade in ranges
adx            0.09    ADX strength in the direction of the DIs
mtf            0.16    share of timeframes agreeing (1h/15m/5m/1m)
=============  ======  ==========================================================

The weighted mean ``S`` is adjusted for the regime (dampened in ranges and volatility
shocks, boosted with a confirming trend or breakout, cut when counter-trend) and for the 1h
trend. ``|S| ≥ 0.45`` gives LONG/SHORT, otherwise HOLD. Confidence maps ``|S|`` linearly
from 60 (at the threshold) to 90 (at 1.0), minus penalties for an RSI extreme against the
trade, a weak ADX and thin volume, clamped to 50–90: it is a monotone evidence score, never
certainty. The shadow evaluation of every signal measures how well it is calibrated.
Levels come from ``levels.plan`` (ATR / swing stop with the round-trip-cost floor,
regime-dependent R target).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from ..indicators import Features
from ..market.symbols import fmt_pct, fmt_price
from ..mtf import ema_alignment
from ..schemas import HEURISTIC_MODEL_ID, Regime, Side, Signal
from . import levels
from .base import AnalystResult, MarketContext

ENTRY_THRESHOLD = 0.45
WEIGHTS: dict[str, float] = {
    "trend": 0.20,
    "ema200": 0.05,
    "slope": 0.10,
    "momentum": 0.16,
    "rsi": 0.10,
    "volume": 0.07,
    "bollinger": 0.07,
    "adx": 0.09,
    "mtf": 0.16,
}
RANGE_REGIMES: tuple[Regime, ...] = ("RANGING", "LOW_VOLATILITY")


@dataclass(slots=True)
class Factor:
    key: str
    score: float  # [-1, 1], positive = bullish evidence
    text: str  # the observation, phrased neutrally ("EMA 21 above EMA 50")

    @property
    def weight(self) -> float:
        return WEIGHTS[self.key]


def _clamp(x: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return lo if x < lo else hi if x > hi else x


def lower_first(text: str) -> str:
    """Lower-case the first letter for mid-sentence use, leaving acronyms (EMA, MACD, RSI) intact."""
    if len(text) > 1 and text[0].isupper() and text[1].islower():
        return text[0].lower() + text[1:]
    return text


# --------------------------------------------------------------------------
# Factors
# --------------------------------------------------------------------------


def _trend(f: Features) -> Factor | None:
    e21, e50 = f.ema21, f.ema50
    if e21 is None or e50 is None:
        return None
    align = ema_alignment(f)
    if align == "BULLISH" and f.price > e21:
        return Factor("trend", 1.0, "EMA 9 > EMA 21 > EMA 50 with price above EMA 21 (bullish stack)")
    if align == "BEARISH" and f.price < e21:
        return Factor("trend", -1.0, "EMA 9 < EMA 21 < EMA 50 with price below EMA 21 (bearish stack)")
    if e21 > e50:
        if f.price > e50:
            return Factor("trend", 0.5, "EMA 21 above EMA 50, price holding above EMA 50")
        return Factor("trend", 0.1, "EMA 21 above EMA 50, but price slipped below EMA 50")
    if f.price < e50:
        return Factor("trend", -0.5, "EMA 21 below EMA 50, price capped below EMA 50")
    return Factor("trend", -0.1, "EMA 21 below EMA 50, but price reclaimed EMA 50")


def _ema200(f: Features) -> Factor | None:
    if f.ema200 is None:
        return None
    pct = (f.price / f.ema200 - 1.0) * 100.0
    side = "above" if pct >= 0 else "below"
    return Factor("ema200", 0.6 if pct >= 0 else -0.6, f"Price {side} EMA 200 ({fmt_pct(pct, signed=True)})")


def _slope(f: Features) -> Factor | None:
    if f.ema21_slope_pct is None or not f.atr_pct:
        return None
    slope = f.ema21_slope_pct
    n = slope / f.atr_pct
    if abs(n) < 0.05:
        return Factor("slope", 0.0, "EMA 21 flat over the last 5 bars")
    word = "rising" if slope > 0 else "falling"
    return Factor("slope", math.tanh(2.0 * n), f"EMA 21 {word} ({fmt_pct(slope, signed=True, decimals=3)} over 5 bars)")


def _momentum(f: Features) -> Factor | None:
    h = f.macd_hist
    if h is None or not f.atr:
        return None
    prev = f.macd_hist_prev
    mag = min(1.0, abs(h) / (0.1 * f.atr))
    if h > 0:
        rising = prev is None or h >= prev
        text = "MACD histogram positive and rising" if rising else "MACD histogram positive but fading"
        return Factor("momentum", (0.6 + 0.4 * rising) * max(mag, 0.25), text)
    if h < 0:
        falling = prev is None or h <= prev
        text = "MACD histogram negative and falling" if falling else "MACD histogram negative but recovering"
        return Factor("momentum", -(0.6 + 0.4 * falling) * max(mag, 0.25), text)
    return Factor("momentum", 0.0, "MACD histogram flat at zero")


def _rsi(f: Features) -> Factor | None:
    r = f.rsi
    if r is None:
        return None
    zones: tuple[tuple[float, float, str], ...] = (
        (78.0, -0.4, "overbought"),
        (70.0, 0.2, "strong but stretched"),
        (58.0, 0.8, "in the bullish momentum zone"),
        (52.0, 0.4, "leaning bullish"),
        (48.0, 0.0, "neutral"),
        (42.0, -0.4, "leaning bearish"),
        (30.0, -0.8, "in the bearish momentum zone"),
        (22.0, -0.2, "weak but stretched"),
        (-1.0, 0.4, "oversold"),
    )
    for floor, score, label in zones:
        if r >= floor:
            return Factor("rsi", score, f"RSI {r:.0f} {label}")
    return None


def _volume(f: Features) -> tuple[Factor | None, str | None]:
    ratio = f.volume_ratio
    if ratio is None:
        return None, None
    direction = (f.price > f.open) - (f.price < f.open)
    if ratio >= 1.3 and direction:
        kind = "bullish" if direction > 0 else "bearish"
        return Factor("volume", direction * min(1.0, (ratio - 1.0) / 1.2), f"Volume {ratio:.1f}× its 20-bar average on a {kind} candle"), None
    if ratio < 0.6:
        return Factor("volume", 0.0, f"Volume only {ratio:.1f}× its 20-bar average"), f"Thin volume ({ratio:.1f}× the 20-bar average)"
    return Factor("volume", 0.0, f"Volume {ratio:.1f}× its 20-bar average"), None


def _bollinger(f: Features, regime: Regime) -> Factor | None:
    b = f.bb_pct_b
    if b is None:
        return None
    if regime in RANGE_REGIMES:
        if b >= 1.0:
            return Factor("bollinger", -0.8, "Price above the upper Bollinger band inside a range (stretched)")
        if b >= 0.9:
            return Factor("bollinger", -0.4, "Price pressing the upper Bollinger band inside a range")
        if b <= 0.0:
            return Factor("bollinger", 0.8, "Price below the lower Bollinger band inside a range (stretched)")
        if b <= 0.1:
            return Factor("bollinger", 0.4, "Price pressing the lower Bollinger band inside a range")
        return Factor("bollinger", 0.0, "Price mid-band inside a range")
    if b >= 0.8:
        return Factor("bollinger", 0.5, "Price riding the upper Bollinger band")
    if b <= 0.2:
        return Factor("bollinger", -0.5, "Price riding the lower Bollinger band")
    return Factor("bollinger", 0.0, "Price inside the Bollinger bands")


def _adx(f: Features) -> Factor | None:
    if f.adx is None or f.plus_di is None or f.minus_di is None:
        return None
    direction = 1.0 if f.plus_di >= f.minus_di else -1.0
    strength = _clamp((f.adx - 15.0) / 15.0, 0.0, 1.0)
    if f.adx >= 25:
        label = "confirms a strong trend"
    elif f.adx >= 18:
        label = "shows a developing trend"
    else:
        label = "shows no real trend"
    cmp = ">" if direction > 0 else "<"
    return Factor("adx", direction * strength, f"ADX {f.adx:.0f} {label} (+DI {f.plus_di:.0f} {cmp} −DI {f.minus_di:.0f})")


def _mtf(ctx: MarketContext) -> Factor | None:
    report = ctx.mtf
    if report is None or report.total == 0:
        return None
    if report.dominant == "NEUTRAL":
        return Factor("mtf", 0.0, f"Timeframes mixed ({report.alignment_label.lower()})")
    agreeing = [t.timeframe for t in report.timeframes if t.trend == report.dominant]
    word = "bullish" if report.dominant == "BULL" else "bearish"
    sign = 1.0 if report.dominant == "BULL" else -1.0
    return Factor(
        "mtf",
        sign * report.aligned_count / report.total,
        f"{report.aligned_count}/{report.total} timeframes {word} ({', '.join(agreeing)})",
    )


# --------------------------------------------------------------------------
# The analyst
# --------------------------------------------------------------------------


class HeuristicAnalyst:
    """Deterministic multi-factor analyst; see the module docstring for the model."""

    provider = "heuristic"
    is_remote = False

    @property
    def model(self) -> str:
        return HEURISTIC_MODEL_ID

    async def aanalyze(self, ctx: MarketContext) -> AnalystResult:
        return self.analyze(ctx)

    def analyze(self, ctx: MarketContext) -> AnalystResult:
        f = ctx.decision
        if f.ema50 is None or f.macd_hist is None or f.rsi is None or f.atr is None:
            return self._warming_up(ctx)
        regime = ctx.regime.regime
        notes: list[str] = []
        vol_factor, vol_note = _volume(f)
        factors = [
            x
            for x in (
                _trend(f),
                _ema200(f),
                _slope(f),
                _momentum(f),
                _rsi(f),
                vol_factor,
                _bollinger(f, regime),
                _adx(f),
                _mtf(ctx),
            )
            if x is not None
        ]
        total_w = sum(x.weight for x in factors)
        raw = sum(x.weight * x.score for x in factors) / total_w if total_w else 0.0
        score, adjust_notes = self._adjust(ctx, raw)
        notes.extend(adjust_notes)
        if vol_note:
            notes.append(vol_note)

        signal: Signal = "HOLD"
        if score >= ENTRY_THRESHOLD:
            signal = "LONG"
        elif score <= -ENTRY_THRESHOLD:
            signal = "SHORT"

        if signal == "HOLD":
            return self._hold(ctx, factors, raw, score, notes)
        side: Side = signal  # type: ignore[assignment]
        confidence, penalty_notes = self._confidence(f, side, score)
        notes.extend(penalty_notes)
        trade = levels.plan(ctx, side)
        return self._trade(ctx, side, factors, raw, score, confidence, trade, notes)

    # -- scoring -------------------------------------------------------------

    def _adjust(self, ctx: MarketContext, raw: float) -> tuple[float, list[str]]:
        regime = ctx.regime.regime
        f = ctx.decision
        s = raw
        notes: list[str] = []
        if regime in RANGE_REGIMES:
            s *= 0.85
        elif regime == "HIGH_VOLATILITY":
            s *= 0.85
            notes.append("High-volatility regime: wider swings and gap risk")
        elif regime == "TRENDING_BULLISH":
            if s > 0:
                s *= 1.1
            else:
                s *= 0.75
                if s <= -0.2:
                    notes.append("Counter-trend: the regime is TRENDING_BULLISH")
        elif regime == "TRENDING_BEARISH":
            if s < 0:
                s *= 1.1
            else:
                s *= 0.75
                if s >= 0.2:
                    notes.append("Counter-trend: the regime is TRENDING_BEARISH")
        elif regime == "BREAKOUT":
            up = (f.bb_pct_b or 0.5) > 0.5
            s *= 1.1 if (s > 0) == up else 0.8
        if ctx.mtf is not None:
            tf_1h = next((t for t in ctx.mtf.timeframes if t.timeframe == "1h"), None)
            if tf_1h is not None and ((s > 0 and tf_1h.trend == "BEAR") or (s < 0 and tf_1h.trend == "BULL")):
                s *= 0.8
                if abs(s) >= 0.3:
                    notes.append(f"Against the 1h trend ({tf_1h.trend})")
        return _clamp(s), notes

    @staticmethod
    def _confidence(f: Features, side: Side, score: float) -> tuple[float, list[str]]:
        conf = 60.0 + (abs(score) - ENTRY_THRESHOLD) * 55.0
        notes: list[str] = []
        if f.rsi is not None and ((side == "LONG" and f.rsi >= 75) or (side == "SHORT" and f.rsi <= 25)):
            conf -= 6.0
            word = "overbought" if side == "LONG" else "oversold"
            notes.append(f"RSI {f.rsi:.0f} is {word}: pullback risk")
        if f.adx is not None and f.adx < 18:
            conf -= 5.0
            notes.append(f"Weak trend strength (ADX {f.adx:.0f})")
        if f.volume_ratio is not None and f.volume_ratio < 0.6:
            conf -= 3.0
        return round(_clamp(conf, 50.0, 90.0), 1), notes

    # -- results ---------------------------------------------------------------

    def _result(self, ctx: MarketContext, **kw) -> AnalystResult:
        return AnalystResult(provider="heuristic", model=HEURISTIC_MODEL_ID, **kw)

    def _warming_up(self, ctx: MarketContext) -> AnalystResult:
        f = ctx.decision
        return self._result(
            ctx,
            signal="HOLD",
            confidence=50.0,
            entry=None,
            stop_loss=None,
            take_profit=None,
            summary=f"{ctx.symbol} {ctx.timeframe}: indicators are still warming up ({f.bars} bars), so no call yet.",
            reasons=["Not enough candles for EMA 50, MACD, RSI and ATR yet"],
            risks=[],
            invalidation=None,
            detailed_reasoning="The heuristic needs at least ~60 closed candles on the decision timeframe "
            "before trend, momentum and volatility readings are meaningful.",
        )

    def _hold(
        self, ctx: MarketContext, factors: list[Factor], raw: float, score: float, notes: list[str]
    ) -> AnalystResult:
        confidence = round(_clamp(80.0 - abs(score) * 50.0, 50.0, 80.0), 1)
        lean = "bullish" if score > 0.1 else "bearish" if score < -0.1 else "neutral"
        ranked = sorted(factors, key=lambda x: -abs(x.weight * x.score))
        reasons = [x.text for x in ranked if abs(x.score) >= 0.1][:4] or ["No factor shows a clear edge"]
        reasons.insert(0, f"Composite score {score:+.2f} is inside the ±{ENTRY_THRESHOLD:.2f} no-trade band")
        risks = list(notes)
        regime = ctx.regime.regime
        summary = (
            f"No clear edge on {ctx.symbol} {ctx.timeframe}: evidence leans {lean} (score {score:+.2f}) "
            f"in a {regime.replace('_', ' ').lower()} market, so the bot stands aside."
        )
        detailed = self._narrative(ctx, factors, raw, score, None, None, notes) if ctx.narrate else summary
        return self._result(
            ctx,
            signal="HOLD",
            confidence=confidence,
            entry=None,
            stop_loss=None,
            take_profit=None,
            summary=summary,
            reasons=reasons[:5],
            risks=risks[:4],
            invalidation=None,
            detailed_reasoning=detailed,
        )

    def _trade(
        self,
        ctx: MarketContext,
        side: Side,
        factors: list[Factor],
        raw: float,
        score: float,
        confidence: float,
        trade: levels.TradePlan,
        notes: list[str],
    ) -> AnalystResult:
        sign = 1.0 if side == "LONG" else -1.0
        supporting = sorted(
            (x for x in factors if x.score * sign > 0.05), key=lambda x: -abs(x.weight * x.score)
        )
        opposing = sorted((x for x in factors if x.score * sign < -0.15), key=lambda x: -abs(x.weight * x.score))
        reasons = [x.text for x in supporting][:6]
        risks = [*notes, *(x.text for x in opposing)][:5]
        stop_basis = f"Stop {fmt_pct(trade.stop_pct)} away ({trade.basis})"
        reasons.append(stop_basis)
        inval = levels.invalidation(ctx, side, trade.stop_loss)
        drivers = ", ".join(lower_first(x.text) for x in supporting[:2]) or "aligned indicators"
        word = "Long" if side == "LONG" else "Short"
        summary = (
            f"{word} {ctx.symbol}: {drivers}. Entry {fmt_price(trade.entry)}, stop "
            f"{fmt_price(trade.stop_loss, compact=True)}, target {fmt_price(trade.take_profit, compact=True)} "
            f"({trade.risk_reward:.1f}R) at {confidence:.0f}% confidence."
        )
        detailed = self._narrative(ctx, factors, raw, score, side, trade, notes) if ctx.narrate else summary
        return self._result(
            ctx,
            signal=side,
            confidence=confidence,
            entry=trade.entry,
            stop_loss=trade.stop_loss,
            take_profit=trade.take_profit,
            summary=summary,
            reasons=reasons,
            risks=risks,
            invalidation=inval,
            detailed_reasoning=detailed,
        )

    def _narrative(
        self,
        ctx: MarketContext,
        factors: list[Factor],
        raw: float,
        score: float,
        side: Side | None,
        trade: levels.TradePlan | None,
        notes: list[str],
    ) -> str:
        f = ctx.decision
        by_key = {x.key: x for x in factors}

        def text(key: str) -> str | None:
            x = by_key.get(key)
            return x.text if x else None

        structure = [t for t in (text("trend"), text("ema200"), text("slope")) if t]
        momentum = [t for t in (text("momentum"), text("rsi"), text("volume")) if t]
        p1 = f"Structure ({ctx.timeframe}): " + "; ".join(structure) + "." if structure else ""
        p2 = "Momentum: " + "; ".join(momentum) + "." if momentum else ""
        reg = ctx.regime
        vol_bits = []
        if f.atr_pct is not None:
            vol_bits.append(f"ATR {fmt_pct(f.atr_pct, decimals=3)} of price")
        if f.bb_width_pct is not None:
            vol_bits.append(f"Bollinger width {fmt_pct(f.bb_width_pct)}")
        adx_text = text("adx")
        if adx_text:
            vol_bits.append(adx_text)
        p3 = (
            f"Regime: {reg.regime.replace('_', ' ').lower()} ({reg.confidence:.0f}% confidence); "
            + ", ".join(vol_bits)
            + "."
        )
        if ctx.mtf is not None:
            tfs = ", ".join(f"{t.timeframe} {t.trend.lower()}" for t in ctx.mtf.timeframes)
            p4 = f"Multi-timeframe: {ctx.mtf.alignment_label.lower()} ({tfs})."
        else:
            p4 = "Multi-timeframe: not enough data yet."
        if side is not None and trade is not None:
            cost = ctx.round_trip_cost_pct
            p5 = (
                f"Plan: {side.lower()} at {fmt_price(trade.entry)} with the stop at {fmt_price(trade.stop_loss)} "
                f"({fmt_pct(trade.stop_pct)} away, {trade.basis}) and the target at {fmt_price(trade.take_profit)} "
                f"({trade.r_multiple:.1f}R for a {reg.regime.replace('_', ' ').lower()} market). The stop is "
                f"{trade.stop_pct / cost:.1f}× the {fmt_pct(cost)} round-trip cost, so fees and slippage "
                f"do not dominate the outcome."
            )
            if notes:
                p5 += " Watch: " + "; ".join(lower_first(n) for n in notes) + "."
        else:
            p5 = (
                f"Decision: the composite score {score:+.2f} (before regime adjustment {raw:+.2f}) is inside the "
                f"±{ENTRY_THRESHOLD:.2f} band, so there is no trade. A close beyond EMA 21 with the MACD histogram "
                f"turning in the same direction would change the view."
            )
        p6 = f"Composite score {score:+.2f} from {len(factors)} weighted factors (threshold ±{ENTRY_THRESHOLD:.2f})."
        return "\n\n".join(p for p in (p1, p2, p3, p4, p5, p6) if p)
