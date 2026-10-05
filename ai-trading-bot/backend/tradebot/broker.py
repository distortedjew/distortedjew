"""Paper broker: simulated fills, fees, slippage, stops, targets and time exits.

- Market orders fill at the reference price moved ``slippage_bps`` against us; ``fee_bps``
  is charged on the entry and on the exit notional.
- Limit orders (``order_type=limit``) rest at the analyst's entry price and expire after
  ``limit_order_timeout_minutes``; a marketable limit fills at once at the market (with
  slippage, never worse than the limit). Resting orders fill at the limit, or at the bar's
  open when it gaps through the limit (the better price).
- Stops fill at the stop level or the gapped price, whichever is worse, then slippage.
  Targets fill at the target. In bar replay a candle touching both stop and target counts
  as the stop (the conservative assumption).
- Positions also close on ``max_holding_minutes`` (``TIME_EXIT``), on an opposite signal
  (``SIGNAL_REVERSAL``) and on the daily-loss kill switch (``KILL_SWITCH``), at market.

Accounting: the entry fee is part of a position's unrealized P&L (as ``schemas.Position``
defines it), so ``equity = cash + Σ unrealized`` with ``cash = starting balance + realized``.
"""

from __future__ import annotations

import secrets
from collections.abc import Callable
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta

from .analytics.metrics import classify
from .schemas import Candle, ExecutionSettings, ExitReason, OrderType, Position, Regime, Side, StrategyName, Trade


def new_position_id() -> str:
    return f"pos_{secrets.token_hex(6)}"


@dataclass(slots=True)
class EntryMeta:
    """Descriptive fields a position carries from the decision that opened it."""

    risk_amount: float
    risk_pct: float
    strategy: StrategyName
    regime: Regime
    order_type: OrderType = "market"
    analysis_id: str | None = None
    ai_confidence: float | None = None
    entry_reason: str = ""


@dataclass(slots=True)
class OpenPosition:
    id: str
    symbol: str
    side: Side
    size: float
    entry_price: float
    stop_loss: float
    take_profit: float
    opened_at: datetime
    entry_fee: float
    meta: EntryMeta
    mark: float = 0.0
    best: float = 0.0  # most favourable price seen
    worst: float = 0.0  # most adverse price seen

    @property
    def direction(self) -> float:
        return 1.0 if self.side == "LONG" else -1.0

    @property
    def notional(self) -> float:
        return self.size * self.entry_price

    def gross(self, price: float) -> float:
        return (price - self.entry_price) * self.size * self.direction

    def unrealized(self, price: float | None = None) -> float:
        return self.gross(self.mark if price is None else price) - self.entry_fee

    def observe(self, high: float, low: float) -> None:
        if self.side == "LONG":
            self.best, self.worst = max(self.best, high), min(self.worst, low)
        else:
            self.best, self.worst = min(self.best, low), max(self.worst, high)

    @property
    def mfe_pct(self) -> float:
        return max(0.0, (self.best - self.entry_price) / self.entry_price * 100.0 * self.direction)

    @property
    def mae_pct(self) -> float:
        return min(0.0, (self.worst - self.entry_price) / self.entry_price * 100.0 * self.direction)

    def to_schema(self, now: datetime) -> Position:
        upnl = self.unrealized()
        notional = self.notional
        mark = self.mark or self.entry_price
        return Position(
            id=self.id,
            symbol=self.symbol,
            side=self.side,
            size=self.size,
            notional=round(notional, 2),
            entry_price=self.entry_price,
            current_price=mark,
            stop_loss=self.stop_loss,
            take_profit=self.take_profit,
            unrealized_pnl=round(upnl, 4),
            unrealized_pnl_pct=round(upnl / notional * 100.0, 4) if notional else 0.0,
            r_multiple=round(upnl / self.meta.risk_amount, 3) if self.meta.risk_amount > 0 else 0.0,
            fees_paid=round(self.entry_fee, 4),
            risk_amount=round(self.meta.risk_amount, 2),
            risk_pct=round(self.meta.risk_pct, 4),
            opened_at=self.opened_at,
            duration_sec=max(0, int((now - self.opened_at).total_seconds())),
            ai_confidence=self.meta.ai_confidence,
            analysis_id=self.meta.analysis_id,
            strategy=self.meta.strategy,
            regime=self.meta.regime,
            order_type=self.meta.order_type,
            entry_reason=self.meta.entry_reason,
            mfe_pct=round(self.mfe_pct, 4),
            mae_pct=round(self.mae_pct, 4),
            distance_to_sl_pct=round(abs(mark - self.stop_loss) / mark * 100.0, 4) if mark else 0.0,
            distance_to_tp_pct=round(abs(self.take_profit - mark) / mark * 100.0, 4) if mark else 0.0,
        )

    @classmethod
    def from_schema(cls, p: Position) -> OpenPosition:
        """Rebuild from a persisted ``Position`` (restart recovery)."""
        meta = EntryMeta(
            risk_amount=p.risk_amount,
            risk_pct=p.risk_pct,
            strategy=p.strategy,
            regime=p.regime,
            order_type=p.order_type,
            analysis_id=p.analysis_id,
            ai_confidence=p.ai_confidence,
            entry_reason=p.entry_reason,
        )
        d = 1.0 if p.side == "LONG" else -1.0
        best = p.entry_price * (1.0 + d * p.mfe_pct / 100.0)
        worst = p.entry_price * (1.0 + d * p.mae_pct / 100.0)
        return cls(
            id=p.id,
            symbol=p.symbol,
            side=p.side,
            size=p.size,
            entry_price=p.entry_price,
            stop_loss=p.stop_loss,
            take_profit=p.take_profit,
            opened_at=p.opened_at,
            entry_fee=p.fees_paid,
            meta=meta,
            mark=p.current_price,
            best=best,
            worst=worst,
        )


