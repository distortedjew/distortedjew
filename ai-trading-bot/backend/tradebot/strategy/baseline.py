"""``baseline-v1``: a classic technical rule set, no AI (``provider="heuristic"``).

- Trend filter: EMA 21 above EMA 50 → longs only; below → shorts only.
- LONG when price closes above EMA 21, the MACD histogram is positive and RSI is 45–70.
- SHORT when price closes below EMA 21, the MACD histogram is negative and RSI is 30–55.
- Stops from ``ai.levels.plan`` (ATR / swing with the round-trip-cost floor), target 2R.
- Confidence starts at 62 and gains for ADX ≥ 25 (+6), timeframe alignment ≥ 3/4 (+6),
  volume ≥ 1.2× average (+4) and a MACD histogram growing in the trade's direction (+4);
  capped at 85. With the default 65 % minimum, at least one confirmation is required.
"""

from __future__ import annotations

from ..ai import levels
from ..ai.base import AnalystResult, MarketContext
from ..ai.heuristic import lower_first
from ..market.symbols import fmt_pct, fmt_price
from ..schemas import Side

MODEL_ID = "baseline-v1"
TARGET_R = 2.0
BASE_CONFIDENCE = 62.0
MAX_CONFIDENCE = 85.0


def _hold(ctx: MarketContext, reasons: list[str], risks: list[str] | None = None) -> AnalystResult:
    return AnalystResult(
        signal="HOLD",
        confidence=60.0,
        entry=None,
        stop_loss=None,
        take_profit=None,
        summary=f"Baseline rules see no entry on {ctx.symbol} {ctx.timeframe}: {lower_first(reasons[0])}.",
        reasons=reasons,
        risks=risks or [],
        invalidation=None,
        detailed_reasoning="Technical baseline (EMA 21/50 trend filter, MACD and RSI entry filters, ATR stops). "
        + " ".join(r.rstrip(".") + "." for r in reasons),
        provider="heuristic",
        model=MODEL_ID,
    )


def bias(ctx: MarketContext) -> Side | None:
    """The trend filter's direction (EMA 21 vs EMA 50), None while warming up."""
    f = ctx.decision
    if f.ema21 is None or f.ema50 is None:
        return None
    return "LONG" if f.ema21 > f.ema50 else "SHORT"


def evaluate(ctx: MarketContext) -> AnalystResult:
    f = ctx.decision
    if f.ema21 is None or f.ema50 is None or f.macd_hist is None or f.rsi is None or f.atr is None:
        return _hold(ctx, ["Indicators are still warming up"])
    trend = bias(ctx)
    price, rsi, hist = f.price, f.rsi, f.macd_hist
    if trend == "LONG":
        filters = [
            (price > f.ema21, f"Close above EMA 21 ({fmt_price(f.ema21)})", "Close below EMA 21"),
            (hist > 0, "MACD histogram positive", "MACD histogram not positive"),
            (
                45.0 <= rsi <= 70.0,
                f"RSI {rsi:.0f} inside the 45–70 long band",
                f"RSI {rsi:.0f} outside the 45–70 long band",
            ),
        ]
        trend_text = "EMA 21 above EMA 50 (long-only trend filter)"
    else:
        filters = [
            (price < f.ema21, f"Close below EMA 21 ({fmt_price(f.ema21)})", "Close above EMA 21"),
            (hist < 0, "MACD histogram negative", "MACD histogram not negative"),
            (
                30.0 <= rsi <= 55.0,
                f"RSI {rsi:.0f} inside the 30–55 short band",
                f"RSI {rsi:.0f} outside the 30–55 short band",
            ),
        ]
        trend_text = "EMA 21 below EMA 50 (short-only trend filter)"
    failed = [bad for ok, _good, bad in filters if not ok]
    if failed:
        return _hold(ctx, [f"{trend_text}, but {lower_first(failed[0])}", *failed[1:]])

    side: Side = trend  # type: ignore[assignment]
    sign = 1.0 if side == "LONG" else -1.0
    confidence = BASE_CONFIDENCE
    reasons = [trend_text, *(good for _ok, good, _bad in filters)]
    risks: list[str] = []
    if f.adx is not None and f.adx >= 25:
        confidence += 6
        reasons.append(f"ADX {f.adx:.0f} confirms the trend")
    elif f.adx is not None:
        risks.append(f"ADX {f.adx:.0f} below 25: trend strength unconfirmed")
    mtf = ctx.mtf
    want = "BULL" if side == "LONG" else "BEAR"
    if mtf is not None and mtf.dominant == want and mtf.total and mtf.aligned_count / mtf.total >= 0.75:
        confidence += 6
        reasons.append(f"{mtf.aligned_count}/{mtf.total} timeframes agree")
    elif mtf is not None:
        risks.append(f"Timeframes not aligned ({mtf.alignment_label.lower()})")
    if f.volume_ratio is not None and f.volume_ratio >= 1.2:
        confidence += 4
        reasons.append(f"Volume {f.volume_ratio:.1f}× its 20-bar average")
    if f.macd_hist_prev is not None and (hist - f.macd_hist_prev) * sign > 0:
        confidence += 4
        reasons.append("MACD histogram expanding in the trade's direction")
    confidence = min(MAX_CONFIDENCE, confidence)

    trade = levels.plan(ctx, side, r_multiple=TARGET_R)
    reasons.append(f"Stop {fmt_pct(trade.stop_pct)} away ({trade.basis}), target {TARGET_R:.0f}R")
    word = "Long" if side == "LONG" else "Short"
    summary = (
        f"{word} {ctx.symbol}: the baseline's trend, MACD and RSI filters all pass. Entry {fmt_price(trade.entry)}, "
        f"stop {fmt_price(trade.stop_loss, compact=True)}, target {fmt_price(trade.take_profit, compact=True)}."
    )
    return AnalystResult(
        signal=side,
        confidence=confidence,
        entry=trade.entry,
        stop_loss=trade.stop_loss,
        take_profit=trade.take_profit,
        summary=summary,
        reasons=reasons,
        risks=risks,
        invalidation=levels.invalidation(ctx, side, trade.stop_loss),
        detailed_reasoning=(
            "Technical baseline (EMA 21/50 trend filter, MACD and RSI entry filters, ATR stops). "
            + " ".join(r.rstrip(".") + "." for r in reasons)
            + (" Caveats: " + "; ".join(risks) + "." if risks else "")
        ),
        provider="heuristic",
        model=MODEL_ID,
    )
