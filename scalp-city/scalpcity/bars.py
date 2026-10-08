"""1-minute bars and US equity session helpers (all times America/New_York)."""

from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
RTH_OPEN = time(9, 30)
RTH_CLOSE = time(16, 0)

# NYSE full-day closures. Extend as needed; unknown holidays only make the 1DTE expiry one day too early.
NYSE_HOLIDAYS = {
    date(2025, 1, 1), date(2025, 1, 9), date(2025, 1, 20), date(2025, 2, 17), date(2025, 4, 18),
    date(2025, 5, 26), date(2025, 6, 19), date(2025, 7, 4), date(2025, 9, 1), date(2025, 11, 27),
    date(2025, 12, 25),
    date(2026, 1, 1), date(2026, 1, 19), date(2026, 2, 16), date(2026, 4, 3), date(2026, 5, 25),
    date(2026, 6, 19), date(2026, 7, 3), date(2026, 9, 7), date(2026, 11, 26), date(2026, 12, 25),
    date(2027, 1, 1), date(2027, 1, 18), date(2027, 2, 15), date(2027, 3, 26), date(2027, 5, 31),
    date(2027, 6, 18), date(2027, 7, 5), date(2027, 9, 6), date(2027, 11, 25), date(2027, 12, 24),
}


@dataclass(frozen=True)
class Bar:
    """One 1-minute candle. `ts` is the bar's OPEN time (09:30 covers 09:30:00-09:30:59), tz-aware ET."""

    ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float

    @property
    def close_ts(self) -> datetime:
        return self.ts + timedelta(minutes=1)


def is_trading_day(d: date) -> bool:
    return d.weekday() < 5 and d not in NYSE_HOLIDAYS


def next_trading_day(d: date, n: int = 1) -> date:
    """The n-th trading day after d (n=0 returns d itself if it trades, else the next one)."""
    if n == 0:
        while not is_trading_day(d):
            d += timedelta(days=1)
        return d
    for _ in range(n):
        d += timedelta(days=1)
        while not is_trading_day(d):
            d += timedelta(days=1)
    return d


def in_rth(ts: datetime) -> bool:
    t = ts.astimezone(ET).time()
    return RTH_OPEN <= t < RTH_CLOSE


def parse_hhmm(s: str) -> time:
    h, m = s.split(":")
    return time(int(h), int(m))


def _parse_ts(raw: str) -> datetime:
    raw = raw.strip()
    if raw.isdigit():  # epoch seconds or ms
        v = int(raw)
        return datetime.fromtimestamp(v / 1000 if v > 10**11 else v, ET)
    ts = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    return ts.replace(tzinfo=ET) if ts.tzinfo is None else ts.astimezone(ET)


def load_csv(path: str, rth_only: bool = True) -> list[Bar]:
    """CSV with a header containing timestamp/time/date, open, high, low, close, volume (any case).

    Naive timestamps are read as New York time. Bars are sorted and de-duplicated.
    """
    out: dict[datetime, Bar] = {}
    with open(path, newline="") as f:
        rows = csv.DictReader(f)
        cols = {c.lower().strip(): c for c in rows.fieldnames or []}
        tcol = next((cols[k] for k in ("timestamp", "datetime", "time", "date", "t") if k in cols), None)
        if tcol is None:
            raise ValueError(f"{path}: no timestamp column in {list(cols)}")
        get = lambda r, k: float(r[cols[k]])  # noqa: E731
        for r in rows:
            ts = _parse_ts(r[tcol])
            if rth_only and not in_rth(ts):
                continue
            out[ts] = Bar(ts, get(r, "open"), get(r, "high"), get(r, "low"), get(r, "close"), get(r, "volume"))
    return [out[k] for k in sorted(out)]


def save_csv(path: str, bars: list[Bar]) -> None:
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["timestamp", "open", "high", "low", "close", "volume"])
        for b in bars:
            w.writerow([b.ts.isoformat(), b.open, b.high, b.low, b.close, b.volume])
