"""Backtest a bot on historical daily prices of its underlying.

The bot's own code runs unchanged: the same signal(), contract selection, sizing,
risk checks and exits as live. What is *modelled* is the option prices: there is
no free history of option quotes, so every option is priced with Black-Scholes
using implied vol = recent realised vol x a volatility premium, plus a put skew,
and a bid/ask spread. Treat results as a sanity check of the rules, not a promise.

Each trading day is replayed in two steps:
  open  (10:00 ET, priced at the day's open):  manage exits, then look for an entry
  close (15:45 ET, priced at the day's close): settle expiries, manage exits, mark equity

    python -m optionbots.backtest atlas --years 3
"""
from __future__ import annotations

import logging
import math
import random
import time
import uuid
from dataclasses import dataclass
from datetime import date, datetime, time as dtime, timedelta
from pathlib import Path

from . import blackscholes as bs
from .base import ET
from .config import Settings, load_settings
from .indicators import realized_vol
from .models import Bar, Leg, OptionQuote, occ_symbol, parse_occ
from .store import Store

# Strategy knobs the backtest page may override (all numeric class attributes).
TUNABLE = ("take_profit", "stop_loss", "exit_dte", "max_open", "min_days_between",
           "short_delta", "long_delta", "put_delta", "call_delta", "width", "require_dip", "allow_bearish")


@dataclass
class Model:
    vol_premium: float = 1.15     # implied vol = realised vol x this (options usually price above realised)
    put_skew: float = 1.2         # extra IV per unit of log-moneyness for OTM puts
    spread_pct: float = 0.03      # bid/ask width as a share of the option price (min $0.02)
    slippage: float = 0.25        # fills happen this far from mid toward the natural price
    fee_per_contract: float = 0.10


