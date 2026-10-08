"""Replay 1-minute history through the exact live code path and report the results.

    python -m scalpcity.backtest --synthetic 20                         # no data needed
    python -m scalpcity.backtest --csv QQQ=data/QQQ.csv --csv SPY=data/SPY.csv
    python -m scalpcity.backtest --source alpaca --start 2025-09-01 --end 2025-10-03
    python -m scalpcity.backtest --source yfinance                      # last ~7 days

Options are priced with Black-Scholes (see options.SimPricer), so fills are a model, not real quotes.
"""

from __future__ import annotations

import argparse
import csv
import heapq
import logging
from collections import defaultdict
from datetime import date, datetime, timedelta

from .bars import ET, Bar, load_csv
from .brokers.paper import PaperBroker
from .city import City
from .config import CityConfig, load_config
from .feeds import SyntheticMarket, alpaca_bars, yfinance_bars
from .options import SimPricer


def make_paper_broker(cfg: CityConfig) -> PaperBroker:
    return PaperBroker(SimPricer(cfg.iv, cfg.default_iv, cfg.spread_pct, cfg.min_spread), cfg.fee_per_contract)


def run(cfg: CityConfig, data: dict[str, list[Bar]], mode: str = "backtest") -> City:
    city = City(cfg, make_paper_broker(cfg), mode=mode, keep_days=400)
    for _, sym, bar in heapq.merge(*[[(b.ts, s, b) for b in bars] for s, bars in data.items()], key=lambda x: (x[0], x[1])):
        city.on_bar(sym, bar)
    city.flatten_all("end of data")
    return city


def summarize(city: City) -> str:
    trades = [t for w in city.workers for dl in w.days.values() for t in dl.trades]
    hist = city.history()
    lines = []
    if not trades:
        return "no trades"
    pnl = [t["pnl"] for t in trades]
    wins, losses = [p for p in pnl if p > 0], [p for p in pnl if p <= 0]
    eq = peak = dd = 0.0
    for h in hist:
        eq += h["pnl"]
        peak = max(peak, eq)
        dd = min(dd, eq - peak)
    green = sum(1 for h in hist if h["pnl"] > 0)
    pf = sum(wins) / -sum(losses) if losses and sum(losses) < 0 else float("inf")
    lines += [
        f"days {len(hist)}  green {green}/{len(hist)}  total {sum(pnl):+,.0f}  avg/day {sum(pnl) / max(len(hist), 1):+,.0f}"
        f"  max drawdown {dd:,.0f}",
        f"trades {len(trades)}  win rate {len(wins) / len(trades):.0%}  avg win {sum(wins) / max(len(wins), 1):+,.0f}"
        f"  avg loss {sum(losses) / max(len(losses), 1):+,.0f}  profit factor {pf:.2f}",
        "",
        f"{'worker':<14}{'trades':>7}{'win%':>6}{'pnl':>11}   days at target",
    ]
    for w in city.workers:
        ts = [t for dl in w.days.values() for t in dl.trades]
        n = len(ts)
        hits = sum(1 for dl in w.days.values() if w.cfg.daily_profit_target and dl.pnl >= w.cfg.daily_profit_target)
        lines.append(f"{w.cfg.name:<14}{n:>7}{(sum(t['pnl'] > 0 for t in ts) / n if n else 0):>6.0%}"
                     f"{sum(t['pnl'] for t in ts):>+11,.0f}   {hits}/{len(w.days)}")
    by_trig, by_exit = defaultdict(list), defaultdict(list)
    for t in trades:
        by_trig["+".join(t["triggers"])].append(t["pnl"])
        by_exit[t["reason"]].append(t["pnl"])
    for title, group in (("trigger", by_trig), ("exit", by_exit)):
        lines += ["", f"{title:<14}{'trades':>7}{'win%':>6}{'pnl':>11}"]
        for k, v in sorted(group.items(), key=lambda kv: -len(kv[1])):
            lines.append(f"{k:<14}{len(v):>7}{sum(p > 0 for p in v) / len(v):>6.0%}{sum(v):>+11,.0f}")
    lines += ["", "day           pnl"] + [f"{h['date']}  {h['pnl']:>+9,.0f}" for h in hist]
    return "\n".join(lines)


def write_trades(city: City, path: str) -> None:
    rows = [{"worker": w.cfg.name, "date": d, **t} for w in city.workers for d, dl in sorted(w.days.items()) for t in dl.trades]
    if not rows:
        return
    with open(path, "w", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=list(rows[0]))
        wr.writeheader()
        for r in rows:
            wr.writerow({**r, "triggers": "+".join(r["triggers"])})


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", default="config.example.toml")
    ap.add_argument("--csv", action="append", default=[], metavar="SYMBOL=PATH")
    ap.add_argument("--source", choices=["alpaca", "yfinance"])
    ap.add_argument("--start", help="YYYY-MM-DD (alpaca)")
    ap.add_argument("--end", help="YYYY-MM-DD (alpaca)")
    ap.add_argument("--synthetic", type=int, metavar="DAYS", help="simulate N days of random-walk bars")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--state", help="write dashboard state here (default: config state_path)")
    ap.add_argument("--trades", default="trades.csv")
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO if a.verbose else logging.WARNING, format="%(message)s")

    cfg = load_config(a.config)
    syms = cfg.symbols
    if a.csv:
        data = {}
        for spec in a.csv:
            sym, path = spec.split("=", 1)
            data[sym.upper()] = load_csv(path)
    elif a.source == "alpaca":
        end = datetime.fromisoformat(a.end).replace(tzinfo=ET) + timedelta(days=1) if a.end else datetime.now(ET)
        start = datetime.fromisoformat(a.start).replace(tzinfo=ET) if a.start else end - timedelta(days=30)
        data = {s: alpaca_bars(s, start, end) for s in syms}
    elif a.source == "yfinance":
        data = {s: yfinance_bars(s) for s in syms}
    elif a.synthetic:
        data = SyntheticMarket(syms, seed=a.seed).days(a.synthetic, date.today() - timedelta(days=1))
    else:
        ap.error("pick a data source: --csv, --source or --synthetic")
    missing = [s for s in syms if not data.get(s)]
    if missing:
        print(f"warning: no bars for {missing}; their workers sit idle")
    data = {s: b for s, b in data.items() if b}

    city = run(cfg, data, mode="synthetic" if a.synthetic else "backtest")
    print(summarize(city))
    write_trades(city, a.trades)
    city.write_state(a.state)
    print(f"\ntrades -> {a.trades}   dashboard state -> {a.state or cfg.state_path}")


if __name__ == "__main__":
    main()
