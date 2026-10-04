"""Small data types shared by the brokers, the bots and the store."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime

OCC_RE = re.compile(r"^([A-Z.]{1,6})(\d{6})([CP])(\d{8})$")


def parse_occ(symbol: str) -> tuple[str, date, str, float]:
    """'SPY251121P00550000' -> ('SPY', date(2025,11,21), 'put', 550.0)."""
    m = OCC_RE.match(symbol)
    if not m:
        raise ValueError(f"not an OCC option symbol: {symbol}")
    root, ymd, cp, strike = m.groups()
    exp = datetime.strptime(ymd, "%y%m%d").date()
    return root, exp, "call" if cp == "C" else "put", int(strike) / 1000


def occ_symbol(root: str, exp: date, kind: str, strike: float) -> str:
    return f"{root}{exp:%y%m%d}{'C' if kind == 'call' else 'P'}{round(strike * 1000):08d}"


@dataclass
class Bar:
    day: date
    o: float
    h: float
    l: float
    c: float
    v: float


@dataclass
class OptionQuote:
    symbol: str
    kind: str          # "call" | "put"
    strike: float
    expiration: date
    bid: float
    ask: float
    delta: float | None = None
    iv: float | None = None

    @property
    def mid(self) -> float:
        return (self.bid + self.ask) / 2


@dataclass
class Leg:
    symbol: str
    side: str          # "buy" | "sell" (for the opening order)
    ratio: int = 1

    def to_dict(self) -> dict:
        _, exp, kind, strike = parse_occ(self.symbol)
        return {"symbol": self.symbol, "side": self.side, "ratio": self.ratio,
                "kind": kind, "strike": strike, "expiration": exp.isoformat()}


@dataclass
class Proposal:
    """A trade a bot wants to open."""
    kind: str                       # credit_spread | debit_spread | iron_condor | csp | covered_call
    direction: str                  # bullish | bearish | neutral
    legs: list[Leg]
    quotes: dict[str, OptionQuote]  # symbol -> quote at decision time
    max_loss_per_unit: float        # dollars per 1 spread / contract, used for sizing
    reason: str
    meta: dict = field(default_factory=dict)


@dataclass
class OrderResult:
    status: str                     # filled | partial | unfilled | rejected
    filled_qty: int
    price: float                    # net per unit, debit positive / credit negative
    order_id: str = ""
    message: str = ""
