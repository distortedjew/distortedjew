"""The city: routes bars to workers, runs the city-wide "vault" limits, and writes the dashboard state."""

from __future__ import annotations

import json
import logging
import os
import tempfile
from collections import deque
from datetime import datetime, timezone

from .bars import Bar
from .brokers.base import Broker
from .config import CityConfig
from .worker import IN_CALL, IN_PUT, WATCHING, Worker

log = logging.getLogger("scalpcity")


class City:
    def __init__(self, cfg: CityConfig, broker: Broker, mode: str = "paper", keep_days: int = 60):
        self.cfg = cfg
        self.mode = mode
        self.keep_days = keep_days
        self.tape: deque[str] = deque(maxlen=200)
        self.workers = [Worker(w, broker, self._event) for w in cfg.workers]
        self.by_symbol: dict[str, list[Worker]] = {}
        for w in self.workers:
            self.by_symbol.setdefault(w.cfg.symbol, []).append(w)
        self.day = None
        self.vault_closed = False
        self.asof: datetime | None = None

    def _event(self, w: Worker, msg: str) -> None:
        ts = f"{w.last_ts:%H:%M}" if w.last_ts else "--:--"
        line = f"{ts} {w.cfg.name}: {msg}"
        self.tape.appendleft(line)
        log.info(line)

    def on_bar(self, symbol: str, bar: Bar, trade: bool = True) -> None:
        if bar.ts.date() != self.day:
            self.day, self.vault_closed = bar.ts.date(), False
        self.asof = bar.close_ts
        for w in self.by_symbol.get(symbol, []):
            w.on_bar(bar, trade)
        if trade:
            self._vault_limits()

    def today_pnl(self) -> float:
        return sum(w.day_pnl for w in self.workers if w.day == self.day)

    def _vault_limits(self) -> None:
        if self.vault_closed:
            return
        pnl = self.today_pnl()
        why = None
        if self.cfg.daily_profit_target > 0 and pnl >= self.cfg.daily_profit_target:
            why = "vault target"
        elif self.cfg.daily_max_loss > 0 and pnl <= -self.cfg.daily_max_loss:
            why = "vault max loss"
        if why:
            self.vault_closed = True
            self.tape.appendleft(f"{self.asof:%H:%M} VAULT: {why} ({pnl:+.0f}), everyone clocks out")
            for w in self.workers:
                w.clock_out(why)

    def flatten_all(self, why: str = "shutdown") -> None:
        for w in self.workers:
            if w.pos:
                w.close(why)

    # ------------------------------------------------------------------ dashboard state
    def history(self) -> list[dict]:
        days: dict[str, float] = {}
        for w in self.workers:
            for d, dl in w.days.items():
                days[d] = days.get(d, 0.0) + dl.pnl
        return [{"date": d, "pnl": round(p, 2)} for d, p in sorted(days.items())]

    def state(self) -> dict:
        hist = self.history()[-self.keep_days:]
        keep = {h["date"] for h in hist}
        return {
            "city": self.cfg.name,
            "mode": self.mode,
            "asof": self.asof.isoformat() if self.asof else None,
            "written_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "day": str(self.day) if self.day else None,
            "vault": {
                "today": round(self.today_pnl(), 2),
                "target": self.cfg.daily_profit_target,
                "on_shift": sum(1 for w in self.workers if w.status in (WATCHING, IN_CALL, IN_PUT)),
                "closed": self.vault_closed,
            },
            "workers": [
                {**w.snapshot(), "days": {d: dl.__dict__ for d, dl in w.days.items() if d in keep}} for w in self.workers
            ],
            "history": hist,
            "tape": list(self.tape)[:60],
        }

    def write_state(self, path: str | None = None) -> None:
        path = path or self.cfg.state_path
        d = os.path.dirname(os.path.abspath(path))
        os.makedirs(d, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=d, suffix=".tmp")
        with os.fdopen(fd, "w") as f:
            json.dump(self.state(), f, separators=(",", ":"))
        os.replace(tmp, path)  # atomic: the dashboard never reads half a file
