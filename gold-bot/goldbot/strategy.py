"""XAUUSD M15 trend-pullback strategy.

Pure functions on a DataFrame of completed candles (columns: time [UTC], open, high,
low, close). The live bot and the backtest call exactly the same code.

Entry (long; short is the mirror image):
  * trend:    EMA20 > EMA50 > EMA200 and close > EMA200
  * pullback: RSI dipped below 40 within the last 6 bars...
  * trigger:  ...and has now crossed back above 50, with close above EMA20
  * filters:  07:00-20:00 UTC (London + New York), ATR not below 60% of its ~5-day
              median, no new trades late on Friday
Exit: stop 1.5 ATR, target 3 ATR (2R), stop to breakeven at +1R, time stop after 16 h,
      flat before the weekend.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

from .config import StrategyParams

BAR = timedelta(minutes=15)


@dataclass
class Signal:
    side: str          # "buy" | "sell"
    sl_dist: float     # price distance from entry to stop
    tp_dist: float     # price distance from entry to target
    atr: float
    reason: str


def ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()


def rsi(close: pd.Series, n: int) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    rs = gain / loss.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).fillna(100.0)


def atr(df: pd.DataFrame, n: int) -> pd.Series:
    prev = df["close"].shift(1)
    tr = pd.concat(
        [df["high"] - df["low"], (df["high"] - prev).abs(), (df["low"] - prev).abs()], axis=1
    ).max(axis=1)
    return tr.ewm(alpha=1 / n, adjust=False).mean()


def add_indicators(df: pd.DataFrame, p: StrategyParams) -> pd.DataFrame:
    out = df.copy()
    out["ema_fast"] = ema(out["close"], p.ema_fast)
    out["ema_slow"] = ema(out["close"], p.ema_slow)
    out["ema_trend"] = ema(out["close"], p.ema_trend)
    out["rsi"] = rsi(out["close"], p.rsi_len)
    out["atr"] = atr(out, p.atr_len)
    out["atr_med"] = out["atr"].rolling(480, min_periods=96).median()  # ~5 trading days
    return out


def warmup(p: StrategyParams) -> int:
    return max(p.ema_trend * 2, 96 + p.atr_len)


def in_session(t: datetime, p: StrategyParams) -> bool:
    """Bar close time t (UTC) is inside the trading window and not late Friday."""
    if t.weekday() >= 5:
        return False
    if t.weekday() == 4 and t.hour >= p.friday_close_utc - 2:
        return False
    return p.session_start_utc <= t.hour < p.session_end_utc


def signal_at(ind: pd.DataFrame, i: int, p: StrategyParams) -> Signal | None:
    """Entry signal on the close of bar i (ind must come from add_indicators)."""
    if i < warmup(p) or i < 1:
        return None
    row = ind.iloc[i]
    close_time = row["time"] + BAR
    if not in_session(close_time, p):
        return None
    a = row["atr"]
    if not np.isfinite(a) or a <= 0:
        return None
    if np.isfinite(row["atr_med"]) and a < p.atr_floor_ratio * row["atr_med"]:
        return None

    prev_rsi = ind["rsi"].iloc[i - 1]
    window = ind["rsi"].iloc[max(0, i - p.pullback_lookback): i]
    c, f, s, t = row["close"], row["ema_fast"], row["ema_slow"], row["ema_trend"]

    if f > s > t and c > t and c > f and window.min() < p.rsi_pullback_long and prev_rsi <= 50 < row["rsi"]:
        return Signal("buy", p.sl_atr * a, p.tp_atr * a, a, f"uptrend pullback, RSI {row['rsi']:.0f}")
    if f < s < t and c < t and c < f and window.max() > p.rsi_pullback_short and prev_rsi >= 50 > row["rsi"]:
        return Signal("sell", p.sl_atr * a, p.tp_atr * a, a, f"downtrend pullback, RSI {row['rsi']:.0f}")
    return None


def manage(side: str, entry: float, sl: float, initial_risk: float, close: float,
           bars_held: int, bar_close_time: datetime, p: StrategyParams) -> tuple[str, float | None]:
    """Decide what to do with an open trade at a bar close.

    Returns ("close", None), ("move_sl", new_sl) or ("hold", None).
    """
    if bars_held >= p.max_bars_in_trade:
        return "close", None
    t = bar_close_time
    if (t.weekday() == 4 and t.hour >= p.friday_close_utc) or t.weekday() >= 5:
        return "close", None
    if initial_risk > 0:
        sign = 1 if side == "buy" else -1
        profit_r = sign * (close - entry) / initial_risk
        at_breakeven = sign * (sl - entry) >= 0
        if profit_r >= p.breakeven_r and not at_breakeven:
            return "move_sl", entry + sign * 0.05 * initial_risk  # a hair past entry covers costs
    return "hold", None
