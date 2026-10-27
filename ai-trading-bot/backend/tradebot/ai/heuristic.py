"""``heuristic-v1``: the local, transparent analyst (no network, deterministic).

Two layers decide a call.

**Evidence.** Nine factors on the decision timeframe each score the evidence in [-1, +1]
(positive = bullish) and carry a fixed weight:

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

Their weighted mean ``S`` is adjusted for the regime (dampened in ranges and volatility
shocks, boosted with a confirming trend, cut when counter-trend) and for the 1h trend. It is
the evidence summary behind every call's reasons, risks and narrative.

**Setups.** The composite alone never trades. On intraday bars momentum by itself is mostly
noise after costs, and chasing a stretched move is the classic way to lose. A LONG/SHORT call
needs one of three textbook setups (the *trend timeframe* sits above the decision timeframe:
4h for 5m/15m decisions, 1d for 1h/4h):

- *Trend pullback* — the trend timeframe's EMA 21 is at least 0.5 of its ATR away from its
  EMA 50 and price is still on the trend's side of that EMA 50: buy a pullback (RSI ≤ 42 and
  price in the lower 30 % of the Bollinger band on the decision timeframe), or sell a rally in
  a downtrend (mirror image). Target 2R.
- *Squeeze breakout* — the regime classifier reads BREAKOUT (a Bollinger squeeze, then a close
  outside the band): follow it when the bar's volume is at least 1.5× its 20-bar average and
  the trend timeframe does not oppose it. Target 2.5R.
- *Range reversion* — no trend on the trend timeframe and a RANGING / LOW_VOLATILITY regime:
  fade a stretched move at a Bollinger band (LONG at %B ≤ 0.05 with RSI ≤ 35, SHORT at
  %B ≥ 0.95 with RSI ≥ 65) unless the 1h trend pushes the same way. Target 1.6R.

HIGH_VOLATILITY and UNKNOWN regimes stand aside.

**Confidence** is a monotone evidence score in 50–90, never a claim of certainty: pullbacks
start at 58 and gain up to 10 for the depth of the pullback, up to 10 for the strength of the
trend, 4 when the MACD histogram is already turning back with the trend and 2 when the 1h trend
agrees; breakouts start at 58 and gain for volume, for how far the close clears the band and
for a confirming trend; range fades start at 56 and gain up to 26 for how stretched the move
is. Penalties apply for strong short-term momentum against a pullback, a rising ADX inside a
range and thin volume. The shadow evaluation of every signal (TP before SL within the holding
horizon) measures how well it is calibrated.

Measured honestly (backtests over 5 seeds × several date ranges of the calibrated simulator),
these rules lose far less than momentum chasing but show no robust edge after costs — which
is what simple technical rules achieve on a nearly efficient market.

Levels come from ``levels.plan``: an ATR / swing stop with the round-trip-cost floor and the
setup's R target.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from ..indicators import Features
from ..market.symbols import fmt_pct, fmt_price
from ..mtf import ema_alignment
from ..schemas import HEURISTIC_MODEL_ID, Regime, Side
from . import levels
from .base import AnalystResult, MarketContext

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
    return Factor(
        "slope", math.tanh(2.0 * n), f"EMA 21 {word} ({fmt_pct(slope, signed=True, decimals=3)} over 5 bars)"
    )


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
        return Factor(
            "volume",
            direction * min(1.0, (ratio - 1.0) / 1.2),
            f"Volume {ratio:.1f}× its 20-bar average on a {kind} candle",
        ), None
    if ratio < 0.6:
        return Factor(
            "volume", 0.0, f"Volume only {ratio:.1f}× its 20-bar average"
        ), f"Thin volume ({ratio:.1f}× the 20-bar average)"
    return Factor("volume", 0.0, f"Volume {ratio:.1f}× its 20-bar average"), None


def _bollinger(f: Features, regime: Regime) -> Factor | None:
    b = f.bb_pct_b
    if b is None:
        return None
    if regime in RANGE_REGIMES:
        if b >= 1.0:
            return Factor(
                "bollinger", -0.8, "Price above the upper Bollinger band inside a range (stretched)"
            )
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
    return Factor(
        "adx",
        direction * strength,
        f"ADX {f.adx:.0f} {label} (+DI {f.plus_di:.0f} {cmp} −DI {f.minus_di:.0f})",
    )


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


# The trend the bot trades with lives a few timeframes above the decision timeframe.
TREND_TIMEFRAME: dict[str, str] = {"1m": "1h", "5m": "4h", "15m": "4h", "1h": "1d", "4h": "1d", "1d": "1d"}
HTF_FLAT_ATR = 0.5  # trend EMA 21/50 closer than this many trend-timeframe ATRs: no trend
PULLBACK_RSI = 42.0  # longs need RSI at or below this on the decision timeframe (shorts: 100 - it)
PULLBACK_PCT_B = 0.3  # longs need price in the lower 30 % of the Bollinger band (shorts: upper 30 %)
RANGE_PCT_B = 0.05
BREAKOUT_VOLUME = 1.5  # a breakout bar needs at least this multiple of the 20-bar average volume
BREAKOUT_R = 2.5
RANGE_RSI = 35.0
PULLBACK_R = 2.0
RANGE_R = 1.6


@dataclass(slots=True)
class Setup:
    """A tradable pattern for the current market (or why there is none)."""

    side: Side | None
    kind: str  # "trend pullback", "range reversion" or "" when standing aside
    text: str  # the setup (or the reason for standing aside), as a reason bullet
    confidence: float = 0.0
    notes: list[str] | None = None
    r_multiple: float | None = None
    context: str | None = None  # higher-timeframe reading, as an extra reason bullet


def _mtf_trend(ctx: MarketContext, timeframe: str) -> int:
    if ctx.mtf is None:
        return 0
    tf = next((t for t in ctx.mtf.timeframes if t.timeframe == timeframe), None)
    if tf is None:
        return 0
    return 1 if tf.trend == "BULL" else -1 if tf.trend == "BEAR" else 0


def trend_timeframe(ctx: MarketContext) -> str:
    return TREND_TIMEFRAME.get(ctx.timeframe, "4h")


def higher_trend(ctx: MarketContext) -> tuple[int, float]:
    """(direction, separation) of the higher-timeframe trend: EMA 21 vs EMA 50 in that timeframe's
    ATRs; 0 when flat, warming up or unavailable."""
    h = ctx.features.get(trend_timeframe(ctx))
    if h is None or h.ema21 is None or h.ema50 is None or not h.atr:
        return 0, 0.0
    sep = (h.ema21 - h.ema50) / h.atr
    if sep >= HTF_FLAT_ATR:
        return 1, sep
    if sep <= -HTF_FLAT_ATR:
        return -1, sep
    return 0, sep


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
        score, notes = self._adjust(ctx, raw)
        if vol_note:
            notes.append(vol_note)
        setup = self._setup(ctx, f)
        if setup.side is None:
            return self._hold(ctx, factors, raw, score, setup, notes)
        side = setup.side
        confidence, penalty_notes = self._penalties(f, side, setup)
        notes.extend(setup.notes or [])
        notes.extend(penalty_notes)
        trade = levels.plan(ctx, side, r_multiple=setup.r_multiple)
        return self._trade(ctx, side, factors, raw, score, setup, confidence, trade, notes)

    # -- scoring -------------------------------------------------------------

    def _adjust(self, ctx: MarketContext, raw: float) -> tuple[float, list[str]]:
        regime = ctx.regime.regime
        s = raw
        notes: list[str] = []
        if regime in RANGE_REGIMES or regime == "HIGH_VOLATILITY":
            s *= 0.85
        elif regime == "TRENDING_BULLISH":
            s = s * 1.1 if s > 0 else s * 0.75
        elif regime == "TRENDING_BEARISH":
            s = s * 1.1 if s < 0 else s * 0.75
        tf_1h = _mtf_trend(ctx, "1h")
        if tf_1h and (s > 0) != (tf_1h > 0) and abs(s) > 1e-9:
            s *= 0.8
            if abs(s) >= 0.3:
                notes.append(f"Against the 1h trend ({'BULL' if tf_1h > 0 else 'BEAR'})")
        return _clamp(s), notes

    def _setup(self, ctx: MarketContext, f: Features) -> Setup:
        regime = ctx.regime.regime
        if regime == "HIGH_VOLATILITY":
            return Setup(None, "", "High-volatility regime: standing aside until the swings calm down")
        if regime == "UNKNOWN":
            return Setup(None, "", "Regime not established yet: standing aside")
        if regime == "BREAKOUT":
            return self._breakout_setup(ctx, f)
        direction, sep = higher_trend(ctx)
        if direction:
            return self._pullback_setup(ctx, f, direction, sep)
        if regime in RANGE_REGIMES:
            return self._range_setup(ctx, f, sep)
        return Setup(
            None, "", f"No {trend_timeframe(ctx)} trend to join and no range to fade: standing aside"
        )

    def _pullback_setup(self, ctx: MarketContext, f: Features, direction: int, sep: float) -> Setup:
        side: Side = "LONG" if direction > 0 else "SHORT"
        htf = trend_timeframe(ctx)
        label = f"{htf} uptrend" if direction > 0 else f"{htf} downtrend"
        context = f"{htf} EMA 21 {abs(sep):.1f} ATR {'above' if direction > 0 else 'below'} EMA 50 ({label})"
        h = ctx.features[htf]
        if h.ema50 is not None and (ctx.price - h.ema50) * direction < 0:
            word = "below" if direction > 0 else "above"
            return Setup(None, "", f"Price is back {word} the {htf} EMA 50: the {label} is in question")
        rsi = f.rsi if f.rsi is not None else 50.0
        pct_b = f.bb_pct_b if f.bb_pct_b is not None else 0.5
        # mirror shorts onto the long side so one set of thresholds serves both
        rsi_l = rsi if direction > 0 else 100.0 - rsi
        pct_b_l = pct_b if direction > 0 else 1.0 - pct_b
        if rsi_l > PULLBACK_RSI or pct_b_l > PULLBACK_PCT_B:
            if rsi_l >= 60.0:
                text = f"Price extended with the {label} (RSI {rsi:.0f}): waiting for a pullback"
            else:
                text = f"{label.capitalize()} without a pullback to buy yet (RSI {rsi:.0f}, %B {pct_b:.2f})"
            if direction < 0 and rsi_l < 60.0:
                text = f"{label.capitalize()} without a rally to sell yet (RSI {rsi:.0f}, %B {pct_b:.2f})"
            return Setup(None, "", text, context=context)
        depth = 0.5 * _clamp((PULLBACK_RSI - rsi_l) / 12.0, 0.0, 1.0) + 0.5 * _clamp(
            (PULLBACK_PCT_B - pct_b_l) / 0.4, 0.0, 1.0
        )
        strength = _clamp((abs(sep) - HTF_FLAT_ATR) / 1.5, 0.0, 1.0)
        conf = 58.0 + 10.0 * depth + 10.0 * strength
        notes: list[str] = []
        turning = (
            f.macd_hist is not None
            and f.macd_hist_prev is not None
            and (f.macd_hist - f.macd_hist_prev) * direction > 0
        )
        if turning:
            conf += 4.0
        else:
            notes.append("Short-term momentum still points against the trade")
        if _mtf_trend(ctx, "1h") == direction:
            conf += 2.0
        move = "pullback" if direction > 0 else "rally"
        text = f"Trend pullback: {move} in a {label} (RSI {rsi:.0f}, %B {pct_b:.2f} on {ctx.timeframe})" + (
            ", momentum turning" if turning else ""
        )
        return Setup(side, "trend pullback", text, conf, notes, PULLBACK_R, context)

    def _breakout_setup(self, ctx: MarketContext, f: Features) -> Setup:
        """Bollinger squeeze breakout: a close outside the band on expanding volume, not against the trend."""
        pct_b = f.bb_pct_b
        if pct_b is None:
            return Setup(None, "", "Breakout regime without Bollinger readings yet")
        direction = 1 if pct_b > 1.0 else -1 if pct_b < 0.0 else 0
        if direction == 0:
            return Setup(
                None, "", f"Breakout regime, but the close is back inside the bands (%B {pct_b:.2f})"
            )
        side: Side = "LONG" if direction > 0 else "SHORT"
        word = "up" if direction > 0 else "down"
        trend_dir, sep = higher_trend(ctx)
        htf = trend_timeframe(ctx)
        if trend_dir == -direction:
            return Setup(None, "", f"Breakout {word} against the {htf} trend: not chasing it")
        volume = f.volume_ratio or 0.0
        if volume < BREAKOUT_VOLUME:
            return Setup(
                None, "", f"Breakout {word} without volume confirmation ({volume:.1f}× the 20-bar average)"
            )
        excess = (pct_b - 1.0) if direction > 0 else -pct_b
        conf = (
            58.0
            + 10.0 * _clamp((volume - BREAKOUT_VOLUME) / 1.5, 0.0, 1.0)
            + 6.0 * _clamp(excess / 0.3, 0.0, 1.0)
            + (6.0 if trend_dir == direction else 0.0)
        )
        context = f"{htf} EMA 21 {abs(sep):.1f} ATR {'above' if sep >= 0 else 'below'} EMA 50" + (
            " (with the breakout)" if trend_dir == direction else " (no trend)"
        )
        text = (
            f"Squeeze breakout {word}: close outside the Bollinger band (%B {pct_b:.2f}) on {volume:.1f}× volume "
            f"after a volatility squeeze"
        )
        return Setup(side, "squeeze breakout", text, conf, [], BREAKOUT_R, context)

    def _range_setup(self, ctx: MarketContext, f: Features, sep: float) -> Setup:
        pct_b = f.bb_pct_b
        rsi = f.rsi
        if pct_b is None or rsi is None:
            return Setup(None, "", "Range regime without Bollinger readings yet")
        context = f"No {trend_timeframe(ctx)} trend (EMA 21 within {HTF_FLAT_ATR:g} ATR of EMA 50)"
        if pct_b <= RANGE_PCT_B and rsi <= RANGE_RSI:
            side: Side = "LONG"
            stretch = 0.5 * _clamp((RANGE_PCT_B - pct_b) / 0.25, 0.0, 1.0) + 0.5 * _clamp(
                (RANGE_RSI - rsi) / 15.0, 0.0, 1.0
            )
            where = "lower"
        elif pct_b >= 1.0 - RANGE_PCT_B and rsi >= 100.0 - RANGE_RSI:
            side = "SHORT"
            stretch = 0.5 * _clamp((pct_b - (1.0 - RANGE_PCT_B)) / 0.25, 0.0, 1.0) + 0.5 * _clamp(
                (rsi - (100.0 - RANGE_RSI)) / 15.0, 0.0, 1.0
            )
            where = "upper"
        else:
            return Setup(
                None,
                "",
                f"Range regime with price inside the bands (%B {pct_b:.2f}): nothing to fade",
                context=context,
            )
        sign = 1 if side == "LONG" else -1
        trend_1h = _mtf_trend(ctx, "1h")
        if trend_1h == -sign:
            return Setup(
                None,
                "",
                f"Price is stretched at the {where} band, but the 1h trend pushes the same way: no fade",
                context=context,
            )
        conf = 56.0 + 26.0 * stretch + (3.0 if trend_1h == sign else 0.0)
        text = (
            f"Range reversion: price stretched at the {where} Bollinger band (%B {pct_b:.2f}, RSI {rsi:.0f})"
        )
        return Setup(side, "range reversion", text, conf, [], RANGE_R, context)

    @staticmethod
    def _penalties(f: Features, side: Side, setup: Setup) -> tuple[float, list[str]]:
        conf = setup.confidence
        notes: list[str] = []
        against = (
            (f.minus_di or 0.0) > (f.plus_di or 0.0)
            if side == "LONG"
            else (f.plus_di or 0.0) > (f.minus_di or 0.0)
        )
        if setup.kind == "trend pullback" and f.adx is not None and f.adx >= 35 and against:
            conf -= 5.0
            notes.append(f"Strong short-term momentum against the trade (ADX {f.adx:.0f})")
        if setup.kind == "range reversion" and f.adx is not None and f.adx >= 25:
            conf -= 4.0
            notes.append(f"ADX {f.adx:.0f}: the range may be turning into a trend")
        if f.volume_ratio is not None and f.volume_ratio < 0.6:
            conf -= 3.0
        return round(_clamp(conf, 50.0, 90.0), 1), notes

    # -- results ---------------------------------------------------------------

    def _result(self, **kw) -> AnalystResult:
        return AnalystResult(provider="heuristic", model=HEURISTIC_MODEL_ID, **kw)

    def _warming_up(self, ctx: MarketContext) -> AnalystResult:
        f = ctx.decision
        return self._result(
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
        self,
        ctx: MarketContext,
        factors: list[Factor],
        raw: float,
        score: float,
        setup: Setup,
        notes: list[str],
    ) -> AnalystResult:
        confidence = round(_clamp(80.0 - abs(score) * 40.0, 50.0, 80.0), 1)
        lean = "bullish" if score > 0.1 else "bearish" if score < -0.1 else "neutral"
        ranked = sorted(factors, key=lambda x: -abs(x.weight * x.score))
        reasons = [
            setup.text,
            *([setup.context] if setup.context else []),
            *[x.text for x in ranked if abs(x.score) >= 0.1][:3],
        ]
        regime = ctx.regime.regime.replace("_", " ").lower()
        summary = (
            f"No trade on {ctx.symbol} {ctx.timeframe}: {lower_first(setup.text)}. "
            f"Evidence leans {lean} (score {score:+.2f}) in a {regime} market."
        )
        detailed = self._narrative(ctx, factors, raw, score, setup, None, notes) if ctx.narrate else summary
        return self._result(
            signal="HOLD",
            confidence=confidence,
            entry=None,
            stop_loss=None,
            take_profit=None,
            summary=summary,
            reasons=reasons[:5],
            risks=notes[:4],
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
        setup: Setup,
        confidence: float,
        trade: levels.TradePlan,
        notes: list[str],
    ) -> AnalystResult:
        sign = 1.0 if side == "LONG" else -1.0
        supporting = sorted(
            (x for x in factors if x.score * sign > 0.05), key=lambda x: -abs(x.weight * x.score)
        )
        opposing = sorted(
            (x for x in factors if x.score * sign < -0.15), key=lambda x: -abs(x.weight * x.score)
        )
        reasons = [setup.text, *([setup.context] if setup.context else []), *(x.text for x in supporting)][:6]
        reasons.append(f"Stop {fmt_pct(trade.stop_pct)} away ({trade.basis}), target {trade.r_multiple:.1f}R")
        risks = [*notes, *(x.text for x in opposing)][:5]
        inval = levels.invalidation(ctx, side, trade.stop_loss)
        drivers = ", ".join(lower_first(x.text) for x in supporting[:2]) or "aligned indicators"
        word = "Long" if side == "LONG" else "Short"
        summary = (
            f"{word} {ctx.symbol} on a {setup.kind}: {drivers}. Entry {fmt_price(trade.entry)}, stop "
            f"{fmt_price(trade.stop_loss, compact=True)}, target {fmt_price(trade.take_profit, compact=True)} "
            f"({trade.risk_reward:.1f}R) at {confidence:.0f}% confidence."
        )
        detailed = self._narrative(ctx, factors, raw, score, setup, trade, notes) if ctx.narrate else summary
        return self._result(
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
        setup: Setup,
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
            f"Regime: {reg.regime.replace('_', ' ').lower()} ({reg.confidence:.0f}% confidence)"
            + (": " + ", ".join(vol_bits) if vol_bits else "")
            + "."
        )
        if ctx.mtf is not None:
            tfs = ", ".join(f"{t.timeframe} {t.trend.lower()}" for t in ctx.mtf.timeframes)
            direction, sep = higher_trend(ctx)
            h4 = (
                f"; {trend_timeframe(ctx)} EMA 21 {abs(sep):.1f} ATR {'above' if sep >= 0 else 'below'} EMA 50"
                + (" (no trend)" if direction == 0 else "")
                if trend_timeframe(ctx) in ctx.features
                else ""
            )
            p4 = f"Multi-timeframe: {ctx.mtf.alignment_label.lower()} ({tfs}{h4})."
        else:
            p4 = "Multi-timeframe: not enough data yet."
        if setup.side is not None and trade is not None:
            cost = ctx.round_trip_cost_pct
            p5 = (
                f"Setup: {lower_first(setup.text)}. Plan: {setup.side.lower()} at {fmt_price(trade.entry)} with the "
                f"stop at {fmt_price(trade.stop_loss)} ({fmt_pct(trade.stop_pct)} away, {trade.basis}) and the target "
                f"at {fmt_price(trade.take_profit)} ({trade.r_multiple:.1f}R for a "
                f"{reg.regime.replace('_', ' ').lower()} market). The stop is {trade.stop_pct / cost:.1f}× the "
                f"{fmt_pct(cost)} round-trip cost, so fees and slippage do not dominate the outcome."
            )
            if notes:
                p5 += " Watch: " + "; ".join(lower_first(n) for n in notes) + "."
        else:
            p5 = (
                f"Decision: {lower_first(setup.text)}. The bot joins an established {trend_timeframe(ctx)} trend "
                f"only on a "
                f"pullback, and fades a stretched move at a band only inside a range; neither is in place, so it "
                f"stands aside."
            )
        p6 = f"Composite score {score:+.2f} (before regime adjustment {raw:+.2f}) from {len(factors)} weighted factors."
        return "\n\n".join(p for p in (p1, p2, p3, p4, p5, p6) if p)
