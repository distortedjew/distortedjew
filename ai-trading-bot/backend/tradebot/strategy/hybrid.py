"""``hybrid``: the analyst's signal only when the technical baseline agrees on direction.

The baseline agrees when it signals the same side itself, or when it holds but its trend
filter (EMA 21 vs EMA 50 on the decision timeframe) points the analyst's way: the hybrid asks
the rules to confirm the *direction*, not to time the entry — the baseline only enters on
momentum, so requiring its own entry signal would veto every pullback entry. A disagreement
(the baseline signalling the other side, its trend filter pointing the other way, or no trend
reading yet) turns the call into HOLD, keeps the analyst's reasoning for the record and states
the conflict as a risk bullet. HOLD calls pass through.
"""

from __future__ import annotations

from dataclasses import replace

from ..ai.base import AnalystResult


def agrees(analyst: AnalystResult, baseline: AnalystResult) -> bool:
    """True when the baseline confirms the analyst's direction (always for HOLD)."""
    if analyst.signal == "HOLD" or baseline.signal == analyst.signal:
        return True
    return baseline.signal == "HOLD" and baseline.bias == analyst.signal


def conflict(analyst: AnalystResult, baseline: AnalystResult) -> str:
    """The disagreement as a risk bullet."""
    if baseline.signal not in ("HOLD", analyst.signal):
        return f"Baseline disagrees: it signals {baseline.signal}"
    if baseline.bias is None:
        return "Baseline trend filter has no reading yet (indicators warming up)"
    word = "below" if baseline.bias == "SHORT" else "above"
    return f"Baseline trend filter points {baseline.bias} (EMA 21 {word} EMA 50)"


def combine(analyst: AnalystResult, baseline: AnalystResult) -> AnalystResult:
    if agrees(analyst, baseline):
        if analyst.signal == "HOLD":
            return analyst
        how = (
            "it signals the same side"
            if baseline.signal == analyst.signal
            else "its trend filter points the same way"
        )
        return replace(
            analyst,
            reasons=[*analyst.reasons, f"Technical baseline agrees ({how})"],
            risks=list(analyst.risks),
        )
    why = conflict(analyst, baseline)
    # confidence of standing aside falls as the analyst's conviction rises
    hold_conf = round(max(50.0, min(70.0, 120.0 - analyst.confidence)), 1)
    return replace(
        analyst,
        signal="HOLD",
        confidence=hold_conf,
        entry=None,
        stop_loss=None,
        take_profit=None,
        invalidation=None,
        summary=(
            f"Hybrid filter: the analyst's {analyst.signal} ({analyst.confidence:.0f}%) is not confirmed by the "
            f"technical baseline, so the bot stands aside."
        ),
        risks=[why, *analyst.risks][:5],
        detailed_reasoning=(
            f"Hybrid strategy: trades require the analyst and the technical baseline to agree on direction. "
            f"{why}.\n\nAnalyst view ({analyst.model}): {analyst.summary}\n\n{analyst.detailed_reasoning}"
        ),
    )
