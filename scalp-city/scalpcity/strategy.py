"""The signal engine: the three triggers from the video, evaluated on each closed 1-minute candle.

1. VWAP  - a candle closes across the session VWAP.
2. EMA50 - a candle closes across the 50-period EMA (of 1-minute closes).
3. ORB   - a candle closes outside the first-15-minutes range (09:30-09:44 bars).

Closing ABOVE the level -> buy a CALL. Closing BELOW -> buy a PUT.

The engine is incremental (one bar at a time) so the backtest and the live bot run the exact same code.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from .bars import RTH_OPEN, Bar

CALL, PUT = "call", "put"
TRIGGERS = ("vwap", "ema50", "orb")


@dataclass
class Levels:
    vwap: float | None = None
    ema: float | None = None
    or_high: float | None = None
    or_low: float | None = None


@dataclass
class Signal:
    ts: datetime  # close time of the signal candle
    direction: str  # CALL or PUT
    triggers: list[str]
    price: float  # underlying close of the signal candle
    levels: Levels = field(default_factory=Levels)

    def label(self) -> str:
        return f"{self.direction.upper()} {'+'.join(self.triggers)} @ {self.price:.2f}"


class Indicators:
    """Session VWAP (resets daily), continuous EMA, and the opening range."""

    def __init__(self, ema_len: int = 50, or_minutes: int = 15):
        self.ema_len = ema_len
        self.or_minutes = or_minutes
        self.alpha = 2 / (ema_len + 1)
        self.day: date | None = None
        self.pv = self.vol = 0.0
        self.ema: float | None = None
        self.ema_count = 0
        self.or_high = self.or_low = None
        self.or_done = False
        self._or_hi = float("-inf")
        self._or_lo = float("inf")
        self.or_end = (datetime.combine(date.today(), RTH_OPEN) + timedelta(minutes=or_minutes)).time()

    def update(self, bar: Bar) -> Levels:
        d = bar.ts.date()
        if d != self.day:
            self.day = d
            self.pv = self.vol = 0.0
            self.or_high = self.or_low = None
            self.or_done = False
            self._or_hi, self._or_lo = float("-inf"), float("inf")

        typical = (bar.high + bar.low + bar.close) / 3
        vol = max(bar.volume, 0.0)
        self.pv += typical * vol
        self.vol += vol
        vwap = self.pv / self.vol if self.vol > 0 else typical

        self.ema = bar.close if self.ema is None else self.ema + self.alpha * (bar.close - self.ema)
        self.ema_count += 1

        t = bar.ts.time()
        if not self.or_done and t < self.or_end:
            self._or_hi, self._or_lo = max(self._or_hi, bar.high), min(self._or_lo, bar.low)
            if bar.close_ts.time() >= self.or_end:  # last opening-range bar just closed
                self.or_high, self.or_low, self.or_done = self._or_hi, self._or_lo, True
        elif not self.or_done and self._or_hi > float("-inf"):  # missing bars: close the range late
            self.or_high, self.or_low, self.or_done = self._or_hi, self._or_lo, True

        ema = self.ema if self.ema_count >= self.ema_len else None  # don't trade an unwarmed EMA
        return Levels(vwap, ema, self.or_high, self.or_low)


def _cross(prev_close: float, prev_level: float | None, close: float, level: float | None) -> str | None:
    if prev_level is None or level is None:
        return None
    if prev_close <= prev_level and close > level:
        return CALL
    if prev_close >= prev_level and close < level:
        return PUT
    return None


class SignalEngine:
    def __init__(
        self,
        triggers: tuple[str, ...] | list[str] = TRIGGERS,
        ema_len: int = 50,
        or_minutes: int = 15,
        orb_once_per_day: bool = True,
        min_cross_pct: float = 0.0,
    ):
        bad = set(triggers) - set(TRIGGERS)
        if bad:
            raise ValueError(f"unknown triggers {bad}; choose from {TRIGGERS}")
        self.triggers = tuple(triggers)
        self.ind = Indicators(ema_len, or_minutes)
        self.orb_once = orb_once_per_day
        self.min_cross_pct = min_cross_pct  # optional: require the close to clear the level by this % (chop filter)
        self.prev: tuple[date, float, Levels] | None = None
        self.orb_fired: set[str] = set()
        self.levels = Levels()

    def on_bar(self, bar: Bar) -> Signal | None:
        lv = self.ind.update(bar)
        self.levels = lv
        prev, self.prev = self.prev, (bar.ts.date(), bar.close, lv)
        if prev is None or prev[0] != bar.ts.date():  # first candle of a session has nothing to cross from
            self.orb_fired = set()
            return None
        _, pc, pl = prev

        hits: dict[str, str] = {}
        if "vwap" in self.triggers and (d := _cross(pc, pl.vwap, bar.close, lv.vwap)):
            hits["vwap"] = d
        if "ema50" in self.triggers and (d := _cross(pc, pl.ema, bar.close, lv.ema)):
            hits["ema50"] = d
        if "orb" in self.triggers and lv.or_high is not None:
            # Breakout = close outside the range after the previous close was inside (or the range just completed).
            if bar.close > lv.or_high and (pl.or_high is None or pc <= lv.or_high):
                hits["orb"] = CALL
            elif bar.close < lv.or_low and (pl.or_low is None or pc >= lv.or_low):
                hits["orb"] = PUT
            if hits.get("orb") and self.orb_once:
                if hits["orb"] in self.orb_fired:
                    del hits["orb"]
                else:
                    self.orb_fired.add(hits["orb"])

        if self.min_cross_pct > 0:
            ref = {"vwap": lv.vwap, "ema50": lv.ema, "orb": None}
            for k in list(hits):
                lvl = ref[k] if k != "orb" else (lv.or_high if hits[k] == CALL else lv.or_low)
                if lvl and abs(bar.close - lvl) / lvl * 100 < self.min_cross_pct:
                    del hits[k]

        dirs = set(hits.values())
        if len(dirs) != 1:  # nothing, or triggers disagree on the same candle -> stand aside
            return None
        return Signal(bar.close_ts, dirs.pop(), sorted(hits), bar.close, lv)


def time_in(t: time, start: time, end: time) -> bool:
    return start <= t < end
