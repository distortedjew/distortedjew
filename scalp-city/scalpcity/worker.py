"""A worker = one bot = one tower. Turns signals into option trades and enforces its own daily limits."""

from __future__ import annotations

import logging
import math
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta

from .bars import Bar, parse_hhmm
from .brokers.base import Broker
from .config import WorkerConfig
from .options import Contract, pick_contract
from .strategy import CALL, Signal, SignalEngine

log = logging.getLogger("scalpcity")

WATCHING, IN_CALL, IN_PUT, TARGET_HIT, HALTED, CLOSED = "watching", "call", "put", "target hit", "halted", "closed"


@dataclass
class Position:
    contract: Contract
    qty: int
    entry: float
    opened: datetime
    triggers: list[str]
    spot_in: float
    fees_in: float = 0.0
    mark: float = 0.0


@dataclass
class Trade:
    symbol: str
    contract: str
    right: str
    qty: int
    entry: float
    exit: float
    opened: str
    closed: str
    triggers: list[str]
    reason: str
    pnl: float


@dataclass
class DayLog:
    """Everything the dashboard needs to draw one worker's day."""

    day: str
    pnl: float = 0.0
    bars: list[list] = field(default_factory=list)  # [hh:mm, close, vwap, ema]
    opening_range: list = field(default_factory=lambda: [None, None])
    signals: list[dict] = field(default_factory=list)
    trades: list[dict] = field(default_factory=list)