class BacktestBroker:
    """Implements the Broker protocol on top of a list of daily bars and a simulated clock."""

    def __init__(self, symbol: str, bars: list[Bar], capital: float, model: Model, assign_shares: bool):
        self.symbol, self.bars, self.model, self.assign_shares = symbol, bars, model, assign_shares
        self.cash = capital
        self.i, self.phase = 0, "open"
        self.pos: dict[str, dict] = {}            # symbol -> {"qty", "avg"}
        self.orders: dict[str, dict] = {}
        self.prev_close_equity = capital
        self.fees = 0.0
        self._cache: dict = {}

    # -- simulated time ---------------------------------------------------------------
    def set(self, i: int, phase: str) -> None:
        self.i, self.phase = i, phase
        self._cache = {}

    def now(self) -> datetime:
        t = dtime(10, 0) if self.phase == "open" else dtime(15, 45)
        return datetime.combine(self.bars[self.i].day, t, ET)

    @property
    def today(self) -> date:
        return self.bars[self.i].day

    def spot(self) -> float:
        b = self.bars[self.i]
        return b.o if self.phase == "open" else b.c

    # -- pricing ----------------------------------------------------------------------
    def base_vol(self) -> float:
        if "vol" not in self._cache:
            closes = [b.c for b in self.bars[max(0, self.i - 21):self.i]]
            rv = realized_vol(closes, 20) if len(closes) >= 21 else None
            self._cache["vol"] = min(2.0, max(0.08, (rv or 0.25) * self.model.vol_premium))
        return self._cache["vol"]

    def iv(self, strike: float) -> float:
        k = math.log(strike / self.spot())
        base = self.base_vol()
        return max(0.05, base * (1 - self.model.put_skew * k) if k < 0 else base * (1 - 0.3 * k))

    def quote(self, symbol: str) -> OptionQuote:
        q = self._cache.get(symbol)
        if q:
            return q
        _, exp, kind, strike = parse_occ(symbol)
        days = (exp - self.today).days + (0.75 if self.phase == "open" else 0.05)
        t = max(days, 0.01) / 365
        s, vol = self.spot(), self.iv(strike)
        fair = bs.price(kind, s, strike, t, vol)
        half = max(0.01, fair * self.model.spread_pct / 2)
        q = OptionQuote(symbol, kind, strike, exp, round(max(0.0, fair - half), 2), round(fair + half, 2),
                        bs.delta(kind, s, strike, t, vol), vol)
        self._cache[symbol] = q
        return q

    def mark(self, symbol: str) -> float:
        if symbol == self.symbol:
            return self.spot()
        return self.quote(symbol).mid

    # -- Broker protocol -----------------------------------------------------------------
    def clock(self) -> dict:
        return {"is_open": True}

    def equity(self) -> float:
        return self.cash + sum(p["qty"] * self.mark(s) * (1 if s == self.symbol else 100) for s, p in self.pos.items())

    def account(self) -> dict:
        eq = self.equity()
        return {"equity": eq, "last_equity": self.prev_close_equity, "buying_power": self.cash,
                "cash": self.cash, "options_buying_power": self.cash}

    def daily_bars(self, symbol: str, days: int = 450) -> list[Bar]:
        return self.bars[:self.i + 1]           # the bot itself drops today's unfinished bar

    def last_price(self, symbol: str) -> float:
        return self.spot()

    def option_chain(self, underlying: str, kind: str, exp_from: date, exp_to: date) -> list[OptionQuote]:
        s = self.spot()
        step = 1.0 if s < 1000 else 5.0
        out, d = [], exp_from
        while d <= exp_to:
            if d.weekday() == 4:                # weekly Friday expirations
                k = math.ceil(s * 0.75 / step) * step
                while k <= s * 1.25:
                    out.append(self.quote(occ_symbol(underlying, d, kind, k)))
                    k += step
            d += timedelta(days=1)
        return out

    def option_quotes(self, symbols: list[str]) -> dict[str, tuple[float, float]]:
        return {s: (self.quote(s).bid, self.quote(s).ask) for s in symbols}

    def positions(self) -> list[dict]:
        out = []
        for sym, p in self.pos.items():
            stock = sym == self.symbol
            px, mult = self.mark(sym), (1 if stock else 100)
            out.append({"symbol": sym, "qty": p["qty"], "asset_class": "us_equity" if stock else "us_option",
                        "avg_entry_price": p["avg"], "current_price": px,
                        "unrealized_pl": (px - p["avg"]) * p["qty"] * mult})
        return out

    def submit(self, legs: list[Leg], qty: int, limit_price: float, client_order_id: str, closing: bool) -> str:
        quotes = {l.symbol: self.quote(l.symbol) for l in legs}
        mid = sum((1 if l.side == "buy" else -1) * l.ratio * quotes[l.symbol].mid for l in legs)
        natural = sum(l.ratio * (quotes[l.symbol].ask if l.side == "buy" else -quotes[l.symbol].bid) for l in legs)
        cost = mid + self.model.slippage * (natural - mid)
        oid = uuid.uuid4().hex
        if limit_price < cost - 1e-9:
            self.orders[oid] = {"status": "new", "filled_qty": 0, "filled_avg_price": None}
            return oid
        for l in legs:
            n = qty * l.ratio * (1 if l.side == "buy" else -1)
            self._add(l.symbol, n, quotes[l.symbol].mid)
        fee = self.model.fee_per_contract * qty * sum(l.ratio for l in legs)
        self.cash -= limit_price * 100 * qty + fee
        self.fees += fee
        self.orders[oid] = {"status": "filled", "filled_qty": qty, "filled_avg_price": abs(limit_price)}
        return oid

    def order(self, order_id: str) -> dict:
        return dict(self.orders[order_id])

    def cancel(self, order_id: str) -> None:
        if self.orders[order_id]["status"] == "new":
            self.orders[order_id]["status"] = "canceled"

    def _add(self, symbol: str, n: float, price: float) -> None:
        p = self.pos.setdefault(symbol, {"qty": 0, "avg": price})
        if p["qty"] == 0 or (p["qty"] > 0) == (n > 0):
            p["avg"] = (p["avg"] * abs(p["qty"]) + price * abs(n)) / (abs(p["qty"]) + abs(n))
        p["qty"] += n
        if abs(p["qty"]) < 1e-9:
            del self.pos[symbol]

    def settle_expired(self) -> None:
        """At the close: expiring options pay intrinsic value; short puts/calls can be assigned (the wheel)."""
        s = self.spot()
        for sym in [x for x in self.pos if x != self.symbol]:
            _, exp, kind, strike = parse_occ(sym)
            if exp > self.today:
                continue
            q = self.pos.pop(sym)["qty"]
            intrinsic = max(0.0, s - strike) if kind == "call" else max(0.0, strike - s)
            if intrinsic <= 0:
                continue
            if self.assign_shares and q < 0 and kind == "put":          # assigned: buy the shares at the strike
                self.cash -= strike * 100 * -q
                self._add(self.symbol, 100 * -q, strike)
            elif self.assign_shares and q < 0 and kind == "call" and self.pos.get(self.symbol, {}).get("qty", 0) >= 100 * -q:
                self.cash += strike * 100 * -q                              # called away at the strike
                self._add(self.symbol, -100 * -q, strike)
            else:
                self.cash += q * intrinsic * 100                            # cash-settle the intrinsic value


