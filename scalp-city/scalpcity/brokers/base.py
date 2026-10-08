from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from ..options import Contract


@dataclass
class Fill:
    contract: Contract
    qty: int
    price: float  # per share; one contract = 100 shares
    ts: datetime
    fees: float = 0.0
    order_id: str = ""


class Broker(Protocol):
    """What a worker needs from a broker. `spot` and `now` let a simulated broker price the option."""

    def resolve(self, wanted: Contract, now: datetime) -> Contract:
        """Swap the wanted contract for the nearest one that actually lists (identity for paper)."""
        ...

    def buy(self, c: Contract, qty: int, spot: float, now: datetime) -> Fill: ...

    def sell(self, c: Contract, qty: int, spot: float, now: datetime) -> Fill: ...

    def ask(self, c: Contract, spot: float, now: datetime) -> float:
        """Price you would pay right now (used for premium-based sizing)."""
        ...

    def mark(self, c: Contract, spot: float, now: datetime) -> float:
        """Price you could sell at right now (the bid)."""
        ...