class Worker:
    def __init__(self, cfg: WorkerConfig, broker: Broker, on_event=None):
        self.cfg = cfg
        self.broker = broker
        self.engine = SignalEngine(cfg.triggers, cfg.ema_len, cfg.or_minutes, cfg.orb_once_per_day, cfg.min_cross_pct)
        self.on_event = on_event or (lambda w, msg: None)
        self.entry_start, self.entry_end = parse_hhmm(cfg.entry_start), parse_hhmm(cfg.entry_end)
        self.flatten_at = parse_hhmm(cfg.flatten_at)
        self.pos: Position | None = None
        self.day: date | None = None
        self.status = WATCHING
        self.day_pnl = 0.0
        self.trades_today = 0
        self.cooldown_until: datetime | None = None
        self.days: dict[str, DayLog] = {}
        self.last_spot = 0.0
        self.last_ts: datetime | None = None

    # ----------------------------------------------------------------- per-bar loop
    def on_bar(self, bar: Bar) -> None:
        if bar.ts.date() != self.day:
            self._new_day(bar.ts.date())
        sig = self.engine.on_bar(bar)
        now, spot = bar.close_ts, bar.close
        self.last_spot, self.last_ts = spot, now
        lv = self.engine.levels
        dl = self.days[str(self.day)]
        dl.bars.append([f"{bar.ts:%H:%M}", round(spot, 2), _r(lv.vwap), _r(lv.ema)])
        dl.opening_range = [_r(lv.or_high), _r(lv.or_low)]
        if sig:
            dl.signals.append({"t": f"{bar.ts:%H:%M}", "dir": sig.direction, "triggers": sig.triggers, "price": round(spot, 2)})

        if self.pos and self._manage(sig, spot, now):
            sig = None  # the signal was used to exit and the worker doesn't reverse
        if not self.pos and sig and self._may_enter(now):
            self._open(sig, spot, now)

    def _new_day(self, d: date) -> None:
        if self.pos:  # carried overnight (only if flatten_at is after the close) - mark it as a new day's trade
            log.warning("%s: position carried into %s", self.cfg.name, d)
        self.day = d
        self.status = WATCHING if not self.pos else self.status
        self.day_pnl = 0.0
        self.trades_today = 0
        self.cooldown_until = None
        self.days.setdefault(str(d), DayLog(str(d)))

    # ----------------------------------------------------------------- entries
    def _may_enter(self, now: datetime) -> bool:
        if self.status in (TARGET_HIT, HALTED, CLOSED):
            return False
        t = now.time()
        if not (self.entry_start <= t <= self.entry_end):
            return False
        if self.trades_today >= self.cfg.max_trades_per_day:
            return False
        return not (self.cooldown_until and now < self.cooldown_until)

    def _open(self, sig: Signal, spot: float, now: datetime) -> None:
        c = self.broker.resolve(
            pick_contract(self.cfg.symbol, spot, sig.direction, now.date(), self.cfg.dte, self.cfg.otm_steps, self.cfg.strike_step),
            now,
        )
        qty = self.cfg.contracts
        if self.cfg.max_premium > 0:
            ask = self.broker.ask(c, spot, now)
            if ask > 0:
                qty = min(qty, math.floor(self.cfg.max_premium / (ask * 100)))
        if qty <= 0:
            return
        try:
            f = self.broker.buy(c, qty, spot, now)
        except Exception as e:  # broker rejected: log and keep watching
            self.on_event(self, f"buy {c} failed: {e}")
            return
        if f.price <= 0:
            return
        self.pos = Position(c, f.qty, f.price, now, sig.triggers, spot, f.fees, f.price)
        self.trades_today += 1
        self.status = IN_CALL if sig.direction == CALL else IN_PUT
        self.on_event(self, f"BUY {f.qty}x {c} @ {f.price:.2f} ({'+'.join(sig.triggers)})")

    # ----------------------------------------------------------------- exits
    def _manage(self, sig: Signal | None, spot: float, now: datetime) -> bool:
        """Check exits. Returns True when the signal was consumed by a flip exit that must not reverse."""
        p = self.pos
        p.mark = self.broker.mark(p.contract, spot, now)
        chg = (p.mark / p.entry - 1) * 100 if p.entry else 0.0
        reason = None
        if now.time() >= self.flatten_at:
            reason = "eod"
        elif chg >= self.cfg.take_profit_pct:
            reason = "target"
        elif chg <= -self.cfg.stop_loss_pct:
            reason = "stop"
        elif sig and sig.direction != p.contract.right and self.cfg.exit_on_opposite:
            reason = "flip"
        elif (now - p.opened).total_seconds() >= self.cfg.max_hold_min * 60:
            reason = "time"
        if not reason:
            return False
        self.close(reason, spot, now)
        if reason in ("target", "stop"):
            self.cooldown_until = now + timedelta(minutes=self.cfg.cooldown_min)
        return reason == "flip" and not self.cfg.reverse_on_opposite

    def close(self, reason: str, spot: float | None = None, now: datetime | None = None) -> None:
        p = self.pos
        if not p:
            return
        spot = spot if spot is not None else self.last_spot
        now = now or self.last_ts
        try:
            f = self.broker.sell(p.contract, p.qty, spot, now)
        except Exception as e:
            self.on_event(self, f"sell {p.contract} failed: {e} (will retry next bar)")
            return
        pnl = (f.price - p.entry) * 100 * p.qty - f.fees - p.fees_in
        self.day_pnl += pnl
        t = Trade(self.cfg.symbol, p.contract.occ, p.contract.right, p.qty, p.entry, f.price,
                  f"{p.opened:%H:%M}", f"{now:%H:%M}", p.triggers, reason, round(pnl, 2))
        dl = self.days[str(self.day)]
        dl.trades.append(asdict(t))
        dl.pnl = round(self.day_pnl, 2)
        self.pos = None
        self.status = WATCHING
        self.on_event(self, f"SELL {p.qty}x {p.contract} @ {f.price:.2f} [{reason}] {pnl:+.0f}")

        if self.cfg.daily_profit_target > 0 and self.day_pnl >= self.cfg.daily_profit_target:
            self.status = TARGET_HIT
            self.on_event(self, f"daily target hit ({self.day_pnl:+.0f}), done for the day")
        elif self.cfg.daily_max_loss > 0 and self.day_pnl <= -self.cfg.daily_max_loss:
            self.status = HALTED
            self.on_event(self, f"daily max loss hit ({self.day_pnl:+.0f}), halted for the day")

    def clock_out(self, why: str) -> None:
        """Called by the city when the whole city hit its target or loss limit."""
        if self.pos:
            self.close(why)
        if self.status == WATCHING:
            self.status = CLOSED

    # ----------------------------------------------------------------- dashboard
    def snapshot(self) -> dict:
        p = self.pos
        unreal = (p.mark - p.entry) * 100 * p.qty if p else 0.0
        return {
            "name": self.cfg.name,
            "symbol": self.cfg.symbol,
            "district": self.cfg.district,
            "triggers": self.cfg.triggers,
            "status": self.status,
            "pnl_today": round(self.day_pnl, 2),
            "unrealized": round(unreal, 2),
            "target": self.cfg.daily_profit_target,
            "spot": round(self.last_spot, 2),
            "position": None if not p else {
                "contract": str(p.contract), "occ": p.contract.occ, "right": p.contract.right, "qty": p.qty,
                "entry": p.entry, "mark": round(p.mark, 2), "opened": f"{p.opened:%H:%M}", "triggers": p.triggers,
            },
        }


def _r(x: float | None) -> float | None:
    return None if x is None else round(x, 2)
