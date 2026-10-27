"""Strategies: how an analyst's call and the technical baseline become the bot's decision.

- ``ai`` — the analyst's signal stands (``ai.select``).
- ``baseline`` — the technical rule set alone (``baseline.evaluate``), no analyst call.
- ``hybrid`` — the analyst's signal only when the baseline agrees (``hybrid.combine``).

The baseline is evaluated for every decision so ``AIAnalysis.baseline_signal`` always
records what the rules said.
"""

from __future__ import annotations

from ..ai.base import AnalystResult
from ..schemas import StrategyName
from . import baseline, hybrid
from .ai import select

STRATEGIES: tuple[StrategyName, ...] = ("ai", "hybrid", "baseline")


def needs_analyst(strategy: StrategyName) -> bool:
    return strategy != "baseline"


def decide(strategy: StrategyName, analyst: AnalystResult | None, base: AnalystResult) -> AnalystResult:
    """The final call for ``strategy`` from the analyst's result and the baseline's."""
    if strategy == "baseline" or analyst is None:
        return base
    if strategy == "hybrid":
        return hybrid.combine(analyst, base)
    return select(analyst)


__all__ = ["STRATEGIES", "baseline", "decide", "hybrid", "needs_analyst", "select"]
