"""Trading core: one deterministic engine for live trading, the bootstrap and backtests.

The core has no clock and does no I/O. Drivers feed it closed base-timeframe candles
(``on_candle``) and, live, intra-candle prices (``on_tick``); every input carries its own
timestamp, so the same code runs in real time, on the bootstrap's virtual clock and over a
year of backtest bars. It owns the candle books, indicators, regimes, multi-timeframe view,
portfolio accounting, risk manager and paper broker, and reports everything it changes to
an injected ``CoreSink`` as one ``Batch`` per input — the store writes a batch in a single
transaction, the backtester just collects trades and equity.

Per decision-timeframe close and symbol: update the regime (+ ``MARKET_UPDATE``), build the
market context, run the strategy (baseline / analyst / hybrid), then — for LONG/SHORT —
the risk manager and the broker. The complete ``AIAnalysis`` (with its risk decision and
trade id) is in the same batch as, and ahead of, its events: ``AI_ANALYSIS``,
``TRADE_SIGNAL``, ``RISK_CHECK``, then ``TRADE_EXECUTED`` or ``TRADE_REJECTED``.

A live driver with a remote (LLM) analyst uses ``defer_remote_analysis``: the decision
close returns a ``PendingDecision``; the driver awaits the analyst off the tick path and
calls ``complete`` — risk is evaluated against the portfolio as it is at that moment.
"""

from __future__ import annotations

import secrets
from collections import deque
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol

from .ai.base import CONTEXT_TIMEFRAMES, Analyst, AnalystResult, MarketContext, RecentPerformance, UsageRecord
from .broker import EntryMeta, Exit, LimitOrder, OpenPosition, PaperBroker, new_position_id
from .market.candles import CandleBook
from .market.symbols import fmt_pct, fmt_price, fmt_qty, fmt_usd, normalize
from .mtf import MTF_TIMEFRAMES, build_report
from .regime import RegimeTracker, classify
from .risk import PortfolioView, RiskAlert, RiskManager, RiskState
from .schemas import (
    TIMEFRAME_SECONDS,
    TIMEFRAMES,
    AIAnalysis,
    BotSettings,
    Candle,
    EventType,
    ExitReason,
    MTFReport,
    NotificationType,
    PortfolioState,
    Position,
    RegimeState,
    RiskDecision,
    RiskSnapshot,
    Severity,
    Side,
    SignalEvaluation,
    Timeframe,
    Trade,
    TradingMode,
)
from .strategy import baseline, decide, needs_analyst

AI_UNAVAILABLE_EVERY = timedelta(minutes=30)
RECENT_TRADES = 20
CONTEXT_CANDLES = 30


def new_decision_id() -> str:
    return f"dec_{secrets.token_hex(6)}"


def _ts(unix: int | float) -> datetime:
    return datetime.fromtimestamp(unix, UTC)


# --------------------------------------------------------------------------
# What the core reports
# --------------------------------------------------------------------------


@dataclass(slots=True)
class EventRecord:
    type: EventType
    title: str
    message: str
    ts: datetime
    severity: Severity = "info"
    symbol: str | None = None
    data: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class NotificationRecord:
    type: NotificationType
    title: str
    message: str
    ts: datetime
    severity: Severity = "info"
    data: dict[str, Any] = field(default_factory=dict)
    read: bool = False  # bootstrap notifications are created already read


@dataclass(slots=True)
class EquityRecord:
    time: int
    equity: float
    cash: float
    realized_pnl: float
    unrealized_pnl: float
    exposure: float
    drawdown_pct: float


@dataclass
class Batch:
    """Everything one core input changed, persisted atomically and in this order."""

    analyses: list[AIAnalysis] = field(default_factory=list)  # insert or rewrite by id
    closed: list[Trade] = field(default_factory=list)  # position row → trade row (same id)
    positions: list[Position] = field(default_factory=list)  # upsert open positions
    equity: list[EquityRecord] = field(default_factory=list)
    usage: list[UsageRecord] = field(default_factory=list)
    regimes: list[tuple[RegimeState, bool]] = field(default_factory=list)  # (state, switched)
    mtf: list[MTFReport] = field(default_factory=list)
    events: list[EventRecord] = field(default_factory=list)
    notifications: list[NotificationRecord] = field(default_factory=list)
    risk_state: dict | None = None  # risk bookkeeping to persist (halts, streak)

    def empty(self) -> bool:
        return not (
            self.analyses
            or self.closed
            or self.positions
            or self.equity
            or self.usage
            or self.regimes
            or self.mtf
            or self.events
            or self.notifications
            or self.risk_state is not None
        )


class CoreSink(Protocol):
    def write(self, batch: Batch) -> None: ...


class NullSink:
    def write(self, batch: Batch) -> None:  # noqa: D102 - intentionally a no-op
        return None


@dataclass(slots=True)
class PendingDecision:
    symbol: str
    ctx: MarketContext
    baseline: AnalystResult
    created: datetime


@dataclass(slots=True)
class PendingEvaluation:
    analysis: AIAnalysis
    side: Side
    entry: float
    stop: float
    target: float
    expires: datetime


@dataclass
class CoreConfig:
    starting_balance: float = 10_000.0
    mode: TradingMode = "paper"
    base_timeframe: Timeframe = "1m"
    mtf_timeframes: tuple[str, ...] = MTF_TIMEFRAMES
    emit_market_updates: bool = True
    historical: bool = False  # bootstrap replay: notifications are created read
    defer_remote_analysis: bool = False  # live: remote analysts are awaited by the driver
    narrate: bool = True
    emit_records: bool = True  # False in backtests: no events / notifications / analyses


