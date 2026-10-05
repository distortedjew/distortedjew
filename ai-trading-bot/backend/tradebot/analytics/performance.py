"""Portfolio KPIs and the performance report served by the API.

Both read the engine's history tables (``equity_snapshots``, ``trades``,
``positions``) and turn them into contract models with the pure statistics in
:mod:`tradebot.analytics.metrics`, so the Performance page, the KPI cards and a
backtest report agree on every definition. Days are UTC calendar days; "now"
is the time of the request.

Portfolio KPIs (``PortfolioKpis``; the dashboard writes its tooltips from this table):

| KPI | value | previous (comparison_label) | sparkline (oldest → newest) |
|---|---|---|---|
| ``equity`` | current equity (live) | equity 24 h ago ("vs 24h ago") | equity every 30 min over the last 24 h, ending with the live value |
| ``today_pnl`` | today's P&L: realized today + change in unrealized since 00:00 UTC (live) | yesterday's full-day P&L (equity at the end of yesterday − equity at the end of the day before) ("vs yesterday") | daily P&L over the last 14 days, today (live) last |
| ``total_pnl`` | equity − starting balance | the same 24 h ago ("vs 24h ago") | day-end equity − starting balance over the last 30 days, today (live) last |
| ``win_rate`` | % of the trades closed in the last 7 days that were wins | the prior 7 days, 7–14 days ago ("vs prior 7d") | daily win rate over the last 14 days; days without closed trades are skipped |
| ``profit_factor`` | gross profit / gross loss of the trades closed in the last 7 days; None while there is no losing trade | the prior 7 days ("vs prior 7d") | rolling-7-day profit factor at the end of each of the last 14 days (undefined days skipped) |
| ``max_drawdown`` | worst peak-to-trough fall of equity since the start, % (≤ 0) | the worst drawdown as it stood 7 days ago ("vs 7d ago") | each day's deepest drawdown below the running all-time peak, last 30 days |
| ``open_positions`` | positions open now | positions open 24 h ago, reconstructed from trades ("vs 24h ago") | open-position count every hour over the last 24 h, ending now |
| ``trades_today`` | entries (positions opened) today | entries yesterday ("vs yesterday") | daily entries over the last 14 days, today last |

``change`` = value − previous; ``change_pct`` = change / |previous| × 100, None when
previous is 0 or None. Before the first equity snapshot the account is taken to be in
its starting state (starting balance, no drawdown, no positions, no trades), so a
comparison reaching back before the bot existed compares against that state.
Sparklines start at the first recorded data point instead of padding.

Equity history comes from ``equity_snapshots`` (one row a minute and on every trade
close); drawdowns are measured from the running peak, seeded with the starting balance,
exactly as :func:`metrics.compute_performance` does.
"""

from __future__ import annotations

import bisect
import math
import threading
import time
import typing
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from ..db import Database, iso, parse_iso, utcnow
from ..schemas import (
    EquityPoint,
    ExitReason,
    ExitReasonBreakdown,
    Kpi,
    PerformanceRange,
    PerformanceReport,
    Portfolio,
    PortfolioKpis,
    PortfolioState,
    SymbolBreakdown,
    Trade,
)
from . import metrics

DAY = 86_400
HOUR = 3_600
_EPOCH_ORDINAL = date(1970, 1, 1).toordinal()

RANGE_SECONDS: dict[str, int] = {"24h": DAY, "7d": 7 * DAY, "30d": 30 * DAY, "90d": 90 * DAY}
MAX_CURVE_POINTS = 1_000
# Long ranges are reduced to the high, low and last equity of each time bucket before the
# statistics run: drawdowns and day / month closes stay exact while a year of minute
# snapshots shrinks to a few thousand points. Bucket sizes divide a day evenly.
_BUCKET_SIZES = (60, 120, 300, 600, 900, 1_800, 3_600)
_TARGET_BUCKETS = 6_000

KPI_CACHE_SECONDS = 5.0
EXIT_REASONS: tuple[ExitReason, ...] = typing.get_args(ExitReason)


# --------------------------------------------------------------------------
# Time helpers (unix seconds <-> UTC days)
# --------------------------------------------------------------------------


