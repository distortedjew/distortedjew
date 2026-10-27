"""``ai``: the analyst's call stands as given (risk management still applies downstream)."""

from __future__ import annotations

from ..ai.base import AnalystResult


def select(analyst: AnalystResult) -> AnalystResult:
    return analyst