@dataclass(slots=True)
class LimitOrder:
    id: str  # the position id the fill will use
    symbol: str
    side: Side
    size: float
    price: float
    stop_loss: float
    take_profit: float
    created_at: datetime
    expires_at: datetime
    meta: EntryMeta


@dataclass(slots=True)
class Exit:
    """A closed round trip, ready to persist."""

    trade: Trade
    position: OpenPosition
    reason: ExitReason


@dataclass(slots=True)
class BarResult:
    filled: list[OpenPosition] = field(default_factory=list)
    expired: list[LimitOrder] = field(default_factory=list)
    exits: list[Exit] = field(default_factory=list)


class PaperBroker:
    def __init__(self, execution: ExecutionSettings, *, ids: Callable[[], str] = new_position_id) -> None:
        self.execution = execution
        self.ids = ids
        self.positions: dict[str, OpenPosition] = {}
        self.orders: dict[str, LimitOrder] = {}

    # -- costs ---------------------------------------------------------------

    @property
    def fee_rate(self) -> float:
        return self.execution.fee_bps / 10_000.0

    @property
    def slip_rate(self) -> float:
        return self.execution.slippage_bps / 10_000.0

    def _slipped(self, price: float, buying: bool) -> float:
        return price * (1.0 + self.slip_rate) if buying else price * (1.0 - self.slip_rate)

    # -- queries ---------------------------------------------------------------

    def position_for(self, symbol: str) -> OpenPosition | None:
        return next((p for p in self.positions.values() if p.symbol == symbol), None)

    def order_for(self, symbol: str) -> LimitOrder | None:
        return next((o for o in self.orders.values() if o.symbol == symbol), None)

    # -- entries ---------------------------------------------------------------

    def _fill(
        self,
        pos_id: str,
        symbol: str,
        side: Side,
        size: float,
        price: float,
        stop: float,
        target: float,
        now: datetime,
        meta: EntryMeta,
    ) -> OpenPosition:
        pos = OpenPosition(
            id=pos_id,
            symbol=symbol,
            side=side,
            size=size,
            entry_price=price,
            stop_loss=stop,
            take_profit=target,
            opened_at=now,
            entry_fee=size * price * self.fee_rate,
            meta=meta,
            mark=price,
            best=price,
            worst=price,
        )
        self.positions[pos.id] = pos
        return pos

    def open_market(
        self,
        symbol: str,
        side: Side,
        size: float,
        price: float,
        stop: float,
        target: float,
        now: datetime,
        meta: EntryMeta,
        *,
        pos_id: str | None = None,
    ) -> OpenPosition:
        fill = self._slipped(price, buying=side == "LONG")
        return self._fill(pos_id or self.ids(), symbol, side, size, fill, stop, target, now, meta)

    def place_limit(
        self,
        symbol: str,
        side: Side,
        size: float,
        limit: float,
        market: float,
        stop: float,
        target: float,
        now: datetime,
        meta: EntryMeta,
    ) -> OpenPosition | LimitOrder:
        """Rest a limit order, or fill it at once when it is marketable."""
        pos_id = self.ids()
        meta = replace(meta, order_type="limit")
        marketable = market <= limit if side == "LONG" else market >= limit
        if marketable:
            fill = self._slipped(market, buying=side == "LONG")
            fill = min(fill, limit) if side == "LONG" else max(fill, limit)
            return self._fill(pos_id, symbol, side, size, fill, stop, target, now, meta)
        order = LimitOrder(
            id=pos_id,
            symbol=symbol,
            side=side,
            size=size,
            price=limit,
            stop_loss=stop,
            take_profit=target,
            created_at=now,
            expires_at=now + timedelta(minutes=self.execution.limit_order_timeout_minutes),
            meta=meta,
        )
        self.orders[order.id] = order
        return order

    def cancel(self, order_id: str) -> LimitOrder | None:
        return self.orders.pop(order_id, None)

    # -- exits -------------------------------------------------------------------

    def close(self, pos_id: str, price: float, now: datetime, reason: ExitReason, *, at_market: bool = True) -> Exit:
        """Close at ``price`` (market closes pay slippage, targets/stops pass their own fill)."""
        pos = self.positions.pop(pos_id)
        fill = self._slipped(price, buying=pos.side == "SHORT") if at_market else price
        pos.mark = fill
        pos.observe(fill, fill)
        exit_fee = pos.size * fill * self.fee_rate
        gross = pos.gross(fill)
        pnl = gross - pos.entry_fee - exit_fee
        notional = pos.notional
        trade = Trade(
            id=pos.id,
            symbol=pos.symbol,
            side=pos.side,
            size=pos.size,
            notional=round(notional, 2),
            entry_price=pos.entry_price,
            exit_price=round(fill, 10),
            stop_loss=pos.stop_loss,
            take_profit=pos.take_profit,
            opened_at=pos.opened_at,
            closed_at=now,
            duration_sec=max(0, int((now - pos.opened_at).total_seconds())),
            pnl=round(pnl, 4),
            pnl_pct=round(pnl / notional * 100.0, 4) if notional else 0.0,
            gross_pnl=round(gross, 4),
            fees=round(pos.entry_fee + exit_fee, 4),
            result=classify(pnl),
            exit_reason=reason,
            r_multiple=round(pnl / pos.meta.risk_amount, 3) if pos.meta.risk_amount > 0 else 0.0,
            ai_confidence=pos.meta.ai_confidence,
            analysis_id=pos.meta.analysis_id,
            strategy=pos.meta.strategy,
            regime=pos.meta.regime,
            entry_reason=pos.meta.entry_reason,
            mfe_pct=round(pos.mfe_pct, 4),
            mae_pct=round(pos.mae_pct, 4),
        )
        return Exit(trade, pos, reason)

    def _stop_fill(self, pos: OpenPosition, reference: float) -> float:
        """Stop level or the gapped reference, whichever is worse, then slippage."""
        level = min(pos.stop_loss, reference) if pos.side == "LONG" else max(pos.stop_loss, reference)
        return self._slipped(level, buying=pos.side == "SHORT")

    def _timed_out(self, pos: OpenPosition, now: datetime, max_holding_minutes: int) -> bool:
        return now - pos.opened_at >= timedelta(minutes=max_holding_minutes)

    def on_price(self, symbol: str, price: float, now: datetime, max_holding_minutes: int) -> BarResult:
        """Tick: mark, fill resting limits, check stops / targets / time exits / expiries."""
        out = BarResult()
        for order in [o for o in self.orders.values() if o.symbol == symbol]:
            if now >= order.expires_at:
                out.expired.append(self.orders.pop(order.id))
            elif (order.side == "LONG" and price <= order.price) or (order.side == "SHORT" and price >= order.price):
                self.orders.pop(order.id)
                out.filled.append(
                    self._fill(order.id, symbol, order.side, order.size, order.price, order.stop_loss, order.take_profit, now, order.meta)
                )
        for pos in [p for p in self.positions.values() if p.symbol == symbol]:
            pos.mark = price
            pos.observe(price, price)
            long = pos.side == "LONG"
            if (long and price <= pos.stop_loss) or (not long and price >= pos.stop_loss):
                ex = self.close(pos.id, self._stop_fill(pos, price), now, "STOP_LOSS", at_market=False)
                out.exits.append(ex)
            elif (long and price >= pos.take_profit) or (not long and price <= pos.take_profit):
                out.exits.append(self.close(pos.id, pos.take_profit, now, "TAKE_PROFIT", at_market=False))
            elif self._timed_out(pos, now, max_holding_minutes):
                out.exits.append(self.close(pos.id, price, now, "TIME_EXIT"))
        return out

    def on_bar(self, symbol: str, bar: Candle, now: datetime, max_holding_minutes: int) -> BarResult:
        """Bar replay: limit fills, then stops/targets (both touched → stop), then time exits.

        Only orders and positions that existed before the bar opened are checked, so an entry
        made at a bar's close is never judged against that bar's own range.
        """
        out = BarResult()
        bar_open = datetime.fromtimestamp(bar.time, now.tzinfo)
        for order in [o for o in self.orders.values() if o.symbol == symbol and o.created_at <= bar_open]:
            touched = bar.low <= order.price if order.side == "LONG" else bar.high >= order.price
            if touched:
                self.orders.pop(order.id)
                fill = min(bar.open, order.price) if order.side == "LONG" else max(bar.open, order.price)
                pos = self._fill(order.id, symbol, order.side, order.size, fill, order.stop_loss, order.take_profit, now, order.meta)
                pos.opened_at = bar_open if bar_open > order.created_at else order.created_at
                out.filled.append(pos)
                # the rest of the fill bar may already have hit the stop (conservative)
                stopped = bar.low <= pos.stop_loss if pos.side == "LONG" else bar.high >= pos.stop_loss
                pos.observe(bar.high, bar.low)
                if stopped:
                    out.exits.append(self.close(pos.id, self._stop_fill(pos, pos.stop_loss), now, "STOP_LOSS", at_market=False))
            elif now >= order.expires_at:
                out.expired.append(self.orders.pop(order.id))
        for pos in [p for p in self.positions.values() if p.symbol == symbol and p.opened_at <= bar_open]:
            long = pos.side == "LONG"
            hit_stop = bar.low <= pos.stop_loss if long else bar.high >= pos.stop_loss
            hit_target = bar.high >= pos.take_profit if long else bar.low <= pos.take_profit
            if hit_stop:
                pos.observe(bar.high, bar.low)
                out.exits.append(self.close(pos.id, self._stop_fill(pos, bar.open), now, "STOP_LOSS", at_market=False))
            elif hit_target:
                pos.observe(bar.high, bar.low)
                out.exits.append(self.close(pos.id, pos.take_profit, now, "TAKE_PROFIT", at_market=False))
            else:
                pos.observe(bar.high, bar.low)
                pos.mark = bar.close
                if self._timed_out(pos, now, max_holding_minutes):
                    out.exits.append(self.close(pos.id, bar.close, now, "TIME_EXIT"))
        return out