def day_of(ts: int) -> date:
    """UTC calendar day of a unix timestamp."""
    return date.fromordinal(_EPOCH_ORDINAL + ts // DAY)


def day_start(d: date) -> int:
    """Unix seconds of 00:00 UTC on ``d``."""
    return (d.toordinal() - _EPOCH_ORDINAL) * DAY


def to_ts(value: datetime | str) -> int:
    dt = parse_iso(value) if isinstance(value, str) else value
    return int(dt.timestamp())


def _days_back(today: date, count: int) -> list[date]:
    """The ``count`` days ending yesterday, oldest first."""
    return [today - timedelta(days=i) for i in range(count, 0, -1)]


class StepSeries:
    """Step function over time-ordered (time, value) points: the value at ``t`` is the
    last point at or before ``t`` (None before the first point)."""

    def __init__(self, points: Sequence[tuple[int, float]]):
        self._times = [t for t, _ in points]
        self._values = [v for _, v in points]

    def at(self, t: int) -> float | None:
        i = bisect.bisect_right(self._times, t)
        return self._values[i - 1] if i else None


def win_rate(pnls: Sequence[float]) -> float | None:
    """Wins as % of all closed trades (breakevens count as trades, not wins)."""
    if not pnls:
        return None
    return sum(1 for p in pnls if metrics.classify(p) == "WIN") / len(pnls) * 100.0


def _round(value: float | None, digits: int) -> float | None:
    return None if value is None else round(value, digits)


def make_kpi(
    value: float | None,
    previous: float | None,
    label: str,
    sparkline: Iterable[float],
    digits: int = 2,
) -> Kpi:
    change = change_pct = None
    if value is not None and previous is not None:
        change = value - previous
        if abs(previous) > 1e-12:
            change_pct = change / abs(previous) * 100.0
    return Kpi(
        value=_round(value, digits),
        previous=_round(previous, digits),
        change=_round(change, digits),
        change_pct=_round(change_pct, 2),
        comparison_label=label,
        sparkline=[round(v, digits) for v in sparkline],
    )


# --------------------------------------------------------------------------
# Drawdown, maintained incrementally over the whole equity history
# --------------------------------------------------------------------------


class DrawdownTracker:
    """Running-peak drawdown over ``equity_snapshots``, updated incrementally.

    The all-time worst drawdown needs the running peak from the very first snapshot; a
    year of minute snapshots is half a million rows, so the tracker folds new rows in as
    they arrive and rebuilds from scratch only when the history changes underneath it
    (rows pruned, starting balance changed) and once an hour as a safety net.
    """

    REBUILD_SECONDS = 3_600.0
    _BATCH = 50_000

    def __init__(self, starting_balance: float):
        self._reset(starting_balance)

    def _reset(self, starting_balance: float) -> None:
        self.starting_balance = starting_balance
        self.peak = starting_balance
        self.worst = 0.0
        self.first_time: int | None = None
        self.last_time: int | None = None
        self._lows: list[tuple[int, float]] = []  # (time, new worst) each time the worst deepens
        self._day_worst: dict[date, float] = {}
        self._day_close: dict[date, float] = {}
        self._built_at = time.monotonic()

    def feed(self, rows: Iterable[tuple[int, float]]) -> None:
        """Fold in snapshots newer than everything seen so far, in time order."""
        for t, equity in rows:
            if self.first_time is None:
                self.first_time = t
            if equity > self.peak:
                self.peak = equity
            dd = (equity / self.peak - 1.0) * 100.0 if self.peak > 0 else 0.0
            day = day_of(t)
            seen = self._day_worst.get(day)
            if seen is None or dd < seen:
                self._day_worst[day] = dd
            self._day_close[day] = dd
            if dd < self.worst:
                self.worst = dd
                self._lows.append((t, dd))
            self.last_time = t

    def sync(self, db: Database, starting_balance: float) -> None:
        first = db.read_one("SELECT MIN(time) AS t FROM equity_snapshots")["t"]
        if (
            starting_balance != self.starting_balance
            or time.monotonic() - self._built_at > self.REBUILD_SECONDS
            or first != self.first_time
        ):
            self._reset(starting_balance)
        while True:
            after = self.last_time if self.last_time is not None else -1
            rows = db.read(
                "SELECT time, equity FROM equity_snapshots WHERE time > ? ORDER BY time LIMIT ?",
                (after, self._BATCH),
            )
            self.feed((r[0], r[1]) for r in rows)
            if len(rows) < self._BATCH:
                return

    def worst_as_of(self, t: int) -> float:
        i = bisect.bisect_right(self._lows, (t, math.inf))
        return self._lows[i - 1][1] if i else 0.0

    def daily_worst(self, days: Sequence[date]) -> list[float]:
        """Deepest drawdown of each day; a day without snapshots keeps the drawdown the
        previous day closed at. Days before the history are skipped."""
        if not days:
            return []
        earlier = [d for d in self._day_close if d < days[0]]
        carry = self._day_close[max(earlier)] if earlier else None
        out: list[float] = []
        for d in days:
            if d in self._day_worst:
                out.append(self._day_worst[d])
                carry = self._day_close[d]
            elif carry is not None:
                out.append(carry)
        return out

    def day_worst(self, d: date) -> float | None:
        return self._day_worst.get(d)


# --------------------------------------------------------------------------
# Portfolio KPIs
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class KpiHistory:
    """Everything the KPIs need from history; ``assemble_kpis`` merges in live values."""

    starting_balance: float
    equity_samples: list[float]
    equity_24h_ago: float
    daily_pnl: list[float]
    yesterday_pnl: float
    daily_total_pnl: list[float]
    win_rate_7d: float | None
    win_rate_prior_7d: float | None
    win_rate_daily: list[float]
    profit_factor_7d: float | None
    profit_factor_prior_7d: float | None
    profit_factor_daily: list[float]
    drawdown_worst: float
    drawdown_peak: float
    drawdown_worst_7d_ago: float
    drawdown_daily: list[float]
    drawdown_today: float | None
    open_24h_ago: int
    open_hourly: list[float]
    entries_today: int
    entries_yesterday: int
    entries_daily: list[float]


def load_kpi_history(
    db: Database, tracker: DrawdownTracker, starting_balance: float, now: datetime
) -> KpiHistory:
    now_t = int(now.timestamp())
    today = day_of(now_t)
    tracker.sync(db, starting_balance)

    # -- equity over the last 24 h, sampled every 30 min -------------------------------
    t0 = now_t - DAY
    base = db.read_one(
        "SELECT time, equity FROM equity_snapshots WHERE time <= ? ORDER BY time DESC LIMIT 1", (t0,)
    )
    recent = db.read(
        "SELECT time, equity FROM equity_snapshots WHERE time > ? AND time <= ? ORDER BY time", (t0, now_t)
    )
    equity = StepSeries(([(base[0], base[1])] if base else []) + [(r[0], r[1]) for r in recent])
    samples = [v for k in range(48) if (v := equity.at(t0 + k * 1_800)) is not None]
    equity_24h_ago = equity.at(t0)

    # -- day-end equity over the last 30 days -> daily and total P&L --------------------
    window = _days_back(today, 29)
    prior = db.read_one(
        "SELECT equity FROM equity_snapshots WHERE time < ? ORDER BY time DESC LIMIT 1",
        (day_start(window[0]),),
    )
    closes_by_day = {
        day_of(r["t"]): r["equity"]
        for r in db.read(
            # SQLite: a bare column next to MAX() comes from the row holding the maximum
            "SELECT MAX(time) AS t, equity FROM equity_snapshots WHERE time >= ? AND time < ? "
            "GROUP BY time / 86400",
            (day_start(window[0]), day_start(today)),
        )
    }
    last_close: float | None = prior["equity"] if prior else None
    day_close: dict[date, float] = {}
    day_pnl: dict[date, float] = {}
    for d in window:
        previous_close = last_close
        last_close = closes_by_day.get(d, last_close)
        if last_close is None:
            continue  # before the history starts
        day_close[d] = last_close
        day_pnl[d] = last_close - (previous_close if previous_close is not None else starting_balance)
    pnl_days = _days_back(today, 13)

    # -- closed trades over the last 21 days -> win rate / profit factor ----------------
    trade_rows = db.read(
        "SELECT opened_at, closed_at, pnl FROM trades WHERE closed_at >= ?", (iso(now - timedelta(days=21)),)
    )
    closed = sorted((to_ts(r["closed_at"]), r["pnl"]) for r in trade_rows)
    close_times = [t for t, _ in closed]

    def pnls_between(start: int, end: int) -> list[float]:
        """P&L of trades closed in [start, end)."""
        lo = bisect.bisect_left(close_times, start)
        hi = bisect.bisect_left(close_times, end)
        return [p for _, p in closed[lo:hi]]

    last_7d = pnls_between(now_t - 7 * DAY + 1, now_t + 1)
    prior_7d = pnls_between(now_t - 14 * DAY + 1, now_t - 7 * DAY + 1)
    win_rate_daily: list[float] = []
    pf_daily: list[float] = []
    for d in [*pnl_days, today]:
        start = day_start(d)
        end = min(start + DAY, now_t + 1)
        if (wr := win_rate(pnls_between(start, end))) is not None:
            win_rate_daily.append(wr)
        if (pf := metrics.profit_factor(pnls_between(end - 7 * DAY, end))) is not None:
            pf_daily.append(pf)

    # -- open positions over the last 24 h, reconstructed from trades -------------------
    open_now = [to_ts(r["opened_at"]) for r in db.read("SELECT opened_at FROM positions")]
    spans = [(to_ts(r["opened_at"]), close_t) for r in trade_rows if (close_t := to_ts(r["closed_at"])) > t0]

    def open_at(t: int) -> int:
        return sum(1 for o, c in spans if o <= t < c) + sum(1 for o in open_now if o <= t)

    history_start = _history_start(db, tracker)
    open_hourly = [
        float(open_at(t))
        for t in (t0 + h * HOUR for h in range(24))
        if history_start is not None and t >= history_start
    ]

    # -- entries per day over the last 14 days ------------------------------------------
    since = day_start(pnl_days[0])
    entries: dict[date, int] = defaultdict(int)
    for r in db.read(
        "SELECT substr(opened_at, 1, 10) AS d, COUNT(*) AS n FROM trades WHERE opened_at >= ? GROUP BY d",
        (iso(datetime.fromtimestamp(since, UTC)),),
    ):
        entries[date.fromisoformat(r["d"])] += r["n"]
    for o in open_now:
        if o >= since:
            entries[day_of(o)] += 1
    first_day = day_of(history_start) if history_start is not None else today

    return KpiHistory(
        starting_balance=starting_balance,
        equity_samples=samples,
        equity_24h_ago=equity_24h_ago if equity_24h_ago is not None else starting_balance,
        daily_pnl=[day_pnl[d] for d in pnl_days if d in day_pnl],
        yesterday_pnl=day_pnl.get(today - timedelta(days=1), 0.0),
        daily_total_pnl=[day_close[d] - starting_balance for d in window if d in day_close],
        win_rate_7d=win_rate(last_7d),
        win_rate_prior_7d=win_rate(prior_7d),
        win_rate_daily=win_rate_daily,
        profit_factor_7d=metrics.profit_factor(last_7d),
        profit_factor_prior_7d=metrics.profit_factor(prior_7d),
        profit_factor_daily=pf_daily,
        drawdown_worst=tracker.worst,
        drawdown_peak=tracker.peak,
        drawdown_worst_7d_ago=tracker.worst_as_of(now_t - 7 * DAY),
        drawdown_daily=tracker.daily_worst(window),
        drawdown_today=tracker.day_worst(today),
        open_24h_ago=open_at(t0),
        open_hourly=open_hourly,
        entries_today=entries.get(today, 0),
        entries_yesterday=entries.get(today - timedelta(days=1), 0),
        entries_daily=[float(entries.get(d, 0)) for d in pnl_days if d >= first_day],
    )


def _history_start(db: Database, tracker: DrawdownTracker) -> int | None:
    """First moment the account has a record of: the first equity snapshot, else the first entry."""
    if tracker.first_time is not None:
        return tracker.first_time
    row = db.read_one(
        "SELECT MIN(o) AS o FROM (SELECT MIN(opened_at) AS o FROM trades UNION ALL "
        "SELECT MIN(opened_at) FROM positions)"
    )
    return to_ts(row["o"]) if row and row["o"] else None


def assemble_kpis(history: KpiHistory, state: PortfolioState) -> PortfolioKpis:
    """Merge the live portfolio state into the cached history."""
    h = history
    equity = state.equity
    starting = state.starting_balance
    peak = max(h.drawdown_peak, equity)
    drawdown_now = (equity / peak - 1.0) * 100.0 if peak > 0 else 0.0
    worst = min(h.drawdown_worst, drawdown_now)
    today_worst = drawdown_now if h.drawdown_today is None else min(h.drawdown_today, drawdown_now)
    total = equity - starting
    return PortfolioKpis(
        equity=make_kpi(equity, h.equity_24h_ago, "vs 24h ago", [*h.equity_samples, equity]),
        today_pnl=make_kpi(state.today_pnl, h.yesterday_pnl, "vs yesterday", [*h.daily_pnl, state.today_pnl]),
        total_pnl=make_kpi(total, h.equity_24h_ago - starting, "vs 24h ago", [*h.daily_total_pnl, total]),
        win_rate=make_kpi(h.win_rate_7d, h.win_rate_prior_7d, "vs prior 7d", h.win_rate_daily),
        profit_factor=make_kpi(
            h.profit_factor_7d, h.profit_factor_prior_7d, "vs prior 7d", h.profit_factor_daily, digits=3
        ),
        max_drawdown=make_kpi(
            worst, h.drawdown_worst_7d_ago, "vs 7d ago", [*h.drawdown_daily, today_worst], digits=3
        ),
        open_positions=make_kpi(
            state.open_positions,
            h.open_24h_ago,
            "vs 24h ago",
            [*h.open_hourly, state.open_positions],
            digits=0,
        ),
        trades_today=make_kpi(
            h.entries_today,
            h.entries_yesterday,
            "vs yesterday",
            [*h.entries_daily, h.entries_today],
            digits=0,
        ),
    )


class PortfolioKpiService:
    """KPIs for ``GET /api/portfolio`` and WS ``portfolio`` frames.

    History-derived inputs are recomputed at most every ``ttl`` seconds; the live values
    (equity, today's P&L, open positions) are merged in on every call, so the KPI cards
    never lag the portfolio numbers they sit next to. Thread-safe.
    """

    def __init__(self, db: Database, ttl: float = KPI_CACHE_SECONDS):
        self.db = db
        self.ttl = ttl
        self._lock = threading.Lock()
        self._tracker: DrawdownTracker | None = None
        self._history: KpiHistory | None = None
        self._expires = 0.0

    def history(self, starting_balance: float, now: datetime | None = None) -> KpiHistory:
        with self._lock:
            mono = time.monotonic()
            cached = self._history
            if cached is None or mono >= self._expires or cached.starting_balance != starting_balance:
                if self._tracker is None:
                    self._tracker = DrawdownTracker(starting_balance)
                cached = load_kpi_history(self.db, self._tracker, starting_balance, now or utcnow())
                self._history = cached
                self._expires = mono + self.ttl
            return cached

    def kpis(self, state: PortfolioState, now: datetime | None = None) -> PortfolioKpis:
        return assemble_kpis(self.history(state.starting_balance, now), state)

    def portfolio(self, state: PortfolioState, now: datetime | None = None) -> Portfolio:
        return Portfolio(**state.model_dump(), kpis=self.kpis(state, now))


# --------------------------------------------------------------------------
# Performance report
# --------------------------------------------------------------------------


def compress_extremes(points: Sequence[tuple[int, float]], bucket: int) -> list[tuple[int, float]]:
    """Keep the high, the low and the last point of every ``bucket``-second window.

    Peaks and troughs survive in time order, so the maximum drawdown of the result equals
    that of the input, and the last point of every day / month is kept as well.
    """
    out: list[tuple[int, float]] = []
    key: int | None = None
    hi = lo = last = (0, 0.0)
    for point in points:
        k = point[0] // bucket
        if k != key:
            if key is not None:
                out.extend(sorted({hi, lo, last}))
            key = k
            hi = lo = last = point
            continue
        if point[1] > hi[1]:
            hi = point
        if point[1] < lo[1]:
            lo = point
        last = point
    if key is not None:
        out.extend(sorted({hi, lo, last}))
    return out


def _bucket_for(span: int) -> int:
    target = span / _TARGET_BUCKETS
    return next((b for b in _BUCKET_SIZES if b >= target), _BUCKET_SIZES[-1])


def _equity_curve(points: Sequence[tuple[int, float]]) -> list[EquityPoint]:
    drawdowns = metrics.drawdown_series([e for _, e in points])
    picked = metrics.downsample(range(len(points)), MAX_CURVE_POINTS)
    return [
        EquityPoint(time=points[i][0], equity=round(points[i][1], 2), drawdown_pct=round(drawdowns[i], 4))
        for i in picked
    ]


def _by_symbol(trades: Sequence[Trade]) -> list[SymbolBreakdown]:
    groups: dict[str, list[float]] = defaultdict(list)
    for t in trades:
        groups[t.symbol].append(t.pnl)
    out = [
        SymbolBreakdown(symbol=symbol, trades=len(pnls), win_rate=win_rate(pnls), pnl=round(sum(pnls), 2))
        for symbol, pnls in groups.items()
    ]
    return sorted(out, key=lambda b: (-b.pnl, b.symbol))


def _by_exit_reason(trades: Sequence[Trade]) -> list[ExitReasonBreakdown]:
    counts: dict[str, int] = defaultdict(int)
    pnl: dict[str, float] = defaultdict(float)
    for t in trades:
        counts[t.exit_reason] += 1
        pnl[t.exit_reason] += t.pnl
    return [
        ExitReasonBreakdown(reason=reason, count=counts[reason], pnl=round(pnl[reason], 2))
        for reason in EXIT_REASONS
        if counts[reason]
    ]


def first_activity(db: Database) -> int | None:
    """Unix time of the first equity snapshot or trade entry, whichever is earlier."""
    row = db.read_one(
        "SELECT (SELECT MIN(time) FROM equity_snapshots) AS t, "
        "(SELECT MIN(opened_at) FROM trades) AS o, (SELECT MIN(opened_at) FROM positions) AS p"
    )
    candidates = [row["t"]] if row["t"] is not None else []
    candidates += [to_ts(v) for v in (row["o"], row["p"]) if v]
    return min(candidates) if candidates else None


def period_start(db: Database, range_: PerformanceRange, now_t: int) -> int:
    """Unix start of a report period; ``all`` starts at the first recorded activity."""
    if range_ == "all":
        return min(first_activity(db) or now_t, now_t)
    return now_t - RANGE_SECONDS[range_]


def build_performance_report(
    db: Database,
    range_: PerformanceRange,
    *,
    starting_balance: float,
    live_equity: float | None,
    now: datetime | None = None,
) -> PerformanceReport:
    """Headline statistics, curves and breakdowns over one period.

    The period starts ``range_`` before now (``all``: at the first recorded activity). Its
    starting equity is the last snapshot at or before the start (the starting balance
    before the bot existed); the live equity closes the series.
    """
    now = now or utcnow()
    now_t = int(now.timestamp())
    start_t = period_start(db, range_, now_t)

    base = db.read_one(
        "SELECT equity FROM equity_snapshots WHERE time <= ? ORDER BY time DESC LIMIT 1", (start_t,)
    )
    starting_equity = base["equity"] if base else starting_balance
    raw = [
        (r[0], r[1])
        for r in db.read(
            "SELECT time, equity FROM equity_snapshots WHERE time > ? AND time <= ? ORDER BY time",
            (start_t, now_t),
        )
    ]
    if len(raw) > 2 * _TARGET_BUCKETS:
        raw = compress_extremes(raw, _bucket_for(now_t - start_t))
    points: list[tuple[int, float]] = [(start_t, starting_equity), *raw]
    if live_equity is not None and points[-1][0] < now_t:
        points.append((now_t, live_equity))

    trades = [
        Trade.model_validate_json(r["payload"])
        for r in db.read(
            "SELECT payload FROM trades WHERE closed_at >= ? AND closed_at <= ? ORDER BY closed_at",
            (iso(datetime.fromtimestamp(start_t, UTC)), iso(now)),
        )
    ]
    stats = [metrics.TradeStat.from_trade(t) for t in trades]
    performance, win_loss, trading = metrics.compute_performance(stats, points, starting_equity)
    return PerformanceReport(
        range=range_,
        starting_equity=round(starting_equity, 2),
        ending_equity=round(points[-1][1], 2),
        metrics=performance,
        win_loss=win_loss,
        stats=trading,
        equity_curve=_equity_curve(points),
        daily_pnl=metrics.daily_pnl(stats, points, starting_equity),
        monthly=metrics.monthly_returns(stats, points, starting_equity),
        distribution=metrics.distribution([t.pnl_pct for t in trades]),
        by_symbol=_by_symbol(trades),
        by_exit_reason=_by_exit_reason(trades),
        updated_at=now,
    )
