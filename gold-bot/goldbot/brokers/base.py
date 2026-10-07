from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

import pandas as pd


@dataclass
class Position:
    id: str
    side: str          # "buy" | "sell"
    units: float       # ounces (always positive)
    entry: float
    sl: float | None
    tp: float | None


class Broker(ABC):
    name = "broker"

    @abstractmethod
    def candles(self, count: int) -> pd.DataFrame:
        """Completed M15 candles, oldest first: time (UTC, bar open), open, high, low, close."""

    @abstractmethod
    def equity(self) -> float: ...

    @abstractmethod
    def quote(self) -> tuple[float, float]:
        """(bid, ask)"""

    @abstractmethod
    def position(self) -> Position | None:
        """This bot's open XAUUSD position, if any."""

    @abstractmethod
    def min_units(self) -> float: ...

    @abstractmethod
    def normalize_units(self, units: float) -> float:
        """Round down to what the broker accepts (0 if below the minimum)."""

    @abstractmethod
    def open(self, side: str, units: float, sl: float, tp: float) -> Position: ...

    @abstractmethod
    def set_sl(self, pos: Position, sl: float) -> None: ...

    @abstractmethod
    def close(self, pos: Position) -> None: ...