# ---------------------------------------------------------------------------------------- data
_BAR_CACHE: dict[tuple, tuple[float, list[Bar]]] = {}


def synthetic_bars(symbol: str, start: date, end: date, seed: int = 11) -> list[Bar]:
    """Random-walk prices for trying the backtester without API keys. Not real data."""
    from .simbroker import PROFILE
    p0, mu, vol = PROFILE.get(symbol, (100.0, 0.07, 0.25))
    rng = random.Random(f"{symbol}-{seed}")
    bars, p, d = [], p0 * 0.6, start
    while d <= end:
        if d.weekday() < 5:
            r = rng.gauss((mu - vol * vol / 2) / 252, vol / math.sqrt(252))
            o = p * math.exp(rng.gauss(0, vol / math.sqrt(252) / 3))
            c = p * math.exp(r)
            bars.append(Bar(d, o, max(o, c) * (1 + abs(rng.gauss(0, vol / 40))), min(o, c) * (1 - abs(rng.gauss(0, vol / 40))),
                            c, rng.uniform(0.6, 1.6) * 1e7))
            p = c
        d += timedelta(days=1)
    return bars


def load_bars(symbol: str, start: date, end: date, settings: Settings) -> tuple[list[Bar], str]:
    """Real daily bars from Alpaca when keys are configured, otherwise synthetic ones."""
    if settings.broker != "alpaca" or not settings.key_id:
        return synthetic_bars(symbol, start, end), "synthetic (no Alpaca keys - random prices, not real history)"
    key = (symbol, start, end)
    hit = _BAR_CACHE.get(key)
    if hit and time.time() - hit[0] < 6 * 3600:
        return hit[1], "Alpaca daily bars (split-adjusted)"
    from .broker import AlpacaBroker
    alp = AlpacaBroker(settings.key_id, settings.secret_key, live=settings.live)
    last_err = None
    for feed in ("sip", "iex"):     # sip has the longest history; fall back to iex if the plan refuses it
        try:
            bars = [b for b in alp.daily_bars(symbol, start=start, feed=feed) if b.day <= end]
            if len(bars) > 250:
                _BAR_CACHE[key] = (time.time(), bars)
                return bars, f"Alpaca daily bars ({feed.upper()} feed, split-adjusted)"
        except RuntimeError as e:
            last_err = e
    raise RuntimeError(f"could not load {symbol} history from Alpaca: {last_err or 'not enough bars'}")


