"""``hybrid``: the analyst's signal only when the technical baseline agrees on direction.

Agreement means the baseline produced the same LONG/SHORT signal. A disagreement — the
baseline pointing the other way, or holding — turns the call into HOLD, keeps the analyst's
reasoning for the record and states the conflict as a risk bullet. HOLD calls pass through.
"""

from __future__ import annotations

from dataclasses import replace

from ..ai.base import AnalystResult


def combine(analyst: AnalystResult, baseline: AnalystResult) -> AnalystResult:
    if analyst.signal == "HOLD" or analyst.signal == baseline.signal:
        if analyst.signal != "HOLD":
            return replace(
                analyst,
                reasons=[*analyst.reasons, f"Technical baseline agrees ({baseline.signal})"],
                risks=list(analyst.risks),
            )
        return analyst
    if baseline.signal == "HOLD":
        conflict = (
            f"Baseline does not confirm the {analyst.signal} (it holds: {baseline.reasons[0].rstrip('.')})"
        )
    else:
        conflict = f"Baseline disagrees: it signals {baseline.signal}"
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
        risks=[conflict, *analyst.risks][:5],
        detailed_reasoning=(
            f"Hybrid strategy: trades require the analyst and the technical baseline to agree on direction. "
            f"{conflict}.\n\nAnalyst view ({analyst.model}): {analyst.summary}\n\n{analyst.detailed_reasoning}"
        ),
    )
