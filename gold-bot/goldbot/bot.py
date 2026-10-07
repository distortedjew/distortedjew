"""The always-on loop: wakes a few seconds after every 15-minute candle closes, manages the
open trade, and looks for a new entry. Stops/targets live on the broker's server, so an
outage of this process never leaves a trade unprotected.
"""
from __future__ import annotations

import json
import logging
import signal
import threading
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .brokers import Broker, make_broker
from .config import Config
from .notify import Notifier
from .risk import position_units
from .strategy import BAR, add_indicators, checklist, manage, signal_at

log = logging.getLogger("goldbot")


@dataclass
class State:
    day: str = ""
    day_start_equity: float = 0.0
    start_equity: float = 0.0       # equity when the bot first ran
    trades_today: int = 0
    halted_day: str = ""          # UTC day on which the daily-loss stop fired
    last_bar: str = ""            # open time of the last candle processed
    trade_id: str = ""
    trade_entry_bar: str = ""
    trade_initial_risk: float = 0.0
    last_exit_bar: str = ""

    @classmethod
    def load(cls, path: str) -> "State":
        p = Path(path)
        if p.exists():
            try:
                return cls(**json.loads(p.read_text()))
            except (ValueError, TypeError):
                log.warning("state file unreadable, starting fresh")
        return cls()

    def save(self, path: str) -> None:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(".tmp")
        tmp.write_text(json.dumps(asdict(self), indent=2))
        tmp.replace(p)


def bars_between(a: str, b: datetime) -> int:
    if not a:
        return 10**6
    return int((b - datetime.fromisoformat(a)) / BAR)


