"""Performance statistics, shared by live analytics (API) and backtests (engine).

Everything here is a pure function of closed trades and an equity series, so
the Performance page and a backtest report compute identical numbers from
identical inputs. Percent outputs follow the contract: 4.82 means 4.82 %.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import TypeVar

from ..schemas import (
    BacktestTrade,
    DailyPnl,
    DistributionBin,
    EquityPoint,
    MonthlyReturn,
    PerformanceMetrics,
    Trade,
    TradeResult,
    TradingStats,
    WinLossStats,
)

SECONDS_PER_DAY = 86_400
# Below this much history, annualised figures (CAGR) are noise rather than signal.
MIN_DAYS_FOR_CAGR = 7.0
# Daily-return Sharpe/Sortino need at least this many daily observations.
MIN_DAYS_FOR_RATIOS = 5
PERIODS_PER_YEAR = 365  # crypto trades every day

DEFAULT_BIN_EDGES: tuple[float, ...] = (-5.0, -3.0, -2.0, -1.0, -0.5, 0.0, 0.5, 1.0, 2.0, 3.0, 5.0)


def classify(pnl: float) -> TradeResult:
    """The one rule for WIN / LOSS / BREAKEVEN (net of fees). Engine and backtests use it too."""
    if pnl > 1e-9:
        return "WIN"
    if pnl < -1e-9:
        return "LOSS"
    return "BREAKEVEN"


@dataclass(frozen=True)
class TradeStat:
    pnl: float
    pnl_pct: float
    side: str
    duration_sec: float
    fees: float
    closed_at: datetime
    r_multiple: float | None = None

    @property
    def result(self) -> TradeResult:
        return classify(self.pnl)

    @classmethod
    def from_trade(cls, t: Trade) -> TradeStat:
        return cls(t.pnl, t.pnl_pct, t.side, t.duration_sec, t.fees, t.closed_at, t.r_multiple)

    @classmethod
    def from_backtest(cls, t: BacktestTrade, fees: float = 0.0) -> TradeStat:
        return cls(
            t.pnl,
            t.pnl_pct,
            t.side,
            float(t.exit_time - t.entry_time),
            fees,
            datetime.fromtimestamp(t.exit_time, UTC),
        )


# --------------------------------------------------------------------------
# Equity-series helpers. ``points`` are (unix_seconds, equity) in time order.
# --------------------------------------------------------------------------


def drawdown_series(values: Sequence[float]) -> list[float]:
    """Percent drawdown from the running peak at each point (<= 0)."""
    out: list[float] = []
    peak = -math.inf
    for v in values:
        peak = max(peak, v)
        out.append((v / peak - 1.0) * 100.0 if peak > 0 else 0.0)
    return out


def max_drawdown(values: Sequence[float]) -> tuple[float, float]:
    """(worst drawdown %, worst drawdown in currency), both <= 0."""
    worst_pct = 0.0
    worst_abs = 0.0
    peak = -math.inf
    for v in values:
        peak = max(peak, v)
        if peak > 0:
            worst_pct = min(worst_pct, (v / peak - 1.0) * 100.0)
            worst_abs = min(worst_abs, v - peak)
    return worst_pct, worst_abs


def equity_curve(points: Sequence[tuple[int, float]], max_points: int | None = None) -> list[EquityPoint]:
    dd = drawdown_series([e for _, e in points])
    curve = [
        EquityPoint(time=int(t), equity=round(e, 2), drawdown_pct=round(d, 4))
        for (t, e), d in zip(points, dd, strict=True)
    ]
    return downsample(curve, max_points) if max_points else curve


T = TypeVar("T")


def downsample(items: Sequence[T], max_points: int) -> list[T]:
    """Uniform stride that always keeps the first and the last item."""
    n = len(items)
    if n <= max_points or max_points < 3:
        return list(items)
    step = (n - 1) / (max_points - 1)
    picked = [items[round(i * step)] for i in range(max_points - 1)]
    picked.append(items[-1])
    return picked


def daily_closes(points: Sequence[tuple[int, float]]) -> list[tuple[date, float]]:
    """Last equity value of each UTC day, in order."""
    out: list[tuple[date, float]] = []
    for t, e in points:
        d = datetime.fromtimestamp(t, UTC).date()
        if out and out[-1][0] == d:
            out[-1] = (d, e)
        else:
            out.append((d, e))
    return out


def daily_returns(points: Sequence[tuple[int, float]], starting_equity: float | None = None) -> list[float]:
    """Fractional day-over-day returns of the daily closes (first day vs starting_equity if given)."""
    closes = [e for _, e in daily_closes(points)]
    if starting_equity is not None and closes:
        closes = [starting_equity, *closes]
    return [closes[i] / closes[i - 1] - 1.0 for i in range(1, len(closes)) if closes[i - 1] > 0]


def sharpe(returns: Sequence[float], periods_per_year: int = PERIODS_PER_YEAR) -> float | None:
    if len(returns) < MIN_DAYS_FOR_RATIOS:
        return None
    mean = sum(returns) / len(returns)
    var = sum((r - mean) ** 2 for r in returns) / (len(returns) - 1)
    std = math.sqrt(var)
    if std < 1e-12:
        return None
    return mean / std * math.sqrt(periods_per_year)


def sortino(returns: Sequence[float], periods_per_year: int = PERIODS_PER_YEAR) -> float | None:
    if len(returns) < MIN_DAYS_FOR_RATIOS:
        return None
    mean = sum(returns) / len(returns)
    downside = math.sqrt(sum(min(0.0, r) ** 2 for r in returns) / len(returns))
    if downside < 1e-12:
        return None
    return mean / downside * math.sqrt(periods_per_year)


def cagr_pct(start_equity: float, end_equity: float, days: float) -> float | None:
    if days < MIN_DAYS_FOR_CAGR or start_equity <= 0 or end_equity <= 0:
        return None
    return ((end_equity / start_equity) ** (365.0 / days) - 1.0) * 100.0


def profit_factor(pnls: Sequence[float]) -> float | None:
    """Gross profit / gross loss. None when undefined (no trades, or no losing trades yet)."""
    gross_profit = sum(p for p in pnls if p > 0)
    gross_loss = -sum(p for p in pnls if p < 0)
    if gross_loss <= 1e-12:
        return None
    return gross_profit / gross_loss


def streaks(results: Sequence[TradeResult]) -> tuple[int, int, int]:
    """(longest win streak, longest loss streak, current streak signed: +wins / -losses).

    Breakeven trades end a streak without starting one.
    """
    longest_win = longest_loss = 0
    current = 0
    for r in results:
        if r == "WIN":
            current = current + 1 if current > 0 else 1
        elif r == "LOSS":
            current = current - 1 if current < 0 else -1
        else:
            current = 0
        longest_win = max(longest_win, current)
        longest_loss = max(longest_loss, -current)
    return longest_win, longest_loss, current


def _fmt_edge(v: float) -> str:
    return f"{v:g}%"


def distribution(
    values: Sequence[float], edges: Sequence[float] = DEFAULT_BIN_EDGES
) -> list[DistributionBin]:
    """Histogram with open-ended outer bins: (< e0), [e0, e1), ..., (>= eN)."""
    bins: list[DistributionBin] = [
        DistributionBin(label=f"< {_fmt_edge(edges[0])}", min=-1e9, max=edges[0], count=0)
    ]
    for lo, hi in zip(edges, edges[1:], strict=False):
        bins.append(DistributionBin(label=f"{_fmt_edge(lo)} – {_fmt_edge(hi)}", min=lo, max=hi, count=0))
    bins.append(DistributionBin(label=f"≥ {_fmt_edge(edges[-1])}", min=edges[-1], max=1e9, count=0))
    for v in values:
        for b in bins:
            if b.min <= v < b.max:
                b.count += 1
                break
    return bins


def daily_pnl(
    trades: Sequence[TradeStat], points: Sequence[tuple[int, float]], starting_equity: float
) -> list[DailyPnl]:
    """Per-UTC-day realized P&L and trade count, with the day's equity return."""
    by_day: dict[date, tuple[float, int]] = {}
    for t in trades:
        d = t.closed_at.astimezone(UTC).date()
        pnl, n = by_day.get(d, (0.0, 0))
        by_day[d] = (pnl + t.pnl, n + 1)
    closes = daily_closes(points)
    prev = starting_equity
    returns: dict[date, float] = {}
    for d, e in closes:
        returns[d] = (e / prev - 1.0) * 100.0 if prev > 0 else 0.0
        prev = e
    days = sorted(set(by_day) | set(returns))
    return [
        DailyPnl(
            date=d,
            pnl=round(by_day.get(d, (0.0, 0))[0], 2),
            trades=by_day.get(d, (0.0, 0))[1],
            return_pct=round(returns.get(d, 0.0), 4),
        )
        for d in days
    ]


