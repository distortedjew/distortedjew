"""Backtest the strategy on M15 candles from a CSV.

    python -m goldbot.backtest data/xauusd_m15.csv [--spread 0.35] [--risk 0.005]

CSV: a time column (UTC) plus open, high, low, close. Accepts OANDA downloads
(python -m goldbot.fetch_data) and MT5 "Export bars" files (<DATE> <TIME> <OPEN> ...).

Fills are pessimistic: entry at the next bar's open plus half the spread and slippage;
if a bar touches both stop and target, the stop is assumed to hit first.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass

import numpy as np
import pandas as pd

from .config import StrategyParams
from .risk import position_units
from .strategy import BAR, add_indicators, manage, signal_at


@dataclass
class Trade:
    side: str
    entry_time: pd.Timestamp
    entry: float
    sl: float
    tp: float
    risk: float
    units: float
    exit_time: pd.Timestamp | None = None
    exit: float | None = None
    pnl: float = 0.0
    reason: str = ""


def load_csv(path: str) -> pd.DataFrame:
    df = pd.read_csv(path, sep=None, engine="python")
    df.columns = [c.strip("<>").lower() for c in df.columns]
    if "date" in df.columns and "time" in df.columns:  # MT5 export
        df["time"] = pd.to_datetime(df["date"] + " " + df["time"], utc=True)
    else:
        df["time"] = pd.to_datetime(df["time"], utc=True)
    return df[["time", "open", "high", "low", "close"]].sort_values("time").reset_index(drop=True)


def run(df: pd.DataFrame, p: StrategyParams, equity: float = 10_000.0, risk: float = 0.005,
        spread: float = 0.35, slippage: float = 0.10, max_leverage: float = 10.0,
        max_trades_per_day: int = 4, cooldown_bars: int = 2, max_daily_loss: float = 0.02):
    ind = add_indicators(df, p)
    t_arr, o, h, l, c = (ind[k].to_numpy() for k in ("time", "open", "high", "low", "close"))
    cost = spread / 2 + slippage
    trades: list[Trade] = []
    curve = np.empty(len(ind))
    pos: Trade | None = None
    entry_i = last_exit_i = -10**9
    day, day_eq, day_trades, halted = None, equity, 0, False
    pending = None

    for i in range(len(ind)):
        ts = pd.Timestamp(t_arr[i])
        if ts.date() != day:
            day, day_eq, day_trades, halted = ts.date(), equity, 0, False

        if pending is not None and pos is None:  # fill last bar's signal at this open
            sig = pending
            sign = 1 if sig.side == "buy" else -1
            px = o[i] + sign * cost
            units = position_units(equity, risk, sig.sl_dist, px, max_leverage)
            if units > 0:
                pos = Trade(sig.side, ts, px, px - sign * sig.sl_dist, px + sign * sig.tp_dist,
                            sig.sl_dist, units)
                entry_i, day_trades = i, day_trades + 1
        pending = None

        if pos is not None:  # intrabar stop / target
            sign = 1 if pos.side == "buy" else -1
            hit_sl = l[i] <= pos.sl if sign > 0 else h[i] >= pos.sl
            hit_tp = h[i] >= pos.tp if sign > 0 else l[i] <= pos.tp
            exit_px = None
            if hit_sl:
                gap = o[i] < pos.sl if sign > 0 else o[i] > pos.sl  # gapped through the stop
                exit_px, why = (o[i] if gap else pos.sl) - sign * cost, "stop"
            elif hit_tp:
                exit_px, why = pos.tp - sign * cost, "target"
            if exit_px is not None:
                pos.exit_time, pos.exit, pos.reason = ts, exit_px, why
                pos.pnl = sign * (exit_px - pos.entry) * pos.units
                equity += pos.pnl
                trades.append(pos)
                pos, last_exit_i = None, i

        if pos is not None:  # bar-close management, same function as live
            action, new_sl = manage(pos.side, pos.entry, pos.sl, pos.risk, c[i], i - entry_i,
                                    ts + BAR, p)
            if action == "close":
                sign = 1 if pos.side == "buy" else -1
                pos.exit_time, pos.exit, pos.reason = ts + BAR, c[i] - sign * cost, "time"
                pos.pnl = sign * (pos.exit - pos.entry) * pos.units
                equity += pos.pnl
                trades.append(pos)
                pos, last_exit_i = None, i
            elif action == "move_sl":
                pos.sl = new_sl

        sign = 0 if pos is None else (1 if pos.side == "buy" else -1)
        open_pnl = sign * (c[i] - pos.entry) * pos.units if pos else 0.0
        curve[i] = equity + open_pnl
        if day_eq and 1 - curve[i] / day_eq >= max_daily_loss and not halted:
            halted = True  # live bot flattens and stops for the day
            if pos is not None:
                pos.exit_time, pos.exit, pos.reason = ts + BAR, c[i] - sign * cost, "daily_stop"
                pos.pnl = sign * (pos.exit - pos.entry) * pos.units
                equity += pos.pnl
                trades.append(pos)
                pos, last_exit_i = None, i
                curve[i] = equity

        if (pos is None and not halted and day_trades < max_trades_per_day
                and i - last_exit_i >= cooldown_bars and i + 1 < len(ind)):
            pending = signal_at(ind, i, p)

    return trades, pd.Series(curve, index=pd.to_datetime(t_arr, utc=True))


def report(trades: list[Trade], curve: pd.Series, start_equity: float) -> dict:
    pnl = np.array([t.pnl for t in trades])
    wins, losses = pnl[pnl > 0], pnl[pnl <= 0]
    daily = curve.resample("1D").last().dropna()
    rets = daily.pct_change().dropna()
    years = max((curve.index[-1] - curve.index[0]).days / 365.25, 1e-9) if len(curve) else 1
    final = curve.iloc[-1] if len(curve) else start_equity
    r_mult = [(t.pnl / t.units) / t.risk for t in trades if t.units and t.risk]
    return {
        "trades": len(trades),
        "win_rate": float(len(wins) / len(pnl)) if len(pnl) else 0.0,
        "avg_R": float(np.mean(r_mult)) if r_mult else 0.0,
        "profit_factor": float(wins.sum() / -losses.sum()) if len(losses) and losses.sum() < 0 else float("inf"),
        "total_return": float(final / start_equity - 1),
        "cagr": float((final / start_equity) ** (1 / years) - 1) if final > 0 else -1.0,
        "max_drawdown": float((curve / curve.cummax() - 1).min()) if len(curve) else 0.0,
        "sharpe_daily": float(rets.mean() / rets.std() * np.sqrt(252)) if len(rets) > 1 and rets.std() > 0 else 0.0,
        "final_equity": float(final),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv")
    ap.add_argument("--equity", type=float, default=10_000)
    ap.add_argument("--risk", type=float, default=0.005)
    ap.add_argument("--spread", type=float, default=0.35, help="USD/oz, round trip is paid once")
    ap.add_argument("--slippage", type=float, default=0.10, help="USD/oz per fill")
    ap.add_argument("--trades", metavar="OUT.csv", help="write every trade to a CSV")
    a = ap.parse_args()

    df = load_csv(a.csv)
    p = StrategyParams.from_env()
    trades, curve = run(df, p, a.equity, a.risk, a.spread, a.slippage)
    r = report(trades, curve, a.equity)
    print(f"{len(df)} candles  {df['time'].iloc[0]} -> {df['time'].iloc[-1]}")
    for k, v in r.items():
        pct = k in ("win_rate", "total_return", "cagr", "max_drawdown")
        print(f"  {k:<14} {v:.2%}" if pct else f"  {k:<14} {v:,.2f}")
    if a.trades:
        pd.DataFrame([t.__dict__ for t in trades]).to_csv(a.trades, index=False)
        print(f"trades -> {a.trades}")


if __name__ == "__main__":
    main()
