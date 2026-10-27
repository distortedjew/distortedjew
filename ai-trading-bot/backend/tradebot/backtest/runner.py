"""Backtester: the live trading core replayed over historical candles on a virtual clock.

``run_backtest(request)`` loads the candles (Binance when reachable, otherwise deterministic
simulated history — ``market.history.load_history``), warms the indicators up on the bars
before ``request.start`` and replays the test window bar by bar through ``core.TradingCore``:
the same analysts, strategies, risk manager and paper broker as live trading, with the
request's fees, slippage, risk per trade and thresholds. Each bar of ``request.timeframe`` is
both a decision bar and the bar exits are checked against (a bar touching both the stop and
the target counts as the stop). Positions still open at the end are marked to market.

With ``compare=True`` the other two strategies run on the same candles; the requested one comes
first in ``BacktestOutcome.runs``.

Analyst: ``heuristic-v1`` unless ``ai_model`` names an LLM *and* OpenRouter is configured. LLM
backtests are capped at ``MAX_LLM_CALLS`` (300) requests — the model is consulted on every Nth
bar, ``N = ceil(bars / 300)``, and the bars in between hold (exits are still checked on every
bar). Analyst and baseline answers are shared between the strategy runs (they read market data
only, never the portfolio), so the cap holds for the whole comparison and a 1-year hourly
comparison takes a few seconds.

Risk limits the request does not set use the ``RiskSettings`` defaults, except the daily loss
limit, which scales with the account: 2 % of the starting balance (the default 200 USDT on
10 000 USDT). The time exit scales with the bars: a position may stay open for 48 bars of the
test timeframe (at least the live default of 12 h, at most the 7-day maximum), so an hourly
backtest is not cut off after 12 bars by a limit chosen for 5-minute trading.

The result is deterministic for a given request (and ``SIM_SEED`` when the data is simulated)
and is a plain picklable dataclass, so the API can run backtests in a worker process.
"""

from __future__ import annotations

import math
import threading
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta

from ..ai.base import Analyst, AnalystResult, MarketContext
from ..ai.heuristic import HeuristicAnalyst
from ..ai.openrouter import OpenRouterAnalyst, OpenRouterClient
from ..analytics import metrics
from ..analytics.metrics import TradeStat
from ..config import get_config
from ..core import Batch, CoreConfig, EquityRecord, MarketState, TradingCore
from ..market.history import load_history
from ..market.symbols import normalize
from ..schemas import (
    HEURISTIC_MODEL_ID,
    TIMEFRAME_SECONDS,
    TIMEFRAMES,
    AISettings,
    BacktestMetrics,
    BacktestRequest,
    BacktestRun,
    BacktestTrade,
    BotSettings,
    Candle,
    ExecutionSettings,
    FeedKind,
    RiskSettings,
    StrategyName,
    Trade,
    TradingSettings,
)
from ..strategy import STRATEGIES, baseline

MAX_LLM_CALLS = 300
MAX_CANDLES = 2000
MAX_CURVE_POINTS = 2000
DAILY_LOSS_FRACTION = 0.02
HOLDING_BARS = 48
# Extra calendar days loaded before ``start`` so indicators (incl. the trend timeframe's EMA 50)
# are warm on the first test bar.
WARMUP_DAYS: dict[str, int] = {"1m": 3, "5m": 20, "15m": 30, "1h": 90, "4h": 150, "1d": 300}
WARMUP_BARS = 600
CANCEL_CHECK_EVERY = 256

ProgressFn = Callable[[float], None]


class BacktestCancelled(Exception):
    """The caller set the ``cancel`` event."""


@dataclass
class BacktestOutcome:
    """What ``run_backtest`` returns (picklable)."""

    runs: list[BacktestRun]
    candles: list[Candle]  # the test window's price series, at most MAX_CANDLES (merged OHLCV)
    data_source: FeedKind
    llm_calls: int = 0
    notes: list[str] = field(default_factory=list)


# --------------------------------------------------------------------------
# Shared analysts: one answer per bar, reused by every strategy run
# --------------------------------------------------------------------------