def monthly_returns(
    trades: Sequence[TradeStat], points: Sequence[tuple[int, float]], starting_equity: float
) -> list[MonthlyReturn]:
    month_close: dict[str, float] = {}
    for t, e in points:
        month_close[datetime.fromtimestamp(t, UTC).strftime("%Y-%m")] = e
    month_pnl: dict[str, tuple[float, int]] = {}
    for t in trades:
        m = t.closed_at.astimezone(UTC).strftime("%Y-%m")
        pnl, n = month_pnl.get(m, (0.0, 0))
        month_pnl[m] = (pnl + t.pnl, n + 1)
    out: list[MonthlyReturn] = []
    prev = starting_equity
    for m in sorted(set(month_close) | set(month_pnl)):
        close = month_close.get(m, prev)
        pnl, n = month_pnl.get(m, (0.0, 0))
        out.append(
            MonthlyReturn(
                month=m,
                return_pct=round((close / prev - 1.0) * 100.0 if prev > 0 else 0.0, 4),
                pnl=round(pnl, 2),
                trades=n,
            )
        )
        prev = close
    return out


def _mean(xs: Sequence[float]) -> float | None:
    return sum(xs) / len(xs) if xs else None


def _pct(part: int, whole: int) -> float | None:
    return part / whole * 100.0 if whole else None