# ---------------------------------------------------------------------------------------- engine
def run_backtest(bot_name: str, start: date, end: date, capital: float = 100_000.0,
                 overrides: dict | None = None, model: Model | None = None,
                 risk_per_trade_pct: float | None = None, allocation_pct: float | None = None,
                 bars: list[Bar] | None = None, data_source: str = "", progress=None) -> dict:
    from .bots import BOTS
    cls = BOTS[bot_name]
    base = load_settings()
    logging.getLogger("optionbots.base").setLevel(logging.ERROR)   # the trade log is returned in "events" instead
    model = model or Model()
    if bars is None:
        bars, data_source = load_bars(cls.underlying, start - timedelta(days=420), end, base)
    first = next((i for i, b in enumerate(bars) if b.day >= start), None)
    if first is None or first < 210:
        raise ValueError("not enough history before the start date (need ~10 months for the 200-day average)")

    broker = BacktestBroker(cls.underlying, bars, capital, model, assign_shares=(bot_name == "orchard"))
    settings = Settings(
        broker="backtest", key_id="", secret_key="", live=False, data_dir=Path("/nonexistent/backtest"),  # no PAUSE files
        bot_allocation_pct=allocation_pct if allocation_pct is not None else base.allocation_for(bot_name),
        risk_per_trade_pct=risk_per_trade_pct if risk_per_trade_pct is not None else base.risk_per_trade_pct,
        max_contracts=base.max_contracts, daily_max_loss_pct=base.daily_max_loss_pct,
        exec_wait_sec=0, manage_every_sec=0, alphavantage_key="")
    store = Store(":memory:", clock=broker.now)
    bot = cls(broker, store, settings, sleep=lambda s: None)
    applied = {}
    for k, v in (overrides or {}).items():
        if k in TUNABLE and hasattr(bot, k) and v not in (None, ""):
            cur = getattr(bot, k)
            setattr(bot, k, type(cur)(float(v)) if isinstance(cur, (int, float)) else cur)
            applied[k] = getattr(bot, k)

    days = [i for i, b in enumerate(bars) if start <= b.day <= end]
    curve, bh, exposure_days = [], [], 0
    first_close = bars[days[0]].c
    for n, i in enumerate(days):
        broker.set(i, "open")
        bot.manage()
        bot.maybe_enter(broker.now())
        broker.set(i, "close")
        broker.settle_expired()
        bot.manage()
        eq = broker.equity()
        broker.prev_close_equity = eq
        if any(s != cls.underlying for s in broker.pos) or broker.pos.get(cls.underlying):
            exposure_days += 1
        curve.append({"t": bars[i].day.isoformat(), "v": round(eq, 2)})
        bh.append({"t": bars[i].day.isoformat(), "v": round(capital * bars[i].c / first_close, 2)})
        if progress and n % 20 == 0:
            progress(n / len(days))

    trades = sorted(store.positions(bot_name, "closed", limit=100_000), key=lambda p: p["opened_at"])
    still_open = store.positions(bot_name, "open")
    events: list[dict] = []
    for r in store.db.execute("SELECT ts, level, message FROM events ORDER BY id").fetchall():
        if events and events[-1]["message"] == r["message"]:   # collapse repeats ("no contracts fit" every day)
            events[-1]["repeat"] = events[-1].get("repeat", 1) + 1
        else:
            events.append(dict(r))
    return {
        "bot": bot_name, "underlying": cls.underlying, "start": bars[days[0]].day.isoformat(),
        "end": bars[days[-1]].day.isoformat(), "capital": capital, "data_source": data_source,
        "params": {k: getattr(bot, k) for k in TUNABLE if hasattr(bot, k)}, "overrides": applied,
        "model": model.__dict__, "curve": curve, "buy_hold": bh,
        "stats": stats(curve, bh, trades, exposure_days, broker.fees),
        "trades": [{k: t[k] for k in ("id", "kind", "direction", "legs", "qty", "entry_price", "exit_price",
                                      "pnl", "exit_reason", "opened_at", "closed_at")} for t in trades],
        "open_at_end": len(still_open),
        "events": events[-300:],
    }