def _hold(ctx: MarketContext, model: str, reason: str) -> AnalystResult:
    return AnalystResult(
        signal="HOLD",
        confidence=50.0,
        entry=None,
        stop_loss=None,
        take_profit=None,
        summary=reason,
        reasons=[reason],
        risks=[],
        invalidation=None,
        detailed_reasoning=reason,
        provider="openrouter",
        model=model,
    )


class SharedAnalyst:
    """Memoizes an analyst per (symbol, bar time); with ``stride > 1`` only every Nth bar asks it."""

    def __init__(self, inner: Analyst, *, stride: int = 1, start: int = 0, bar_seconds: int = 3600) -> None:
        self.inner = inner
        self.stride = max(1, stride)
        self.start = start
        self.bar_seconds = bar_seconds
        self.provider = inner.provider
        self.is_remote = inner.is_remote
        self.calls = 0
        self._cache: dict[tuple[str, int], AnalystResult] = {}

    @property
    def model(self) -> str:
        return self.inner.model

    def analyze(self, ctx: MarketContext) -> AnalystResult:
        key = (ctx.symbol, int(ctx.ts.timestamp()))
        cached = self._cache.get(key)
        if cached is not None:
            return cached
        index = (key[1] - self.start) // self.bar_seconds
        if self.stride > 1 and index % self.stride:
            result = _hold(
                ctx,
                self.model,
                f"No LLM call on this bar (LLM backtests consult the model every {self.stride} bars)",
            )
        else:
            self.calls += 1
            result = self.inner.analyze(ctx)
        self._cache[key] = result
        return result

    async def aanalyze(self, ctx: MarketContext) -> AnalystResult:
        return self.analyze(ctx)


class SharedBaseline:
    def __init__(self) -> None:
        self._cache: dict[tuple[str, int], AnalystResult] = {}

    def __call__(self, ctx: MarketContext) -> AnalystResult:
        key = (ctx.symbol, int(ctx.ts.timestamp()))
        result = self._cache.get(key)
        if result is None:
            result = baseline.evaluate(ctx)
            self._cache[key] = result
        return result


class _Collector:
    """Sink that keeps what a backtest needs: closed trades and the equity series."""

    def __init__(self) -> None:
        self.trades: list[Trade] = []
        self.equity: list[EquityRecord] = []

    def write(self, batch: Batch) -> None:
        self.trades.extend(batch.closed)
        self.equity.extend(batch.equity)


# --------------------------------------------------------------------------
# Running
# --------------------------------------------------------------------------


def _day_start(d: date) -> datetime:
    return datetime.combine(d, time(0), UTC)


def mtf_timeframes(base: str) -> tuple[str, ...]:
    """Up to four timeframes from the base upwards, highest first (live: 1h/15m/5m/1m)."""
    higher_first = [tf for tf in reversed(TIMEFRAMES) if TIMEFRAME_SECONDS[tf] >= TIMEFRAME_SECONDS[base]]
    return tuple(higher_first[-4:])


