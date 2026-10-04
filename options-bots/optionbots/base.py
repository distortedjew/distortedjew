"""The shared bot engine: schedule, sizing, risk checks, option selection and exits.

Each bot in optionbots/bots/ supplies a signal() and a propose(); everything else
(when to look, how much to trade, how to fill, when to get out) lives here.
"""
from __future__ import annotations

import logging
import math
import time
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from . import blackscholes as bs
from .broker import Broker
from .config import Settings
from .earnings import next_earnings
from .execution import net_prices, reversed_legs, work_order
from .models import Bar, Leg, OptionQuote, Proposal, parse_occ
from .notify import Notifier
from .store import Store

ET = ZoneInfo("America/New_York")
log = logging.getLogger(__name__)


class BaseBot:
    # identity (shown on the dashboard)
    name = "base"
    underlying = "SPY"
    title = ""
    tagline = ""
    strategy = ""
    color = "#2a78d6"

    # exits, as a fraction of the entry price (credit received or debit paid)
    take_profit = 0.5          # close at +50% of max credit / +50% of debit
    stop_loss = 1.0            # close when the loss reaches 100% of credit / debit
    exit_dte = 21              # close when this many days are left (0 = hold to expiry)
    max_open = 2               # simultaneous positions
    min_days_between = 5       # calendar days between new entries
    earnings_blackout = False  # skip entries whose expiry spans earnings

    # entry window, US/Eastern
    entry_start = (10, 0)
    entry_end = (15, 30)
    entry_check_min = 30

    def __init__(self, broker: Broker, store: Store, settings: Settings, sleep=time.sleep,
                 notifier: Notifier | None = None):
        self.broker, self.store, self.settings, self.sleep = broker, store, settings, sleep
        self.notifier = notifier or Notifier()   # disabled unless run_bot passes a configured one
        self.last_price: float | None = None
        self.signal_state: dict = {}
        self.last_manage = 0.0
        self.last_equity_rec = 0.0

    # ---------------------------------------------------------------- hooks
    def signal(self, bars: list[Bar], price: float) -> tuple[str | None, dict]:
        """Return (direction or None, indicator state for the dashboard)."""
        raise NotImplementedError

    def propose(self, direction: str, price: float, bars: list[Bar]) -> Proposal | None:
        raise NotImplementedError

    def extra_exit(self, pos: dict, bars: list[Bar], price: float) -> str | None:
        """Strategy-specific exit (e.g. trend flipped). Return a reason to close."""
        return None

    # ---------------------------------------------------------------- clock
    def now(self) -> datetime:
        """Wall-clock time in New York, or the simulated time when the broker is a backtest."""
        clock = getattr(self.broker, "now", None)
        return clock() if clock else datetime.now(ET)

    # ---------------------------------------------------------------- logging
    def event(self, msg: str, level: str = "info", alert: str | None = None, dedupe_key: str | None = None) -> None:
        """Log + store an event; with `alert` (open/win/loss/warn/error/info) also send it to your phone."""
        log.log(logging.WARNING if level in ("warn", "error") else logging.INFO, "[%s] %s", self.name, msg)
        self.store.event(self.name, msg, level)
        if alert:
            self.notifier.alert(self.title, alert, msg, dedupe_key)

    # ---------------------------------------------------------------- main loop
    def run_forever(self) -> None:
        self.event(f"{self.title} online - trading {self.underlying} options ({self.strategy})", alert="info",
                   dedupe_key=f"{self.name}:online")
        if self.earnings_blackout and not self.settings.alphavantage_key:
            self.event("earnings check is OFF (no ALPHAVANTAGE_API_KEY) - trades may be held through earnings",
                       "warn", alert="warn", dedupe_key=f"{self.name}:no-earnings-key")
        while True:
            try:
                wait = self.cycle()
            except Exception as e:  # keep running; systemd restarts us on a hard crash anyway
                log.exception("cycle failed")
                self.event(f"error: {e}", "error", alert="error")
                wait = 60
            self.sleep(wait)

    def cycle(self, now: datetime | None = None) -> int:
        """One pass. Returns seconds to sleep before the next pass."""
        now = now or self.now()
        clock = self.broker.clock()
        open_positions = self.store.positions(self.name)
        if not clock.get("is_open"):
            self.heartbeat("market closed", {"next_open": clock.get("next_open")})
            return 120

        if time.time() - self.last_equity_rec >= 300:
            self.store.record_equity(self.broker.account()["equity"])
            self.last_equity_rec = time.time()

        if time.time() - self.last_manage >= self.settings.manage_every_sec or not self.last_manage:
            self.manage()
            self.last_manage = time.time()

        if self._in_entry_window(now):
            last_check = self.store.get(self.name, "last_entry_check", 0)
            if time.time() - last_check >= self.entry_check_min * 60:
                self.store.put(self.name, "last_entry_check", time.time())
                self.maybe_enter(now)

        self.heartbeat("paused" if self.paused() else "trading", {"open": len(open_positions)})
        return 30

    def heartbeat(self, status: str, extra: dict | None = None) -> None:
        detail = {"signal": self.signal_state, "price": self.last_price, **(extra or {})}
        self.store.heartbeat(self.name, status, detail)

    def _in_entry_window(self, now: datetime) -> bool:
        t = (now.hour, now.minute)
        return self.entry_start <= t <= self.entry_end

    def paused(self) -> bool:
        d = self.settings.data_dir
        return (d / "PAUSE").exists() or (d / f"PAUSE_{self.name}").exists()

    # ---------------------------------------------------------------- data
    def completed_bars(self, today: date) -> list[Bar]:
        """Daily bars that are finished (no look-ahead into today's candle)."""
        return [b for b in self.broker.daily_bars(self.underlying) if b.day < today]

    # ---------------------------------------------------------------- entries
    def maybe_enter(self, now: datetime) -> None:
        today = now.date()
        bars = self.completed_bars(today)
        price = self.last_price = self.broker.last_price(self.underlying)
        direction, state = self.signal(bars, price)
        self.signal_state = {**state, "direction": direction, "checked_at": now.isoformat(timespec="minutes")}
        if not direction:
            return
        block = self.entry_blocker(today, direction)
        if block:
            self.signal_state["blocked"] = block
            kill = block.startswith("daily loss")
            self.event(f"{direction} signal, not entering: {block}", "warn" if kill else "info",
                       alert="warn" if kill else None, dedupe_key=f"kill:{today}" if kill else None)
            return
        prop = self.propose(direction, price, bars)
        if not prop:
            self.event(f"{direction} signal, but no liquid contracts fit the rules", "warn")
            return
        if self.earnings_blackout:
            exp = min(parse_occ(l.symbol)[1] for l in prop.legs)
            er = next_earnings(self.underlying, self.settings.alphavantage_key, self.store, self.name)
            if er and today <= er <= exp:
                self.event(f"skipping: earnings on {er} fall before expiry {exp}")
                return
        qty = self.size(prop)
        if qty < 1:
            return
        self.open_trade(prop, qty)

    def entry_blocker(self, today: date, direction: str) -> str | None:
        if self.paused():
            return "paused (PAUSE file present)"
        acct = self.broker.account()
        if acct["last_equity"] and acct["equity"] < acct["last_equity"] * (1 - self.settings.daily_max_loss_pct):
            return f"daily loss limit hit (equity {acct['equity']:.0f} vs {acct['last_equity']:.0f})"
        open_pos = self.store.positions(self.name)
        if len(open_pos) >= self.max_open:
            return f"already {len(open_pos)} open (max {self.max_open})"
        last = self.store.last_open_time(self.name)
        if last:
            days = (today - datetime.fromisoformat(last).astimezone(ET).date()).days
            if days < self.min_days_between:
                return f"last entry {days}d ago (min {self.min_days_between}d)"
        return None

    def size(self, prop: Proposal) -> int:
        acct = self.broker.account()
        equity = acct["equity"]
        budget = equity * self.settings.allocation_for(self.name)
        at_risk = sum(p["max_loss"] * p["qty"] for p in self.store.positions(self.name))
        room = budget - at_risk
        if prop.kind not in ("csp", "covered_call"):   # spreads: also cap the risk of a single trade
            room = min(room, equity * self.settings.risk_per_trade_pct)
        qty = math.floor(room / prop.max_loss_per_unit) if prop.max_loss_per_unit > 0 else 0
        qty = min(qty, self.settings.max_contracts)
        if qty < 1:
            self.event(f"signal skipped: one unit risks ${prop.max_loss_per_unit:,.0f}, budget room is ${room:,.0f}", "warn")
        return qty

    def open_trade(self, prop: Proposal, qty: int) -> None:
        res = work_order(self.broker, self.name, prop.legs, qty, closing=False,
                         wait_sec=self.settings.exec_wait_sec, sleep=self.sleep)
        if res.filled_qty < 1:
            self.event(f"entry not filled ({res.status}{': ' + res.message if res.message else ''})", "warn")
            return
        pid = self.store.open_position(
            self.name, self.underlying, prop.kind, prop.direction, [l.to_dict() for l in prop.legs],
            res.filled_qty, res.price, prop.max_loss_per_unit, {**prop.meta, "reason": prop.reason})
        what = "credit" if res.price < 0 else "debit"
        self.event(f"OPEN #{pid} {prop.kind} x{res.filled_qty} @ {what} {abs(res.price):.2f} - {prop.reason}",
                   alert="open")
        self.verify_legs(prop.legs, opening=True, ref=f"#{pid}")

    # ---------------------------------------------------------------- exits
    def position_value(self, pos: dict, quotes: dict[str, tuple[float, float]]) -> float | None:
        legs = [Leg(l["symbol"], l["side"], l["ratio"]) for l in pos["legs"]]
        if any(quotes.get(l.symbol, (0, 0))[1] <= 0 for l in legs):
            return None
        return net_prices(legs, quotes)[0]

    def manage(self) -> None:
        positions = self.store.positions(self.name)
        if not positions:
            return
        held = {p["symbol"]: p for p in self.broker.positions()}
        today = self.now().date()
        bars = self.completed_bars(today)
        price = self.last_price = self.broker.last_price(self.underlying)
        for pos in positions:
            symbols = [l["symbol"] for l in pos["legs"]]
            if not any(s in held for s in symbols):
                self.reconcile_missing(pos, today, price)
                continue
            quotes = self.broker.option_quotes(symbols)
            value = self.position_value(pos, quotes)
            if value is None:
                continue
            pnl = (value - pos["entry_price"]) * 100 * pos["qty"]
            self.store.mark(pos["id"], value, pnl)
            reason = self.exit_reason(pos, value, today, bars, price)
            if reason:
                self.close_trade(pos, reason)

    def exit_reason(self, pos: dict, value: float, today: date, bars: list[Bar], price: float) -> str | None:
        base = abs(pos["entry_price"])
        change = (value - pos["entry_price"]) / base if base else 0
        dte = min((date.fromisoformat(l["expiration"]) - today).days for l in pos["legs"])
        if change >= self.take_profit:
            return f"take profit ({change:+.0%})"
        if self.stop_loss and change <= -self.stop_loss:
            return f"stop loss ({change:+.0%})"
        if self.exit_dte and dte <= self.exit_dte:
            return f"time exit ({dte} DTE)"
        if self.earnings_blackout and pos["kind"] in ("debit_spread",):
            er = next_earnings(self.underlying, self.settings.alphavantage_key, self.store, self.name)
            if er and 0 <= (er - today).days <= 1:
                return f"earnings on {er}"
        return self.extra_exit(pos, bars, price)

    def close_trade(self, pos: dict, reason: str) -> None:
        legs = reversed_legs([Leg(l["symbol"], l["side"], l["ratio"]) for l in pos["legs"]])
        stop = reason.startswith(("stop", "time", "earnings", "trend"))
        steps = (0.0, 0.33, 0.66, 1.0) if stop else (0.0, 0.25, 0.5)
        res = work_order(self.broker, self.name, legs, pos["qty"], closing=True,
                         wait_sec=self.settings.exec_wait_sec, steps=steps, sleep=self.sleep)
        if res.filled_qty < 1:
            self.event(f"exit #{pos['id']} ({reason}) not filled: {res.status} - will retry", "warn",
                       alert="warn", dedupe_key=f"{self.name}:exitfail:{pos['id']}")
            return
        self.verify_legs(legs, opening=False, ref=f"#{pos['id']} exit")
        exit_value = -res.price          # closing order net price -> value of the position
        pnl = (exit_value - pos["entry_price"]) * 100 * res.filled_qty
        self.store.close_position(pos["id"], exit_value, pnl, reason, qty_left=pos["qty"] - res.filled_qty)
        self.event(f"CLOSE #{pos['id']} x{res.filled_qty} - {reason} - P&L ${pnl:+,.0f}",
                   "info" if pnl >= 0 else "warn", alert="win" if pnl >= 0 else "loss")

    def verify_legs(self, legs: list[Leg], opening: bool, ref: str) -> bool:
        """After a fill, check at the broker that every leg went the intended way.

        Opening: a leg we sold must now be held short, a leg we bought held long. Closing (legs are the
        closing order): no leg may now be held on the side we just traded into, which would mean the
        order opened new exposure instead of closing. On a mismatch the bot pauses itself and alerts.
        """
        bad: list[str] = []
        for attempt in range(3):                 # positions can lag the fill by a moment
            held = {p["symbol"]: p["qty"] for p in self.broker.positions()}
            bad = []
            for l in legs:
                qty = held.get(l.symbol, 0)
                if opening:
                    if qty == 0 or (qty < 0) != (l.side == "sell"):
                        bad.append(f"{l.symbol} expected {'short' if l.side == 'sell' else 'long'}, broker shows {qty:+g}")
                elif qty != 0 and (qty > 0) == (l.side == "buy"):
                    bad.append(f"{l.symbol} should have been closed, broker shows {qty:+g}")
            if not bad:
                return True
            self.sleep(2)
        try:
            (self.settings.data_dir / f"PAUSE_{self.name}").touch()
            paused = "bot PAUSED"
        except OSError:
            paused = "could not create the PAUSE file - stop the bot by hand"
        self.event(f"ORDER DIRECTION CHECK FAILED {ref}: {'; '.join(bad)} - {paused}. Check the account at Alpaca now.",
                   "error", alert="error")
        return False

    def reconcile_missing(self, pos: dict, today: date, price: float) -> None:
        """The broker no longer holds any leg: expired, assigned, or closed by hand."""
        exp = min(date.fromisoformat(l["expiration"]) for l in pos["legs"])
        if exp <= today:
            if pos["kind"] in ("csp", "covered_call"):
                value = 0.0   # premium kept; any assignment shows up in the stock position instead
            else:
                value = sum((1 if l["side"] == "buy" else -1) * l["ratio"] *
                            (max(0.0, price - l["strike"]) if l["kind"] == "call" else max(0.0, l["strike"] - price))
                            for l in pos["legs"])
            pnl = (value - pos["entry_price"]) * 100 * pos["qty"]
            self.store.close_position(pos["id"], value, pnl, "expired / assigned")
            self.event(f"#{pos['id']} expired/assigned - P&L ${pnl:+,.0f}", alert="win" if pnl >= 0 else "loss")
        else:
            self.store.close_position(pos["id"], None, None, "closed outside the bot")
            self.event(f"#{pos['id']} legs are gone at the broker - marked closed (P&L unknown)", "warn", alert="warn")

    # ---------------------------------------------------------------- option selection
    def chain(self, kind: str, min_dte: int, max_dte: int) -> list[OptionQuote]:
        today = self.now().date()
        return self.broker.option_chain(self.underlying, kind, today + timedelta(days=min_dte),
                                        today + timedelta(days=max_dte))

    @staticmethod
    def liquid(q: OptionQuote) -> bool:
        return q.bid > 0 and q.ask > 0 and (q.ask - q.bid) <= max(0.05, 0.20 * q.mid)

    def with_deltas(self, quotes: list[OptionQuote], price: float) -> list[OptionQuote]:
        today = self.now().date()
        for q in quotes:
            if q.delta is None:
                t = max((q.expiration - today).days, 1) / 365
                iv = q.iv or bs.implied_vol(q.kind, q.mid, price, q.strike, t)
                q.delta = bs.delta(q.kind, price, q.strike, t, iv) if iv else None
        return [q for q in quotes if q.delta is not None]

    def pick_expiration(self, quotes: list[OptionQuote], target_dte: int) -> list[OptionQuote]:
        if not quotes:
            return []
        today = self.now().date()
        exps = sorted({q.expiration for q in quotes}, key=lambda e: abs((e - today).days - target_dte))
        return [q for q in quotes if q.expiration == exps[0]]

    @staticmethod
    def nearest_delta(quotes: list[OptionQuote], target: float) -> OptionQuote | None:
        cands = [q for q in quotes if q.delta is not None]
        return min(cands, key=lambda q: abs(abs(q.delta) - target)) if cands else None

    @staticmethod
    def wing(quotes: list[OptionQuote], short: OptionQuote, width: float) -> OptionQuote | None:
        """The protective long leg about `width` further out of the money."""
        target = short.strike - width if short.kind == "put" else short.strike + width
        cands = [q for q in quotes if q.kind == short.kind and q.strike != short.strike and
                 (q.strike < short.strike if short.kind == "put" else q.strike > short.strike)]
        return min(cands, key=lambda q: abs(q.strike - target)) if cands else None

    def select(self, kind: str, min_dte: int, max_dte: int, target_dte: int, price: float) -> list[OptionQuote]:
        """Liquid contracts with deltas, for the expiry closest to target_dte."""
        quotes = [q for q in self.chain(kind, min_dte, max_dte) if self.liquid(q)]
        return self.with_deltas(self.pick_expiration(quotes, target_dte), price)

    # ---------------------------------------------------------------- proposal builders
    def credit_spread(self, kind: str, price: float, short_delta: float, width: float,
                      dte: tuple[int, int, int], direction: str, reason: str) -> Proposal | None:
        quotes = self.select(kind, dte[0], dte[1], dte[2], price)
        short = self.nearest_delta(quotes, short_delta)
        long = short and self.wing(quotes, short, width)
        if not short or not long:
            return None
        credit = short.mid - long.mid
        w = abs(short.strike - long.strike)
        if credit <= 0.05 or credit >= w:
            return None
        return Proposal("credit_spread", direction, [Leg(short.symbol, "sell"), Leg(long.symbol, "buy")],
                        {short.symbol: short, long.symbol: long}, (w - credit) * 100,
                        f"{reason}; sell {short.strike:g}/{long.strike:g} {kind} exp {short.expiration} "
                        f"(short delta {abs(short.delta):.2f}, ~{credit:.2f} credit)",
                        {"short_delta": round(abs(short.delta), 3), "width": w})

    def debit_spread(self, kind: str, price: float, long_delta: float, short_delta: float,
                     dte: tuple[int, int, int], direction: str, reason: str) -> Proposal | None:
        quotes = self.select(kind, dte[0], dte[1], dte[2], price)
        long = self.nearest_delta(quotes, long_delta)
        short = self.nearest_delta(quotes, short_delta)
        if not long or not short or long.strike == short.strike:
            return None
        if (kind == "call" and short.strike < long.strike) or (kind == "put" and short.strike > long.strike):
            return None
        debit = long.mid - short.mid
        w = abs(short.strike - long.strike)
        if debit <= 0.05 or debit >= w * 0.75:     # paying >75% of the width leaves too little upside
            return None
        return Proposal("debit_spread", direction, [Leg(long.symbol, "buy"), Leg(short.symbol, "sell")],
                        {long.symbol: long, short.symbol: short}, debit * 100,
                        f"{reason}; buy {long.strike:g}/{short.strike:g} {kind} exp {long.expiration} "
                        f"(~{debit:.2f} debit, max value {w:g})",
                        {"width": w})