def max_drawdown(values: list[float]) -> float:
    peak, dd = values[0] if values else 0, 0.0
    for v in values:
        peak = max(peak, v)
        dd = min(dd, v / peak - 1 if peak else 0)
    return dd


def stats(curve: list[dict], bh: list[dict], trades: list[dict], exposure_days: int, fees: float) -> dict:
    eq = [c["v"] for c in curve]
    rets = [eq[i] / eq[i - 1] - 1 for i in range(1, len(eq)) if eq[i - 1]]
    years = max(len(eq) / 252, 1 / 252)
    mean = sum(rets) / len(rets) if rets else 0
    sd = math.sqrt(sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)) if len(rets) > 1 else 0
    booked = [t["pnl"] for t in trades if t["pnl"] is not None]
    wins, losses = [p for p in booked if p > 0], [p for p in booked if p <= 0]
    reasons: dict[str, dict] = {}
    for t in trades:
        if t["pnl"] is None:
            continue
        r = reasons.setdefault((t["exit_reason"] or "?").split(" (")[0].split(":")[0], {"count": 0, "pnl": 0.0})
        r["count"] += 1
        r["pnl"] = round(r["pnl"] + t["pnl"], 2)
    monthly: dict[str, float] = {}
    for c in curve:   # month return = last equity of the month / last equity of the previous month
        monthly[c["t"][:7]] = c["v"]
    out_monthly, last = {}, eq[0] if eq else 0
    for m in sorted(monthly):
        out_monthly[m] = monthly[m] / last - 1 if last else 0
        last = monthly[m]
    bh_eq = [b["v"] for b in bh]
    # Same-risk benchmark: buy & hold scaled down (rest in cash) until its daily volatility equals the bot's.
    # Raw buy & hold puts 100% of the money in the stock; the bots risk ~2% per trade, so this is the fair race.
    bh_rets = [bh_eq[i] / bh_eq[i - 1] - 1 for i in range(1, len(bh_eq)) if bh_eq[i - 1]]
    bh_mean = sum(bh_rets) / len(bh_rets) if bh_rets else 0
    bh_sd = math.sqrt(sum((r - bh_mean) ** 2 for r in bh_rets) / (len(bh_rets) - 1)) if len(bh_rets) > 1 else 0
    scale = sd / bh_sd if bh_sd else 0
    matched, matched_curve = 1.0, [1.0]
    for r in bh_rets:
        matched *= 1 + scale * r
        matched_curve.append(matched)
    return {
        "total_return": eq[-1] / eq[0] - 1 if eq else 0,
        "cagr": (eq[-1] / eq[0]) ** (1 / years) - 1 if eq and eq[0] > 0 and eq[-1] > 0 else None,
        "max_drawdown": max_drawdown(eq),
        "sharpe": mean / sd * math.sqrt(252) if sd else None,
        "volatility": sd * math.sqrt(252),
        "buy_hold_return": bh_eq[-1] / bh_eq[0] - 1 if bh_eq else 0,
        "buy_hold_max_drawdown": max_drawdown(bh_eq),
        "buy_hold_sharpe": bh_mean / bh_sd * math.sqrt(252) if bh_sd else None,
        "same_risk_buy_hold_return": matched - 1,
        "same_risk_buy_hold_max_drawdown": max_drawdown(matched_curve),
        "same_risk_stock_share": scale,
        "trades": len(booked), "wins": len(wins),
        "win_rate": len(wins) / len(booked) if booked else None,
        "avg_win": sum(wins) / len(wins) if wins else None,
        "avg_loss": sum(losses) / len(losses) if losses else None,
        "profit_factor": sum(wins) / -sum(losses) if losses and sum(losses) < 0 else None,
        "best": max(booked, default=None), "worst": min(booked, default=None),
        "exposure": exposure_days / len(eq) if eq else 0,
        "fees": round(fees, 2),
        "exit_reasons": reasons,
        "monthly": out_monthly,
    }