@dataclass
class RestoredState:
    """Trading state reloaded from the database on restart."""

    positions: list[Position] = field(default_factory=list)
    realized_total: float = 0.0
    realized_today: float = 0.0
    trades_today: int = 0
    day_start_equity: float | None = None
    peak_equity: float | None = None
    max_drawdown_pct: float = 0.0
    risk_state: RiskState | None = None
    pending_evaluations: list[AIAnalysis] = field(default_factory=list)
    regimes: dict[str, RegimeState] = field(default_factory=dict)
    latest_analysis: dict[str, AIAnalysis] = field(default_factory=dict)
    recent_trades: list[Trade] = field(default_factory=list)  # oldest first
    last_trade_at: datetime | None = None
    last_analysis_at: datetime | None = None
    day: str | None = None  # UTC date the daily numbers belong to


_EXIT_LABEL: dict[str, str] = {
    "STOP_LOSS": "stop loss",
    "TAKE_PROFIT": "take profit",
    "SIGNAL_REVERSAL": "signal reversal",
    "TIME_EXIT": "time exit",
    "KILL_SWITCH": "kill switch",
}


class TradingCore:
    def __init__(
        self,
        settings: BotSettings,
        config: CoreConfig,
        analyst: Analyst,
        sink: CoreSink | None = None,
        *,
        position_ids: Callable[[], str] = new_position_id,
        decision_ids: Callable[[], str] = new_decision_id,
    ) -> None:
        self.settings = settings
        self.config = config
        self.analyst = analyst
        self.sink: CoreSink = sink or NullSink()
        self.decision_ids = decision_ids
        self.risk = RiskManager(settings.risk, settings.execution, settings.trading)
        self.broker = PaperBroker(settings.execution, ids=position_ids)
        self.books: dict[str, CandleBook] = {}
        self.regimes: dict[str, RegimeTracker] = {}
        self.mtf: dict[str, MTFReport] = {}
        self._mtf_cache: dict[str, dict] = {}
        self.prices: dict[str, float] = {}
        self.latest_analysis: dict[str, AIAnalysis] = {}
        self.evaluations: list[PendingEvaluation] = []
        self.recent: deque[Trade] = deque(maxlen=RECENT_TRADES)
        # accounting
        self.realized_total = 0.0
        self.realized_today = 0.0
        self.trades_today = 0
        self.day: str | None = None
        self.day_start_equity = config.starting_balance
        self.peak_equity = config.starting_balance
        self.max_drawdown_pct = 0.0
        # status
        self.last_trade_at: datetime | None = None
        self.last_analysis_at: datetime | None = None
        self.last_market_update: datetime | None = None
        self.last_provider = analyst.provider
        self.last_model = analyst.model if needs_analyst(settings.trading.strategy) else baseline.MODEL_ID
        self._ai_failing = False
        self._ai_notified_at: datetime | None = None
        self._batch = Batch()
        self._risk_dirty = False

    # ------------------------------------------------------------------
    # setup
    # ------------------------------------------------------------------

    @property
    def decision_timeframe(self) -> str:
        tf = self.settings.trading.decision_timeframe
        base = self.config.base_timeframe
        return tf if TIMEFRAME_SECONDS[tf] >= TIMEFRAME_SECONDS[base] else base

    @property
    def context_timeframes(self) -> tuple[str, ...]:
        base = TIMEFRAME_SECONDS[self.config.base_timeframe]
        tfs = [tf for tf in CONTEXT_TIMEFRAMES if TIMEFRAME_SECONDS[tf] >= base]
        if self.decision_timeframe not in tfs:
            tfs.append(self.decision_timeframe)
        return tuple(tfs)

    def ensure_symbol(self, symbol: str) -> CandleBook:
        sym = normalize(symbol)
        book = self.books.get(sym)
        if book is None:
            base = self.config.base_timeframe
            book = CandleBook(sym, base, TIMEFRAMES[TIMEFRAMES.index(base) :])
            self.books[sym] = book
            self.regimes[sym] = RegimeTracker(sym)
        return book

    def warm_up(self, symbol: str, history: Mapping[str, Sequence[Candle]]) -> None:
        """Seed a symbol's candle book (no decisions, no records)."""
        book = self.ensure_symbol(symbol)
        book.warm_up(history)
        if book.last_price is not None:
            self.prices[book.symbol] = book.last_price
            for pos in self.broker.positions.values():
                if pos.symbol == book.symbol and not pos.mark:
                    pos.mark = book.last_price
        self._update_mtf(book.symbol, None)

    def apply_settings(self, settings: BotSettings) -> None:
        self.settings = settings
        self.risk.update_settings(settings.risk, settings.execution, settings.trading)
        self.broker.execution = settings.execution
        for sym in settings.trading.symbols:
            self.ensure_symbol(sym)

    def set_analyst(self, analyst: Analyst) -> None:
        self.analyst = analyst

    def restore(self, state: RestoredState, now: datetime) -> None:
        for p in state.positions:
            self.broker.positions[p.id] = OpenPosition.from_schema(p)
            self.prices.setdefault(p.symbol, p.current_price)
        self.realized_total = state.realized_total
        self.realized_today = state.realized_today
        self.trades_today = state.trades_today
        self.day = state.day or now.date().isoformat()
        equity = self.equity()
        self.day_start_equity = state.day_start_equity if state.day_start_equity is not None else equity
        self.peak_equity = max(state.peak_equity or equity, equity)
        self.max_drawdown_pct = min(state.max_drawdown_pct, 0.0)
        if state.risk_state is not None:
            self.risk.state = state.risk_state
        self.risk.roll_day(now)
        for analysis in state.pending_evaluations:
            self._track_evaluation(analysis)
        for sym, regime in state.regimes.items():
            self.ensure_symbol(sym)
            self.regimes[sym].restore(regime)
        self.latest_analysis.update(state.latest_analysis)
        self.recent.extend(state.recent_trades[-RECENT_TRADES:])
        self.last_trade_at = state.last_trade_at
        self.last_analysis_at = state.last_analysis_at

    # ------------------------------------------------------------------
    # accounting
    # ------------------------------------------------------------------

    @property
    def cash(self) -> float:
        return self.config.starting_balance + self.realized_total

    def unrealized(self) -> float:
        return sum(p.unrealized() for p in self.broker.positions.values())

    def equity(self) -> float:
        return self.cash + self.unrealized()

    def exposure(self) -> float:
        total = 0.0
        for p in self.broker.positions.values():
            total += abs(p.size * (p.mark or p.entry_price))
        for o in self.broker.orders.values():
            total += abs(o.size * o.price)
        return total

    def drawdown_pct(self, equity: float | None = None) -> float:
        eq = self.equity() if equity is None else equity
        return (eq / self.peak_equity - 1.0) * 100.0 if self.peak_equity > 0 else 0.0

    def view(self, symbol: str | None = None) -> PortfolioView:
        equity = self.equity()
        side = None
        on_symbol = 0.0
        if symbol is not None:
            pos = self.broker.position_for(symbol)
            order = self.broker.order_for(symbol)
            if pos is not None:
                side, on_symbol = pos.side, abs(pos.size * (pos.mark or pos.entry_price))
            elif order is not None:
                side, on_symbol = order.side, abs(order.size * order.price)
        return PortfolioView(
            equity=equity,
            exposure=self.exposure(),
            open_positions=len(self.broker.positions) + len(self.broker.orders),
            open_risk=sum(p.meta.risk_amount for p in self.broker.positions.values()),
            daily_pnl=equity - self.day_start_equity,
            drawdown_pct=self.drawdown_pct(equity),
            max_drawdown_pct=self.max_drawdown_pct,
            side_on_symbol=side,
            exposure_on_symbol=on_symbol,
        )

    def positions(self, now: datetime) -> list[Position]:
        return [p.to_schema(now) for p in self.broker.positions.values()]

    def portfolio(self, now: datetime) -> PortfolioState:
        equity = self.equity()
        unrealized = equity - self.cash
        exposure = sum(abs(p.size * (p.mark or p.entry_price)) for p in self.broker.positions.values())
        start = self.config.starting_balance
        total = equity - start
        today = equity - self.day_start_equity
        return PortfolioState(
            mode=self.config.mode,
            starting_balance=start,
            equity=round(equity, 2),
            cash=round(self.cash, 2),
            realized_pnl=round(self.realized_total, 2),
            unrealized_pnl=round(unrealized, 2),
            total_pnl=round(total, 2),
            total_pnl_pct=round(total / start * 100.0, 4) if start else 0.0,
            today_pnl=round(today, 2),
            today_pnl_pct=round(today / self.day_start_equity * 100.0, 4) if self.day_start_equity else 0.0,
            exposure=round(exposure, 2),
            exposure_pct=round(exposure / equity * 100.0, 4) if equity > 0 else 0.0,
            open_positions=len(self.broker.positions),
            trades_today=self.trades_today,
            peak_equity=round(self.peak_equity, 2),
            drawdown_pct=round(self.drawdown_pct(equity), 4),
            updated_at=now,
        )

    def risk_snapshot(self, now: datetime) -> RiskSnapshot:
        return self.risk.snapshot(self.view(), now)

    def performance(self) -> RecentPerformance:
        trades = list(self.recent)
        results = "".join("W" if t.result == "WIN" else "L" if t.result == "LOSS" else "B" for t in trades)
        return RecentPerformance(
            trades=len(trades),
            wins=sum(1 for t in trades if t.result == "WIN"),
            net_pnl=sum(t.pnl for t in trades),
            consecutive_losses=self.risk.state.consecutive_losses,
            last_results=results[-10:],
        )

    def next_decision_at(self, now: datetime) -> datetime:
        sec = TIMEFRAME_SECONDS[self.decision_timeframe]
        ts = int(now.timestamp())
        return _ts(ts - ts % sec + sec)

    # ------------------------------------------------------------------
    # inputs
    # ------------------------------------------------------------------

    def on_tick(self, symbol: str, price: float, now: datetime) -> None:
        """Live price update: mark to market, then limit fills, stops, targets and time exits."""
        sym = normalize(symbol)
        if price <= 0:
            return
        self._roll_day(now)
        self.prices[sym] = price
        result = self.broker.on_price(sym, price, now, self.settings.trading.max_holding_minutes)
        self._handle_fills(result.filled, now)
        self._handle_expired(result.expired, now)
        for ex in result.exits:
            self._record_exit(ex, now)
        self._after_mark(now)
        self.flush()

    def on_candle(self, symbol: str, candle: Candle) -> list[PendingDecision]:
        """A closed base-timeframe candle: bar exits, evaluations, indicators, MTF, decisions."""
        sym = normalize(symbol)
        book = self.ensure_symbol(sym)
        now = _ts(candle.time + book.base_seconds)
        last = book.series[book.base].last_time
        if last is not None and candle.time <= last:
            return []
        self._roll_day(now)
        max_hold = self.settings.trading.max_holding_minutes
        result = self.broker.on_bar(sym, candle, now, max_hold)
        self._handle_fills(result.filled, now)
        self._handle_expired(result.expired, now)
        for ex in result.exits:
            self._record_exit(ex, now)
        self._evaluate_signals(sym, candle, now)
        closed = book.add(candle)
        self.prices[sym] = candle.close
        for pos in self.broker.positions.values():
            if pos.symbol == sym:
                pos.mark = candle.close
        self._after_mark(now)
        self._update_mtf(sym, now)
        pending: list[PendingDecision] = []
        if self.decision_timeframe in closed:
            pd = self._decision_close(sym, now)
            if pd is not None:
                pending.append(pd)
        self.flush()
        return pending

    def record_equity(self, now: datetime, *, include_positions: bool = True) -> EquityRecord:
        """Equity snapshot (every 60 s live, every bar in replays); refreshes position rows."""
        self._roll_day(now)
        rec = self._equity_record(now)
        self._batch.equity.append(rec)
        if include_positions and self.config.emit_records:
            self._batch.positions.extend(self.positions(now))
        self.flush()
        return rec

    def flush(self) -> None:
        if self._risk_dirty:
            self._batch.risk_state = self.risk.state.to_dict()
            self._risk_dirty = False
        if self._batch.empty():
            return
        batch, self._batch = self._batch, Batch()
        self.sink.write(batch)

    # ------------------------------------------------------------------
    # internals: marks, day roll, limits
    # ------------------------------------------------------------------

    def _equity_record(self, now: datetime) -> EquityRecord:
        equity = self.equity()
        return EquityRecord(
            time=int(now.timestamp()),
            equity=round(equity, 4),
            cash=round(self.cash, 4),
            realized_pnl=round(self.realized_total, 4),
            unrealized_pnl=round(equity - self.cash, 4),
            exposure=round(sum(abs(p.size * (p.mark or p.entry_price)) for p in self.broker.positions.values()), 4),
            drawdown_pct=round(self.drawdown_pct(equity), 4),
        )

    def _roll_day(self, now: datetime) -> None:
        day = now.date().isoformat()
        if self.day == day:
            return
        first = self.day is None
        self.day = day
        self.day_start_equity = self.equity()
        if not first:
            self.realized_today = 0.0
            self.trades_today = 0
        if self.risk.roll_day(now):
            self._risk_dirty = True

    def _after_mark(self, now: datetime) -> None:
        equity = self.equity()
        if equity > self.peak_equity:
            self.peak_equity = equity
        dd = self.drawdown_pct(equity)
        if dd < self.max_drawdown_pct:
            self.max_drawdown_pct = dd
        alerts = self.risk.check_limits(self.view(), now)
        if alerts:
            self._risk_dirty = True
        for alert in alerts:
            self._alert(alert, now)
            if alert.kill_switch:
                self.kill_switch(now)

    def kill_switch(self, now: datetime) -> list[Trade]:
        """Close every position at market and cancel resting orders."""
        closed: list[Trade] = []
        for order in list(self.broker.orders.values()):
            self.broker.cancel(order.id)
            self._order_gone(order, now, "Kill switch")
        for pos in list(self.broker.positions.values()):
            price = self.prices.get(pos.symbol, pos.mark or pos.entry_price)
            ex = self.broker.close(pos.id, price, now, "KILL_SWITCH")
            self._record_exit(ex, now)
            closed.append(ex.trade)
        return closed

    def _alert(self, alert: RiskAlert, now: datetime) -> None:
        self._event(
            "RISK_WARNING",
            alert.title,
            alert.message,
            now,
            severity=alert.severity,  # type: ignore[arg-type]
            data={"meter": alert.meter, "current": alert.current, "limit": alert.limit},
        )
        self._notify(alert.notification, alert.title, alert.message, now, severity=alert.severity, data={"meter": alert.meter})  # type: ignore[arg-type]

    # ------------------------------------------------------------------
    # internals: records
    # ------------------------------------------------------------------

    def _event(
        self,
        type_: EventType,
        title: str,
        message: str,
        ts: datetime,
        *,
        severity: Severity = "info",
        symbol: str | None = None,
        data: dict[str, Any] | None = None,
    ) -> None:
        if self.config.emit_records:
            self._batch.events.append(EventRecord(type_, title, message, ts, severity, symbol, data or {}))

    def _notify(
        self,
        type_: NotificationType,
        title: str,
        message: str,
        ts: datetime,
        *,
        severity: Severity = "info",
        data: dict[str, Any] | None = None,
    ) -> None:
        if self.config.emit_records:
            self._batch.notifications.append(
                NotificationRecord(type_, title, message, ts, severity, data or {}, read=self.config.historical)
            )

    def _record_exit(self, ex: Exit, now: datetime) -> None:
        trade = ex.trade
        self.realized_total += trade.pnl
        self.realized_today += trade.pnl
        self.last_trade_at = now
        self.recent.append(trade)
        self._batch.closed.append(trade)
        alerts = self.risk.on_trade_closed(trade.pnl, now)
        self._risk_dirty = True
        reason = ex.reason
        label = _EXIT_LABEL[reason]
        msg = (
            f"Exit {fmt_price(trade.exit_price)} · P&L {fmt_usd(trade.pnl, signed=True)} "
            f"({fmt_pct(trade.pnl_pct, signed=True)}) · {trade.r_multiple:+.1f}R"
        )
        data = {
            "trade_id": trade.id,
            "side": trade.side,
            "exit_price": trade.exit_price,
            "pnl": trade.pnl,
            "pnl_pct": trade.pnl_pct,
            "exit_reason": reason,
        }
        win = trade.result == "WIN"
        if reason == "STOP_LOSS":
            event_type: EventType = "STOP_LOSS"
            title = f"Stop loss hit · {trade.symbol} {trade.side}"
            severity: Severity = "warning"
            notif: NotificationType = "STOP_LOSS_HIT"
            notif_title = f"Stop loss hit on {trade.symbol}"
        elif reason == "TAKE_PROFIT":
            event_type, title, severity = "TAKE_PROFIT", f"Take profit hit · {trade.symbol} {trade.side}", "success"
            notif, notif_title = "TAKE_PROFIT_HIT", f"Take profit hit on {trade.symbol}"
        else:
            event_type = "TRADE_CLOSED"
            title = f"{trade.symbol} {trade.side} closed ({label})"
            severity = "error" if reason == "KILL_SWITCH" else ("success" if win else "warning")
            notif, notif_title = "TRADE_CLOSED", f"{trade.side} {trade.symbol} closed — {label}"
        self._event(event_type, title, msg, now, severity=severity, symbol=trade.symbol, data=data)
        self._notify(notif, notif_title, msg, now, severity=severity, data={**data, "symbol": trade.symbol})
        self._batch.equity.append(self._equity_record(now))
        for alert in alerts:
            self._alert(alert, now)

    def _track_evaluation(self, analysis: AIAnalysis) -> None:
        if analysis.evaluation.status != "PENDING" or analysis.signal == "HOLD":
            return
        if analysis.entry is None or analysis.stop_loss is None or analysis.take_profit is None:
            return
        horizon = timedelta(minutes=self.settings.trading.max_holding_minutes)
        self.evaluations.append(
            PendingEvaluation(
                analysis=analysis,
                side=analysis.signal,  # type: ignore[arg-type]
                entry=analysis.entry,
                stop=analysis.stop_loss,
                target=analysis.take_profit,
                expires=analysis.created_at + horizon,
            )
        )

    def _evaluate_signals(self, symbol: str, bar: Candle, now: datetime) -> None:
        """Shadow-evaluate pending directional signals on this bar (stop first if both touched)."""
        if not self.evaluations:
            return
        bar_open = _ts(bar.time)
        keep: list[PendingEvaluation] = []
        for ev in self.evaluations:
            if ev.analysis.symbol != symbol or ev.analysis.created_at > bar_open:
                keep.append(ev)
                continue
            long = ev.side == "LONG"
            d = 1.0 if long else -1.0
            hit_sl = bar.low <= ev.stop if long else bar.high >= ev.stop
            hit_tp = bar.high >= ev.target if long else bar.low <= ev.target
            if hit_sl:
                status, hit, ret = "INCORRECT", "SL", (ev.stop / ev.entry - 1.0) * 100.0 * d
            elif hit_tp:
                status, hit, ret = "CORRECT", "TP", (ev.target / ev.entry - 1.0) * 100.0 * d
            elif now >= ev.expires:
                status, hit, ret = "EXPIRED", "HORIZON", (bar.close / ev.entry - 1.0) * 100.0 * d
            else:
                keep.append(ev)
                continue
            updated = ev.analysis.model_copy(
                update={
                    "evaluation": SignalEvaluation(
                        status=status,  # type: ignore[arg-type]
                        resolved_at=now,
                        return_pct=round(ret, 4),
                        hit=hit,  # type: ignore[arg-type]
                    )
                }
            )
            self._replace_analysis(updated)
        self.evaluations = keep

    def _replace_analysis(self, analysis: AIAnalysis) -> None:
        if self.latest_analysis.get(analysis.symbol, analysis).id == analysis.id:
            self.latest_analysis[analysis.symbol] = analysis
        for ev in self.evaluations:
            if ev.analysis.id == analysis.id:
                ev.analysis = analysis
        if self.config.emit_records:
            self._batch.analyses.append(analysis)

    def _update_mtf(self, symbol: str, now: datetime | None) -> None:
        book = self.books[symbol]
        tfs = self.config.mtf_timeframes
        features = {tf: book.features(tf) for tf in tfs if tf in book.series}
        ts = now or (_ts(book.end_time) if book.end_time else datetime.now(UTC))
        report = build_report(symbol, features, ts, tfs, self._mtf_cache.setdefault(symbol, {}))
        if report is not None:
            self.mtf[symbol] = report
            if now is not None and self.config.emit_records:
                self._batch.mtf.append(report)

    def _handle_fills(self, filled: list[OpenPosition], now: datetime) -> None:
        for pos in filled:
            self.trades_today += 1
            self.last_trade_at = now
            analysis = self._analysis_by_id(pos.meta.analysis_id)
            if analysis is not None:
                self._replace_analysis(analysis.model_copy(update={"trade_id": pos.id}))
            self._executed_records(pos, now, pos.meta.analysis_id)
            if self.config.emit_records:
                self._batch.positions.append(pos.to_schema(now))

    def _handle_expired(self, expired: list[LimitOrder], now: datetime) -> None:
        for order in expired:
            self._order_gone(order, now, "Limit order expired")

    def _order_gone(self, order: LimitOrder, now: datetime, reason: str) -> None:
        self._event(
            "TRADE_REJECTED",
            f"{order.side} {order.symbol} limit order cancelled",
            f"{reason}: {fmt_qty(order.size, order.symbol, order.price)} @ {fmt_price(order.price)} did not fill",
            now,
            severity="warning",
            symbol=order.symbol,
            data={"analysis_id": order.meta.analysis_id, "reasons": [reason]},
        )

    def _analysis_by_id(self, analysis_id: str | None) -> AIAnalysis | None:
        if analysis_id is None:
            return None
        for a in self.latest_analysis.values():
            if a.id == analysis_id:
                return a
        for ev in self.evaluations:
            if ev.analysis.id == analysis_id:
                return ev.analysis
        return None

    def _executed_records(self, pos: OpenPosition, now: datetime, analysis_id: str | None) -> None:
        qty = fmt_qty(pos.size, pos.symbol, pos.entry_price)
        msg = (
            f"{qty} @ {fmt_price(pos.entry_price)} · SL {fmt_price(pos.stop_loss, compact=True)} · "
            f"TP {fmt_price(pos.take_profit, compact=True)}"
        )
        self._event(
            "TRADE_EXECUTED",
            f"{pos.side} {pos.symbol} executed",
            msg,
            now,
            severity="success",
            symbol=pos.symbol,
            data={
                "analysis_id": analysis_id,
                "position_id": pos.id,
                "side": pos.side,
                "price": pos.entry_price,
                "size": pos.size,
                "notional": round(pos.notional, 2),
                "stop_loss": pos.stop_loss,
                "take_profit": pos.take_profit,
            },
        )
        conf = f" · confidence {pos.meta.ai_confidence:.0f}%" if pos.meta.ai_confidence is not None else ""
        self._notify(
            "TRADE_OPENED",
            f"{pos.side} {pos.symbol} opened",
            msg + conf,
            now,
            severity="success",
            data={"position_id": pos.id, "symbol": pos.symbol, "side": pos.side, "analysis_id": analysis_id},
        )

    # ------------------------------------------------------------------
    # decisions
    # ------------------------------------------------------------------

    def context(self, symbol: str, now: datetime) -> MarketContext | None:
        book = self.books[symbol]
        tf = self.decision_timeframe
        decision = book.features(tf)
        if decision is None:
            return None
        features = {}
        snapshots = {}
        for t in self.context_timeframes:
            feat = book.features(t)
            if feat is not None:
                features[t] = feat
                snapshots[t] = book.snapshot(t)
        pos = self.broker.position_for(symbol)
        regime = self.regimes[symbol].state or RegimeState(
            symbol=symbol, regime="UNKNOWN", confidence=0.0, since=None, metrics={}, updated_at=now
        )
        return MarketContext(
            symbol=symbol,
            timeframe=tf,  # type: ignore[arg-type]
            ts=now,
            price=book.last_price or decision.price,
            features=features,
            snapshots=snapshots,  # type: ignore[arg-type]
            mtf=self.mtf.get(symbol),
            regime=regime,
            candles=book.candles(tf, CONTEXT_CANDLES),
            position=pos.to_schema(now) if pos is not None else None,
            equity=self.equity(),
            settings=self.settings,
            performance=self.performance(),
            narrate=self.config.narrate,
        )

    def _decision_close(self, symbol: str, now: datetime) -> PendingDecision | None:
        book = self.books[symbol]
        tf = self.decision_timeframe
        feats = book.features(tf)
        tracker = self.regimes[symbol]
        state, switched = tracker.update(classify(feats), now)
        if self.config.emit_records:
            self._batch.regimes.append((state, switched))
        self.last_market_update = now
        if self.config.emit_market_updates and feats is not None:
            change = feats.change_pct
            self._event(
                "MARKET_UPDATE",
                f"{symbol} {tf} close",
                f"{fmt_price(feats.price)} ({fmt_pct(change, signed=True)}) · {state.regime.replace('_', ' ').lower()}",
                now,
                symbol=symbol,
                data={"timeframe": tf, "close": feats.price, "change_pct": round(change, 4) if change is not None else None},
            )
        if symbol not in self.settings.trading.symbols:
            return None  # still managing an open position on a removed symbol, but no new calls
        ctx = self.context(symbol, now)
        if ctx is None:
            return None
        base = baseline.evaluate(ctx)
        strategy = self.settings.trading.strategy
        if not needs_analyst(strategy):
            self._finalize(ctx, base, base, None, now)
            return None
        if self.config.defer_remote_analysis and self.analyst.is_remote:
            return PendingDecision(symbol, ctx, base, now)
        result = self.analyst.analyze(ctx)
        self._finalize(ctx, decide(strategy, result, base), base, result, now)
        return None

    def complete(self, pending: PendingDecision, result: AnalystResult, now: datetime) -> AIAnalysis | None:
        """Finish a deferred decision with the analyst's answer (live, remote analysts)."""
        self._roll_day(now)
        ctx = pending.ctx
        ctx.price = self.prices.get(pending.symbol, ctx.price)
        pos = self.broker.position_for(pending.symbol)
        ctx.position = pos.to_schema(now) if pos is not None else None
        ctx.equity = self.equity()
        analysis = self._finalize(ctx, decide(self.settings.trading.strategy, result, pending.baseline), pending.baseline, result, now)
        self.flush()
        return analysis

    def _finalize(
        self,
        ctx: MarketContext,
        final: AnalystResult,
        base: AnalystResult,
        analyst_result: AnalystResult | None,
        now: datetime,
    ) -> AIAnalysis:
        symbol = ctx.symbol
        analysis_id = self.decision_ids()
        self.last_analysis_at = now
        self.last_provider = final.provider
        self.last_model = final.model
        trace = analyst_result if analyst_result is not None else final
        if trace.usage and self.config.emit_records:
            self._batch.usage.extend(trace.usage)
        self._ai_health(trace, symbol, now)

        signal = final.signal
        events: list[tuple[EventType, str, str, Severity, dict[str, Any]]] = []
        trade_id: str | None = None
        risk_decision: RiskDecision
        if signal == "HOLD":
            risk_decision = self.risk.not_applicable()
        else:
            side: Side = signal  # type: ignore[assignment]
            assessment = self.risk.assess(
                side=side,
                confidence=final.confidence,
                price=ctx.price,
                entry=final.entry,
                stop=final.stop_loss,
                target=final.take_profit,
                view=self.view(symbol),
                now=now,
            )
            risk_decision = assessment.decision
            if risk_decision.status == "REJECTED":
                self._risk_dirty = True
            rr = final.risk_reward
            events.append(
                (
                    "TRADE_SIGNAL",
                    f"{signal} signal on {symbol}",
                    f"Confidence {final.confidence:.0f}% · entry {fmt_price(final.entry)} · SL "
                    f"{fmt_price(final.stop_loss, compact=True)} · TP {fmt_price(final.take_profit, compact=True)}"
                    + (f" · R/R {rr:.1f}" if rr is not None else ""),
                    "info",
                    {"analysis_id": analysis_id, "signal": signal, "confidence": final.confidence},
                )
            )
            events.append(self._risk_event(analysis_id, risk_decision, assessment.sizing, symbol, side))
            if assessment.reverse:
                self._reverse(symbol, now)
            if risk_decision.status == "APPROVED" and assessment.sizing is not None:
                trade_id = self._enter(ctx, final, side, assessment.sizing.size, analysis_id, now)
            elif risk_decision.status == "REJECTED":
                events.append(
                    (
                        "TRADE_REJECTED",
                        f"{signal} {symbol} rejected",
                        " · ".join(risk_decision.reasons),
                        "warning",
                        {"analysis_id": analysis_id, "reasons": list(risk_decision.reasons)},
                    )
                )

        snapshot = ctx.snapshots[ctx.timeframe]
        mtf = ctx.mtf.timeframes if ctx.mtf is not None else []
        directional = signal != "HOLD" and None not in (final.entry, final.stop_loss, final.take_profit)
        analysis = AIAnalysis(
            id=analysis_id,
            symbol=symbol,
            timeframe=ctx.timeframe,
            created_at=now,
            signal=signal,
            confidence=round(final.confidence, 1),
            regime=ctx.regime.regime,
            regime_confidence=ctx.regime.confidence,
            price=ctx.price,
            entry=final.entry,
            stop_loss=final.stop_loss,
            take_profit=final.take_profit,
            risk_reward=final.risk_reward,
            summary=final.summary,
            reasons=final.reasons,
            risks=final.risks,
            invalidation=final.invalidation,
            detailed_reasoning=final.detailed_reasoning,
            indicators=snapshot,
            mtf=mtf,
            strategy=self.settings.trading.strategy,
            baseline_signal=base.signal,
            provider=final.provider,
            model=final.model,
            latency_ms=trace.latency_ms,
            prompt_tokens=trace.prompt_tokens,
            completion_tokens=trace.completion_tokens,
            cost_usd=trace.cost_usd,
            fallback_reason=trace.fallback_reason,
            risk=risk_decision,
            trade_id=trade_id,
            evaluation=SignalEvaluation(status="PENDING" if directional else "NOT_APPLICABLE"),
        )
        self.latest_analysis[symbol] = analysis
        self._track_evaluation(analysis)
        if self.config.emit_records:
            self._batch.analyses.append(analysis)
            # the analysis row precedes its events; its events precede the position's
            self._batch.events.insert(
                len(self._batch.events) - self._pending_entry_events,
                EventRecord(
                    "AI_ANALYSIS",
                    f"{symbol}: {signal} at {final.confidence:.0f}% confidence",
                    final.summary,
                    now,
                    "info",
                    symbol,
                    {
                        "analysis_id": analysis_id,
                        "signal": signal,
                        "confidence": final.confidence,
                        "provider": final.provider,
                        "model": final.model,
                    },
                ),
            )
            insert_at = len(self._batch.events) - self._pending_entry_events
            for offset, (etype, title, message, severity, data) in enumerate(events):
                self._batch.events.insert(insert_at + offset, EventRecord(etype, title, message, now, severity, symbol, data))
        self._pending_entry_events = 0
        return analysis

    _pending_entry_events = 0  # events already queued by _enter/_reverse for the current decision

    def _risk_event(
        self, analysis_id: str, decision: RiskDecision, sizing: Any, symbol: str, side: Side
    ) -> tuple[EventType, str, str, Severity, dict[str, Any]]:
        data = {"analysis_id": analysis_id, "status": decision.status, "reasons": list(decision.reasons)}
        if decision.status == "APPROVED" and sizing is not None:
            msg = (
                f"All {len(decision.checks)} checks passed · {fmt_qty(sizing.size, symbol, sizing.fill_price)} "
                f"({fmt_usd(sizing.notional)}) · risk {fmt_usd(sizing.risk_amount)} ({fmt_pct(sizing.risk_pct)})"
            )
            if self.settings.execution.order_type == "limit":
                msg += " · limit order"
            return "RISK_CHECK", "Risk check passed", msg, "success", data
        if decision.status == "NOT_APPLICABLE":
            return "RISK_CHECK", f"Already {side} {symbol}", "Position already open in this direction; holding it", "info", data
        failed = [c for c in decision.checks if not c.passed and c.value is not None]
        parts = [f"{c.name}: {c.value} (needs {c.limit})" if c.limit else f"{c.name}: {c.value}" for c in failed[:3]]
        return "RISK_CHECK", "Risk check failed", " · ".join(parts) or " · ".join(decision.reasons), "warning", data

    def _reverse(self, symbol: str, now: datetime) -> None:
        order = self.broker.order_for(symbol)
        if order is not None:
            self.broker.cancel(order.id)
            self._order_gone(order, now, "Cancelled by an opposite signal")
            self._pending_entry_events += 1
        pos = self.broker.position_for(symbol)
        if pos is not None:
            before = len(self._batch.events)
            ex = self.broker.close(pos.id, self.prices.get(symbol, pos.mark), now, "SIGNAL_REVERSAL")
            self._record_exit(ex, now)
            self._pending_entry_events += len(self._batch.events) - before

    def _enter(self, ctx: MarketContext, final: AnalystResult, side: Side, size: float, analysis_id: str, now: datetime) -> str | None:
        assert final.stop_loss is not None and final.take_profit is not None
        sizing_risk = self.risk.per_unit_loss(self.risk.fill_estimate(side, ctx.price, final.entry or ctx.price), final.stop_loss) * size
        equity = self.equity()
        meta = EntryMeta(
            risk_amount=sizing_risk,
            risk_pct=sizing_risk / equity * 100.0 if equity > 0 else 0.0,
            strategy=self.settings.trading.strategy,
            regime=ctx.regime.regime,
            order_type=self.settings.execution.order_type,
            analysis_id=analysis_id,
            ai_confidence=round(final.confidence, 1),
            entry_reason=final.summary[:280],
        )
        before = len(self._batch.events)
        if self.settings.execution.order_type == "limit" and final.entry is not None:
            placed = self.broker.place_limit(
                ctx.symbol, side, size, final.entry, ctx.price, final.stop_loss, final.take_profit, now, meta
            )
            if isinstance(placed, LimitOrder):
                return None
            pos = placed
        else:
            pos = self.broker.open_market(ctx.symbol, side, size, ctx.price, final.stop_loss, final.take_profit, now, meta)
        self.trades_today += 1
        self.last_trade_at = now
        self._executed_records(pos, now, analysis_id)
        self._pending_entry_events += len(self._batch.events) - before
        if self.config.emit_records:
            self._batch.positions.append(pos.to_schema(now))
        return pos.id

    def _ai_health(self, result: AnalystResult, symbol: str, now: datetime) -> None:
        """API_ERROR per failing analysis, AI_UNAVAILABLE at most every 30 min, SYSTEM_INFO on recovery."""
        if result.errors:
            last = result.errors[-1]
            model, _, error = last.partition(": ")
            answered = result.provider == "openrouter" and result.fallback_reason is None and result.signal is not None
            ok = answered and not (result.signal == "HOLD" and result.confidence == 0.0 and result.reasons[:1] and "unavailable" in result.summary.lower())
            self._event(
                "API_ERROR",
                "OpenRouter request failed" if not ok else "OpenRouter request retried",
                f"{model}: {error}" + (" — answered by heuristic-v1" if result.fallback_reason else ""),
                now,
                severity="warning" if ok else "error",
                symbol=symbol,
                data={"provider": "openrouter", "model": model, "error": error},
            )
        degraded = result.fallback_reason is not None or (
            result.provider == "openrouter" and bool(result.errors) and result.confidence == 0.0 and result.signal == "HOLD"
        )
        if degraded:
            if not self._ai_failing or self._ai_notified_at is None or now - self._ai_notified_at >= AI_UNAVAILABLE_EVERY:
                self._notify(
                    "AI_UNAVAILABLE",
                    "AI analyst unavailable",
                    (result.fallback_reason or "OpenRouter did not answer")
                    + (". The local heuristic is answering meanwhile." if result.fallback_reason else "."),
                    now,
                    severity="warning",
                    data={"provider": "openrouter"},
                )
                self._ai_notified_at = now
            self._ai_failing = True
        elif result.provider == "openrouter" and self._ai_failing:
            self._ai_failing = False
            self._event(
                "SYSTEM_INFO",
                "AI analyst recovered",
                f"OpenRouter ({result.model}) is answering again.",
                now,
                severity="success",
                data={"component": "ai"},
            )