def holding_minutes(timeframe: str) -> int:
    """Time-exit horizon of a backtest: ``HOLDING_BARS`` bars, between 12 hours and 7 days."""
    return int(min(10_080, max(720, HOLDING_BARS * TIMEFRAME_SECONDS[timeframe] // 60)))


def backtest_settings(request: BacktestRequest, strategy: StrategyName) -> BotSettings:
    symbol = normalize(request.symbol)
    return BotSettings(
        trading=TradingSettings(
            symbols=[symbol],
            primary_symbol=symbol,
            decision_timeframe=request.timeframe,
            strategy=strategy,
            max_holding_minutes=holding_minutes(request.timeframe),
        ),
        risk=RiskSettings(
            risk_per_trade_pct=request.risk_pct,
            min_ai_confidence=request.min_ai_confidence,
            min_risk_reward=request.min_risk_reward,
            max_daily_loss_usd=max(1.0, request.starting_balance * DAILY_LOSS_FRACTION),
        ),
        execution=ExecutionSettings(fee_bps=request.fee_bps, slippage_bps=request.slippage_bps),
    )


def _analyst(
    request: BacktestRequest, bars: int, start: int, bar_seconds: int
) -> tuple[SharedAnalyst, list[str]]:
    cfg = get_config()
    notes: list[str] = []
    if request.ai_model != HEURISTIC_MODEL_ID:
        if cfg.openrouter_configured and cfg.openrouter_api_key is not None:
            client = OpenRouterClient(
                cfg.openrouter_api_key.get_secret_value(),
                base_url=cfg.openrouter_base_url,
                app_url=cfg.openrouter_app_url,
                app_name=cfg.openrouter_app_name,
            )
            ai = AISettings(model=request.ai_model, retry_count=1, heuristic_fallback=True)
            stride = max(1, math.ceil(bars / MAX_LLM_CALLS))
            if stride > 1:
                notes.append(
                    f"{request.ai_model} was consulted on every {stride}th bar ({MAX_LLM_CALLS}-call cap)"
                )
            return SharedAnalyst(
                OpenRouterAnalyst(client, ai), stride=stride, start=start, bar_seconds=bar_seconds
            ), notes
        notes.append(
            f"OpenRouter is not configured: {HEURISTIC_MODEL_ID} answered instead of {request.ai_model}"
        )
    return SharedAnalyst(HeuristicAnalyst(), start=start, bar_seconds=bar_seconds), notes


def _round(value: float | None, digits: int) -> float | None:
    if value is None or not math.isfinite(value):
        return None
    return round(value, digits)


def _equity_points(records: Sequence[EquityRecord]) -> list[tuple[int, float]]:
    """One point per timestamp (the last record wins)."""
    by_time: dict[int, float] = {}
    for r in records:
        by_time[r.time] = r.equity
    return sorted(by_time.items())


def summarize_run(
    strategy: StrategyName,
    trades: Sequence[Trade],
    equity: Sequence[EquityRecord],
    starting_balance: float,
    *,
    exposure_time_pct: float | None,
    buy_hold_return_pct: float | None,
) -> BacktestRun:
    points = _equity_points(equity)
    stats = [TradeStat.from_trade(t) for t in trades]
    perf, win_loss, tstats = metrics.compute_performance(stats, points, starting_balance)
    run_metrics = BacktestMetrics(
        total_return_pct=round(perf.total_return_pct, 4),
        net_profit=round(perf.net_profit, 2),
        win_rate=_round(win_loss.win_rate, 2),
        profit_factor=_round(perf.profit_factor, 3),
        max_drawdown_pct=round(perf.max_drawdown_pct, 4),
        sharpe=_round(perf.sharpe, 3),
        sortino=_round(perf.sortino, 3),
        cagr_pct=_round(perf.cagr_pct, 4),
        trades=tstats.total_trades,
        expectancy=_round(perf.expectancy, 2),
        avg_trade_pct=_round(perf.avg_trade_pct, 4),
        exposure_time_pct=_round(exposure_time_pct, 2),
        buy_hold_return_pct=_round(buy_hold_return_pct, 4),
    )
    return BacktestRun(
        strategy=strategy,
        metrics=run_metrics,
        equity_curve=metrics.equity_curve(points, max_points=MAX_CURVE_POINTS),
        trades=[
            BacktestTrade(
                entry_time=int(t.opened_at.timestamp()),
                exit_time=int(t.closed_at.timestamp()),
                side=t.side,
                entry_price=t.entry_price,
                exit_price=t.exit_price,
                size=t.size,
                pnl=round(t.pnl, 2),
                pnl_pct=round(t.pnl_pct, 4),
                exit_reason=t.exit_reason,
                confidence=t.ai_confidence,
            )
            for t in trades
        ],
        monthly=metrics.monthly_returns(stats, points, starting_balance),
        distribution=metrics.distribution([t.pnl_pct for t in trades]),
    )


def _run_strategies(
    request: BacktestRequest,
    strategies: Sequence[StrategyName],
    warm: list[Candle],
    test: list[Candle],
    analyst: SharedAnalyst,
    base: SharedBaseline,
    progress: ProgressFn | None,
    cancel: threading.Event | None,
) -> list[BacktestRun]:
    """Replay the test window once, bar by bar, through one core per strategy in lock-step.

    The cores share one ``MarketState`` (candle books, regime, MTF), so the market side of each
    bar is computed once; each strategy keeps its own portfolio, risk manager and broker.
    """
    tf = request.timeframe
    sec = TIMEFRAME_SECONDS[tf]
    symbol = normalize(request.symbol)
    market = MarketState()
    sinks = [_Collector() for _ in strategies]
    cores = [
        TradingCore(
            backtest_settings(request, strategy),
            CoreConfig(
                starting_balance=request.starting_balance,
                base_timeframe=tf,
                mtf_timeframes=mtf_timeframes(tf),
                emit_market_updates=False,
                emit_records=False,
                publish_mtf=False,
                narrate=False,
            ),
            analyst,
            sink,
            baseline_fn=base,
            market=market,
        )
        for strategy, sink in zip(strategies, sinks, strict=True)
    ]
    cores[0].warm_up(symbol, {tf: warm})
    for core in cores[1:]:
        core.sync_prices(symbol)
    exposed = [0] * len(cores)
    n = len(test)
    for i, candle in enumerate(test):
        close_time = datetime.fromtimestamp(candle.time + sec, UTC)
        for k, core in enumerate(cores):
            core.on_candle(symbol, candle)
            core.record_equity(close_time, include_positions=False)
            if core.broker.positions:
                exposed[k] += 1
        if i % CANCEL_CHECK_EVERY == 0:
            if cancel is not None and cancel.is_set():
                raise BacktestCancelled
            if progress is not None:
                progress(i / n)
    first, last = test[0], test[-1]
    buy_hold = (last.close / first.open - 1.0) * 100.0 if first.open > 0 else None
    return [
        summarize_run(
            strategy,
            sink.trades,
            sink.equity,
            request.starting_balance,
            exposure_time_pct=exposed[k] / n * 100.0 if n else None,
            buy_hold_return_pct=buy_hold,
        )
        for k, (strategy, sink) in enumerate(zip(strategies, sinks, strict=True))
    ]


def compact_candles(candles: Sequence[Candle], max_candles: int = MAX_CANDLES) -> list[Candle]:
    """Merge consecutive candles (OHLCV-correct) until at most ``max_candles`` remain."""
    if len(candles) <= max_candles:
        return list(candles)
    size = math.ceil(len(candles) / max_candles)
    out: list[Candle] = []
    for i in range(0, len(candles), size):
        group = candles[i : i + size]
        out.append(
            Candle(
                time=group[0].time,
                open=group[0].open,
                high=max(c.high for c in group),
                low=min(c.low for c in group),
                close=group[-1].close,
                volume=sum(c.volume for c in group),
            )
        )
    return out


def run_backtest(
    request: BacktestRequest,
    progress: ProgressFn | None = None,
    cancel: threading.Event | None = None,
    *,
    seed: int | None = None,
    allow_network: bool = True,
) -> BacktestOutcome:
    """Run ``request`` (and, with ``compare``, the other strategies) and return the results.

    ``progress`` receives the completed fraction (0–1). Setting ``cancel`` stops the run with
    ``BacktestCancelled``. ``seed`` overrides ``SIM_SEED`` for simulated data and
    ``allow_network=False`` skips Binance (both mainly for tests and research).
    """
    if request.end < request.start:
        raise ValueError("The backtest end date is before its start date")
    tf = request.timeframe
    sec = TIMEFRAME_SECONDS[tf]
    start = _day_start(request.start)
    end = min(_day_start(request.end) + timedelta(days=1), datetime.now(UTC))
    if end <= start:
        raise ValueError("The backtest window is empty (it starts in the future)")
    warm_start = start - timedelta(days=WARMUP_DAYS[tf])
    candles, source = load_history(
        request.symbol, tf, warm_start, end, seed=seed, allow_network=allow_network
    )
    start_ts = int(start.timestamp())
    warm = [c for c in candles if c.time < start_ts][-WARMUP_BARS:]
    test = [c for c in candles if c.time >= start_ts]
    if not test:
        raise ValueError(f"No {tf} candles for {request.symbol} between {request.start} and {request.end}")

    strategies: list[StrategyName] = [request.strategy]
    if request.compare:
        strategies += [s for s in STRATEGIES if s != request.strategy]
    analyst, notes = _analyst(request, len(test), start_ts, sec)
    base = SharedBaseline()
    runs = _run_strategies(request, strategies, warm, test, analyst, base, progress, cancel)
    if progress is not None:
        progress(1.0)
    return BacktestOutcome(
        runs=runs,
        candles=compact_candles(test),
        data_source=source,
        llm_calls=analyst.calls if analyst.is_remote else 0,
        notes=notes,
    )