class GoldBot:
    def __init__(self, cfg: Config, broker: Broker | None = None, notifier: Notifier | None = None):
        cfg.validate()
        self.cfg = cfg
        self.broker = broker or make_broker(cfg)
        self.notify = notifier or Notifier(cfg.telegram_token, cfg.telegram_chat_id)
        self.state = State.load(cfg.state_file)
        self.running = True
        self.journal = Path(cfg.log_dir) / "trades.jsonl"
        self.journal.parent.mkdir(parents=True, exist_ok=True)
        self.equity_log = Path(cfg.log_dir) / "equity.jsonl"
        self.lock = threading.Lock()
        self.snapshot: dict = {"status": "starting", "broker": self.broker.name,
                               "mode": "live" if cfg.live_trading else "demo"}

    def record(self, event: str, **data) -> None:
        row = {"ts": datetime.now(timezone.utc).isoformat(), "event": event, **data}
        with self.journal.open("a") as f:
            f.write(json.dumps(row) + "\n")

    # ---- one bar -------------------------------------------------------------------
    def on_bar(self, now: datetime | None = None) -> None:
        now = now or datetime.now(timezone.utc)
        cfg, p, st, b = self.cfg, self.cfg.strategy, self.state, self.broker

        df = b.candles(cfg.candles)
        if df.empty:
            log.info("no candles (market closed?)")
            return
        last_open = df["time"].iloc[-1].to_pydatetime()
        bar_close = last_open + BAR
        if last_open.isoformat() == st.last_bar:
            return  # already handled this candle
        stale = now - bar_close > timedelta(minutes=30)

        equity = b.equity()
        today = now.strftime("%Y-%m-%d")
        if not st.start_equity:
            st.start_equity = equity
        if st.day != today:
            st.day, st.day_start_equity, st.trades_today = today, equity, 0
            log.info("new UTC day %s, equity %.2f", today, equity)

        pos = b.position()
        if st.trade_id and (pos is None or pos.id != st.trade_id):
            log.info("trade %s closed by broker (stop/target), equity %.2f", st.trade_id, equity)
            self.record("closed", trade_id=st.trade_id, equity=equity)
            self.notify.send(f"XAUUSD trade closed. Equity {equity:,.2f}")
            st.trade_id, st.last_exit_bar = "", last_open.isoformat()

        # daily loss kill switch
        dd = 1 - equity / st.day_start_equity if st.day_start_equity else 0.0
        if dd >= cfg.max_daily_loss and st.halted_day != today:
            st.halted_day = today
            log.warning("daily loss %.2f%% hit the %.2f%% limit: flattening, no more trades today",
                        dd * 100, cfg.max_daily_loss * 100)
            self.notify.send(f"Daily loss limit hit ({dd:.1%}). Flat until tomorrow (UTC).")
            if pos:
                b.close(pos)
                self.record("kill_switch_close", trade_id=pos.id, equity=b.equity())
                st.trade_id, st.last_exit_bar, pos = "", last_open.isoformat(), None

        ind = add_indicators(df, p)
        i = len(ind) - 1
        row = ind.iloc[i]

        if pos:
            if pos.id != st.trade_id:  # adopt a trade opened before a restart
                st.trade_id, st.trade_entry_bar = pos.id, last_open.isoformat()
                st.trade_initial_risk = abs(pos.entry - pos.sl) if pos.sl else row["atr"] * p.sl_atr
            held = bars_between(st.trade_entry_bar, last_open)
            action, new_sl = manage(pos.side, pos.entry, pos.sl or 0.0, st.trade_initial_risk,
                                    row["close"], held, bar_close, p)
            if action == "close":
                log.info("closing %s (time stop / weekend)", pos.side)
                b.close(pos)
                self.record("time_close", trade_id=pos.id, bars=held, equity=b.equity())
                self.notify.send(f"Closed XAUUSD {pos.side} (time/weekend exit)")
                st.trade_id, st.last_exit_bar = "", last_open.isoformat()
            elif action == "move_sl" and new_sl is not None:
                log.info("stop to breakeven: %.2f", new_sl)
                b.set_sl(pos, new_sl)
                self.record("breakeven", trade_id=pos.id, sl=new_sl)
        elif not stale and st.halted_day != today:
            self._maybe_enter(ind, i, last_open, equity)

        st.last_bar = last_open.isoformat()
        st.save(cfg.state_file)
        with self.equity_log.open("a") as f:
            f.write(json.dumps({"t": bar_close.isoformat(), "equity": round(equity, 2)}) + "\n")
        self._update_snapshot(ind, i, bar_close, stale)

    def _update_snapshot(self, ind, i: int, bar_close: datetime, stale: bool) -> None:
        cfg, p, st, b = self.cfg, self.cfg.strategy, self.state, self.broker
        equity, pos = b.equity(), b.position()
        try:
            bid, ask = b.quote()
        except Exception:  # quotes can be unavailable while the market is closed
            bid = ask = float("nan")
        today = st.day
        position = None
        if pos:
            sign = 1 if pos.side == "buy" else -1
            mid = (bid + ask) / 2 if bid == bid else float(ind["close"].iloc[i])
            pnl = sign * (mid - pos.entry) * pos.units
            risk = st.trade_initial_risk or (abs(pos.entry - pos.sl) if pos.sl else 0)
            position = {"side": pos.side, "units": pos.units, "entry": pos.entry, "sl": pos.sl,
                        "tp": pos.tp, "pnl": pnl, "r": sign * (mid - pos.entry) / risk if risk else None}
        tail = ind.tail(80)
        candles = [{"t": r.time.isoformat(), "o": r.open, "h": r.high, "l": r.low, "c": r.close,
                    "e20": r.ema_fast, "e50": r.ema_slow, "e200": r.ema_trend} for r in tail.itertuples()]
        row = ind.iloc[i]
        halted = st.halted_day == today
        status = "halted" if halted else ("market closed" if stale else "running")
        cooldown_left = max(0, cfg.cooldown_bars - bars_between(st.last_exit_bar, row["time"].to_pydatetime()))
        snap = {
            "status": status, "error": None, "broker": b.name,
            "mode": "live" if cfg.live_trading else "demo",
            "updated": datetime.now(timezone.utc).isoformat(), "last_bar_close": bar_close.isoformat(),
            "bid": bid, "ask": ask, "spread": ask - bid,
            "equity": equity, "start_equity": st.start_equity, "day_start_equity": st.day_start_equity,
            "trades_today": st.trades_today, "position": position,
            "candles": candles, "rsi": float(row["rsi"]), "atr": float(row["atr"]),
            "checks": checklist(ind, i, p),
            "limits": {"risk_per_trade": cfg.risk_per_trade, "max_daily_loss": cfg.max_daily_loss,
                       "max_trades_per_day": cfg.max_trades_per_day, "max_spread": cfg.max_spread,
                       "cooldown_left": cooldown_left, "halted": halted,
                       "breakeven_r": p.breakeven_r, "friday_close_utc": p.friday_close_utc,
                       "session": [p.session_start_utc, p.session_end_utc]},
        }
        with self.lock:
            self.snapshot = snap

    def set_error(self, err: Exception) -> None:
        with self.lock:
            self.snapshot = {**self.snapshot, "status": "error", "error": str(err)[:300],
                             "updated": datetime.now(timezone.utc).isoformat()}

    def _maybe_enter(self, ind, i: int, last_open: datetime, equity: float) -> None:
        cfg, st, b = self.cfg, self.state, self.broker
        if st.trades_today >= cfg.max_trades_per_day:
            return
        if bars_between(st.last_exit_bar, last_open) < cfg.cooldown_bars:
            return
        sig = signal_at(ind, i, cfg.strategy)
        if sig is None:
            return
        bid, ask = b.quote()
        spread = ask - bid
        if spread > cfg.max_spread:
            log.info("signal %s skipped: spread %.2f > %.2f", sig.side, spread, cfg.max_spread)
            self.record("skipped", side=sig.side, why=f"spread {spread:.2f} > {cfg.max_spread:.2f}")
            return
        price = ask if sig.side == "buy" else bid
        units = b.normalize_units(position_units(equity, cfg.risk_per_trade, sig.sl_dist, price,
                                                 cfg.max_leverage))
        if units <= 0:
            log.warning("signal %s skipped: account too small for the broker's minimum size "
                        "at %.2f%% risk", sig.side, cfg.risk_per_trade * 100)
            self.record("skipped", side=sig.side, why="size below broker minimum")
            return
        sign = 1 if sig.side == "buy" else -1
        sl, tp = price - sign * sig.sl_dist, price + sign * sig.tp_dist
        pos = b.open(sig.side, units, sl, tp)
        st.trade_id, st.trade_entry_bar = pos.id, last_open.isoformat()
        st.trade_initial_risk = abs(pos.entry - pos.sl) if pos.sl else sig.sl_dist
        st.trades_today += 1
        msg = (f"{sig.side.upper()} {units:g} oz XAUUSD @ {pos.entry:.2f}  SL {sl:.2f}  TP {tp:.2f}  "
               f"({sig.reason}, risk {cfg.risk_per_trade:.1%})")
        log.info(msg)
        self.record("open", trade_id=pos.id, side=sig.side, units=units, entry=pos.entry, sl=sl,
                    tp=tp, atr=sig.atr, equity=equity, reason=sig.reason)
        self.notify.send(msg)

    # ---- forever --------------------------------------------------------------------
    def run(self) -> None:
        signal.signal(signal.SIGTERM, lambda *_: setattr(self, "running", False))
        if self.cfg.dashboard_port:
            from .dashboard import start_dashboard
            start_dashboard(self)
        mode = "LIVE MONEY" if self.cfg.live_trading else "demo/practice"
        log.info("gold bot started: broker=%s mode=%s risk=%.2f%%/trade daily-stop=%.1f%%",
                 self.broker.name, mode, self.cfg.risk_per_trade * 100, self.cfg.max_daily_loss * 100)
        self.notify.send(f"Gold bot started ({self.broker.name}, {mode})")
        errors = 0
        while self.running:
            try:
                self.on_bar()
                errors = 0
            except Exception as e:  # keep running; the broker-side stop protects open trades
                errors += 1
                log.exception("bar failed (%d in a row)", errors)
                self.set_error(e)
                if errors in (1, 5, 20):
                    self.notify.send(f"Gold bot error ({errors}x): {e}")
                time.sleep(min(60 * errors, 300))
                continue
            self._sleep_to_next_bar()
        log.info("stopped")

    def _sleep_to_next_bar(self) -> None:
        now = datetime.now(timezone.utc)
        nxt = now.replace(second=0, microsecond=0, minute=(now.minute // 15) * 15) + BAR
        wake = nxt + timedelta(seconds=10)  # give the broker a moment to finalise the candle
        while self.running and datetime.now(timezone.utc) < wake:
            time.sleep(min(5.0, (wake - datetime.now(timezone.utc)).total_seconds() + 0.01))