if __name__ == "__main__":
    import argparse
    import json

    from .bots import BOTS

    ap = argparse.ArgumentParser(description="Backtest one bot on historical daily prices (modelled option prices).")
    ap.add_argument("bot", choices=sorted(BOTS))
    ap.add_argument("--years", type=float, default=3)
    ap.add_argument("--start", help="YYYY-MM-DD (overrides --years)")
    ap.add_argument("--end", help="YYYY-MM-DD (default: yesterday)")
    ap.add_argument("--capital", type=float, default=100_000)
    ap.add_argument("--set", action="append", default=[], metavar="KEY=VALUE",
                    help=f"strategy override, repeatable; keys: {', '.join(TUNABLE)}")
    ap.add_argument("--model", action="append", default=[], metavar="KEY=VALUE",
                    help=f"pricing-model override, repeatable; keys: {', '.join(Model.__dataclass_fields__)}")
    ap.add_argument("--risk", type=float, help="risk per trade (share of equity)")
    ap.add_argument("--line", action="store_true", help="one summary line (for comparing many runs)")
    ap.add_argument("--json", action="store_true", help="print the full result as JSON")
    a = ap.parse_args()

    def pairs(items: list[str], allowed) -> dict:
        out = {}
        for it in items:
            k, _, v = it.partition("=")
            if k not in allowed or not v:
                ap.error(f"bad override {it!r}; allowed keys: {', '.join(allowed)}")
            out[k] = float(v)
        return out

    end = date.fromisoformat(a.end) if a.end else date.today() - timedelta(days=1)
    start = date.fromisoformat(a.start) if a.start else end - timedelta(days=int(a.years * 365))
    overrides = pairs(a.set, TUNABLE)
    model = Model(**pairs(a.model, list(Model.__dataclass_fields__)))
    res = run_backtest(a.bot, start, end, a.capital, overrides, model, a.risk)
    if a.line:
        s = res["stats"]
        tag = " ".join(f"{k}={v:g}" for k, v in {**overrides, **pairs(a.model, list(Model.__dataclass_fields__))}.items()) or "live settings"
        print(f"{res['bot'].upper():8}{res['start']}..{res['end']}  ret {s['total_return']:+6.1%}  same-risk B&H "
              f"{s['same_risk_buy_hold_return']:+6.1%}  maxDD {s['max_drawdown']:6.1%}  Sharpe {s['sharpe'] or 0:5.2f}  "
              f"PF {s['profit_factor'] or 0:4.2f}  win {(s['win_rate'] or 0):4.0%}  n {s['trades']:3}  | {tag}")
    elif a.json:
        print(json.dumps(res, default=str))
    else:
        s = res["stats"]
        print(f"{res['bot'].upper()} on {res['underlying']}  {res['start']} -> {res['end']}  [{res['data_source']}]")
        print(f"  return {s['total_return']:+.1%}  (buy & hold {s['buy_hold_return']:+.1%})   CAGR "
              f"{(s['cagr'] or 0):+.1%}   max drawdown {s['max_drawdown']:.1%}   Sharpe {s['sharpe'] or 0:.2f}")
        print(f"  same-risk buy & hold {s['same_risk_buy_hold_return']:+.1%} ({s['same_risk_stock_share']:.0%} in the stock, rest cash)"
              f"   buy & hold Sharpe {s['buy_hold_sharpe'] or 0:.2f}   buy & hold max drawdown {s['buy_hold_max_drawdown']:.1%}")
        print(f"  trades {s['trades']}  win rate {(s['win_rate'] or 0):.0%}  profit factor {s['profit_factor'] or 0:.2f}"
              f"  exposure {s['exposure']:.0%}  fees ${s['fees']:,.0f}")
