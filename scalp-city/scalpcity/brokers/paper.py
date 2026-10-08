from __future__ import annotations

from datetime import datetime

from ..options import Contract, SimPricer
from .base import Fill


class PaperBroker:
    """Fills instantly at the modelled ask (buys) / bid (sells), plus a per-contract commission."""

    def __init__(self, pricer: SimPricer, fee_per_contract: float = 0.65):
        self.pricer = pricer
        self.fee = fee_per_contract

    def resolve(self, wanted: Contract, now: datetime) -> Contract:
        return wanted

    def buy(self, c: Contract, qty: int, spot: float, now: datetime) -> Fill:
        _, ask = self.pricer.bid_ask(c, spot, now)
        return Fill(c, qty, round(ask, 2), now, self.fee * qty)

    def sell(self, c: Contract, qty: int, spot: float, now: datetime) -> Fill:
        bid, _ = self.pricer.bid_ask(c, spot, now)
        return Fill(c, qty, round(bid, 2), now, self.fee * qty)

    def mark(self, c: Contract, spot: float, now: datetime) -> float:
        return self.pricer.bid_ask(c, spot, now)[0]

    def ask(self, c: Contract, spot: float, now: datetime) -> float:
        return self.pricer.bid_ask(c, spot, now)[1]