def compute_performance(
    trades: Sequence[TradeStat],
    points: Sequence[tuple[int, float]],
    starting_equity: float,
) -> tuple[PerformanceMetrics, WinLossStats, TradingStats]:
    """All headline statistics for one period.

    ``trades`` are the round trips closed in the period (any order), ``points``
    the equity series over the period (time order) and ``starting_equity`` the
    equity at the period start.
    """
    trades = sorted(trades, key=lambda t: t.closed_at)
    pnls = [t.pnl for t in trades]
    wins = [t for t in trades if t.result == "WIN"]
    losses = [t for t in trades if t.result == "LOSS"]
    n = len(trades)

    end_equity = points[-1][1] if points else starting_equity + sum(pnls)
    values = [starting_equity, *[e for _, e in points]]
    dd_pct, dd_abs = max_drawdown(values)
    net = end_equity - starting_equity
    gross_profit = sum(p for p in pnls if p > 0)
    gross_loss = sum(p for p in pnls if p < 0)
    span_days = (points[-1][0] - points[0][0]) / SECONDS_PER_DAY if len(points) > 1 else 0.0
    rets = daily_returns(points, starting_equity)
    r_values = [t.r_multiple for t in trades if t.r_multiple is not None]

    metrics = PerformanceMetrics(
        total_return_pct=(end_equity / starting_equity - 1.0) * 100.0 if starting_equity > 0 else 0.0,
        cagr_pct=cagr_pct(starting_equity, end_equity, span_days),
        sharpe=sharpe(rets),
        sortino=sortino(rets),
        profit_factor=profit_factor(pnls),
        expectancy=_mean(pnls),
        expectancy_r=_mean(r_values),
        max_drawdown_pct=dd_pct,
        max_drawdown_usd=dd_abs,
        recovery_factor=(net / -dd_abs) if dd_abs < -1e-9 else None,
        avg_trade=_mean(pnls),
        avg_trade_pct=_mean([t.pnl_pct for t in trades]),
        net_profit=net,
        gross_profit=gross_profit,
        gross_loss=gross_loss,
        total_fees=sum(t.fees for t in trades),
    )

    avg_win = _mean([t.pnl for t in wins])
    avg_loss = _mean([t.pnl for t in losses])
    win_loss = WinLossStats(
        win_rate=_pct(len(wins), n),
        loss_rate=_pct(len(losses), n),
        avg_win=avg_win,
        avg_loss=avg_loss,
        avg_win_pct=_mean([t.pnl_pct for t in wins]),
        avg_loss_pct=_mean([t.pnl_pct for t in losses]),
        largest_win=max((t.pnl for t in wins), default=None),
        largest_loss=min((t.pnl for t in losses), default=None),
        payoff_ratio=(avg_win / -avg_loss)
        if avg_win is not None and avg_loss is not None and avg_loss < 0
        else None,
    )

    longs = [t for t in trades if t.side == "LONG"]
    shorts = [t for t in trades if t.side == "SHORT"]
    longest_win, longest_loss, current = streaks([t.result for t in trades])
    first_close = trades[0].closed_at if trades else None
    last_close = trades[-1].closed_at if trades else None
    active_days = (
        max(1.0, (last_close - first_close).total_seconds() / SECONDS_PER_DAY)
        if first_close and last_close
        else None
    )
    stats = TradingStats(
        total_trades=n,
        long_trades=len(longs),
        short_trades=len(shorts),
        winning_trades=len(wins),
        losing_trades=len(losses),
        breakeven_trades=n - len(wins) - len(losses),
        long_win_rate=_pct(sum(1 for t in longs if t.result == "WIN"), len(longs)),
        short_win_rate=_pct(sum(1 for t in shorts if t.result == "WIN"), len(shorts)),
        avg_holding_sec=_mean([t.duration_sec for t in trades]),
        longest_win_streak=longest_win,
        longest_loss_streak=longest_loss,
        current_streak=current,
        trades_per_day=(n / active_days) if active_days else None,
    )
    return metrics, win_loss, stats
