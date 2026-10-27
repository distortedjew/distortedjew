"""Trading core end to end on synthetic candles with a scripted analyst."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from tradebot.ai.base import AnalystResult, MarketContext
from tradebot.ai.heuristic import HeuristicAnalyst
from tradebot.core import Batch, CoreConfig, MarketState, TradingCore
from tradebot.schemas import BotSettings, Candle

from .conftest import T0, walk_candles

CLOSE_KEYS = {"trade_id", "side", "exit_price", "pnl", "pnl_pct", "exit_reason"}


class Script:
    """Analyst that answers from a {decision unix time: (signal, confidence, stop%, target%)} script."""

    provider = "heuristic"
    model = "script"

    def __init__(self, calls: dict[int, tuple[str, float, float, float]], remote: bool = False) -> None:
        self.calls = calls
        self.is_remote = remote

    def analyze(self, ctx: MarketContext) -> AnalystResult:
        plan = self.calls.get(int(ctx.ts.timestamp()))
        if plan is None:
            return AnalystResult(
                "HOLD", 60.0, None, None, None, "hold", ["nothing"], [], None, "hold", "heuristic", "script"
            )
        signal, conf, stop_pct, target_pct = plan
        d = 1 if signal == "LONG" else -1
        p = ctx.price
        return AnalystResult(
            signal, conf, p, p * (1 - d * stop_pct / 100), p * (1 + d * target_pct / 100), "scripted call",
            ["because"], [], "Close below the stop", "scripted\n\nreasoning", "heuristic", "script",
        )  # fmt: skip

    async def aanalyze(self, ctx: MarketContext) -> AnalystResult:
        return self.analyze(ctx)


class Collect:
    def __init__(self) -> None:
        self.batches: list[Batch] = []

    def write(self, batch: Batch) -> None:
        self.batches.append(batch)

    def events(self) -> list:
        return [e for b in self.batches for e in b.events if e.type != "MARKET_UPDATE"]


def make_core(script: Script, *, strategy: str = "ai") -> tuple[TradingCore, Collect, list[Candle]]:
    settings = BotSettings()
    settings.trading.symbols = ["BTC/USDT"]
    settings.trading.strategy = strategy  # type: ignore[assignment]
    sink = Collect()
    core = TradingCore(settings, CoreConfig(), script, sink)
    warm = walk_candles(1500, start=T0, vol=0.0008, seed=1)
    core.warm_up("BTC/USDT", {"1m": warm})
    return core, sink, warm


def candle_after(
    prev: Candle, close: float, *, high: float | None = None, low: float | None = None
) -> Candle:
    return Candle(
        time=prev.time + 60, open=prev.close, high=high or max(prev.close, close) * 1.0001,
        low=low or min(prev.close, close) * 0.9999, close=close, volume=10,
    )  # fmt: skip


def run_until_decision(core: TradingCore, last: Candle) -> Candle:
    """Feed flat candles until the next 5m close; returns the closing candle."""
    while True:
        last = candle_after(last, last.close)
        core.on_candle("BTC/USDT", last)
        if (last.time + 60) % 300 == 0:
            return last


def test_executed_signal_event_order_and_take_profit_close():
    warm_end = T0 + 1500 * 60
    decision_at = warm_end - warm_end % 300 + 300
    core, sink, warm = make_core(Script({decision_at: ("LONG", 80.0, 1.0, 2.0)}))
    last = run_until_decision(core, warm[-1])
    types = [e.type for e in sink.events() if e.type != "SYSTEM_INFO"]
    assert types == ["AI_ANALYSIS", "TRADE_SIGNAL", "RISK_CHECK", "TRADE_EXECUTED"]
    analysis = next(a for b in sink.batches for a in b.analyses)
    pos = core.broker.position_for("BTC/USDT")
    assert analysis.trade_id == pos.id and analysis.risk.status == "APPROVED" and analysis.baseline_signal
    executed = sink.events()[-1]
    assert (
        executed.title == "LONG BTC/USDT executed"
        and " @ $" in executed.message
        and "SL $" in executed.message
    )
    assert set(executed.data) == {
        "analysis_id",
        "position_id",
        "side",
        "price",
        "size",
        "notional",
        "stop_loss",
        "take_profit",
    }
    assert any(n.type == "TRADE_OPENED" for b in sink.batches for n in b.notifications)
    sink.batches.clear()
    core.on_candle("BTC/USDT", candle_after(last, last.close * 1.025, high=pos.take_profit * 1.001))
    closes = [e for e in sink.events() if e.type in ("TAKE_PROFIT", "STOP_LOSS", "TRADE_CLOSED")]
    assert len(closes) == 1 and closes[0].type == "TAKE_PROFIT" and set(closes[0].data) == CLOSE_KEYS
    trade = next(t for b in sink.batches for t in b.closed)
    assert trade.id == pos.id and trade.exit_reason == "TAKE_PROFIT" and trade.result == "WIN"
    assert core.realized_total == pytest.approx(trade.pnl) and core.equity() > 10_000
    assert any(b.equity for b in sink.batches)


def test_hold_and_rejected_signals():
    warm_end = T0 + 1500 * 60
    first = warm_end - warm_end % 300 + 300
    core, sink, warm = make_core(Script({first + 300: ("LONG", 50.0, 1.0, 2.0)}))
    last = run_until_decision(core, warm[-1])
    hold = [a for b in sink.batches for a in b.analyses][-1]
    assert hold.signal == "HOLD" and hold.risk.status == "NOT_APPLICABLE"
    assert [e.type for e in sink.events()] == ["AI_ANALYSIS"]
    sink.batches.clear()
    run_until_decision(core, last)
    types = [e.type for e in sink.events()]
    assert types == ["AI_ANALYSIS", "TRADE_SIGNAL", "RISK_CHECK", "TRADE_REJECTED"]
    rejected = sink.events()[-1]
    assert rejected.data["reasons"] == ["Confidence below minimum"]
    assert sink.events()[2].data == {
        "analysis_id": rejected.data["analysis_id"],
        "status": "REJECTED",
        "reasons": ["Confidence below minimum"],
    }


def test_strong_opposite_signal_reverses_the_position():
    warm_end = T0 + 1500 * 60
    first = warm_end - warm_end % 300 + 300
    core, sink, warm = make_core(
        Script({first: ("LONG", 80.0, 1.0, 2.0), first + 300: ("SHORT", 82.0, 1.0, 2.0)})
    )
    last = run_until_decision(core, warm[-1])
    long_id = core.broker.position_for("BTC/USDT").id
    sink.batches.clear()
    run_until_decision(core, last)
    types = [e.type for e in sink.events()]
    assert types == ["AI_ANALYSIS", "TRADE_SIGNAL", "RISK_CHECK", "TRADE_CLOSED", "TRADE_EXECUTED"]
    closed = next(t for b in sink.batches for t in b.closed)
    assert closed.id == long_id and closed.exit_reason == "SIGNAL_REVERSAL"
    assert core.broker.position_for("BTC/USDT").side == "SHORT"


def test_daily_loss_limit_triggers_the_kill_switch():
    warm_end = T0 + 1500 * 60
    first = warm_end - warm_end % 300 + 300
    core, sink, warm = make_core(Script({first: ("LONG", 80.0, 5.0, 10.0)}))
    core.settings.risk.max_daily_loss_usd = 100.0
    last = run_until_decision(core, warm[-1])
    assert core.broker.positions
    core.day_start_equity += 90.0  # earlier losses today: 90 of the 100 budget are gone
    core.on_tick("BTC/USDT", last.close * 0.99, datetime.fromtimestamp(last.time + 90, UTC))
    exits = [t.exit_reason for b in sink.batches for t in b.closed]
    assert exits == ["KILL_SWITCH"] and not core.broker.positions
    warnings = [e for e in sink.events() if e.type == "RISK_WARNING"]
    assert warnings and warnings[0].data["meter"] == "daily_loss"
    assert {n.type for b in sink.batches for n in b.notifications} >= {"DAILY_LOSS_LIMIT"}
    assert not core.risk.trading_allowed(datetime.fromtimestamp(last.time + 120, UTC))


def test_remote_analysts_are_deferred_and_completed_later():
    warm_end = T0 + 1500 * 60
    first = warm_end - warm_end % 300 + 300
    script = Script({first: ("LONG", 80.0, 1.0, 2.0)}, remote=True)
    settings = BotSettings()
    settings.trading.symbols = ["BTC/USDT"]
    sink = Collect()
    core = TradingCore(settings, CoreConfig(defer_remote_analysis=True), script, sink)
    core.warm_up("BTC/USDT", {"1m": walk_candles(1500, start=T0, vol=0.0008, seed=1)})
    last = core.books["BTC/USDT"].candles("1m", 1)[-1]
    pending = []
    while not pending:
        last = candle_after(last, last.close)
        pending = core.on_candle("BTC/USDT", last)
    assert not core.broker.positions and pending[0].ctx.snapshots  # full context for the prompt
    analysis = core.complete(
        pending[0], script.analyze(pending[0].ctx), datetime.fromtimestamp(last.time + 65, UTC)
    )
    assert analysis.trade_id == core.broker.position_for("BTC/USDT").id


def test_cores_sharing_a_market_match_separate_cores():
    candles = walk_candles(4000, start=T0, vol=0.0012, seed=21)
    warm, test = candles[:1500], candles[1500:]

    def run(shared: bool) -> list[list]:
        market = MarketState() if shared else None
        cores = []
        for strategy in ("ai", "baseline"):
            settings = BotSettings()
            settings.trading.symbols = ["BTC/USDT"]
            settings.trading.strategy = strategy  # type: ignore[assignment]
            sink = Collect()
            cores.append(
                (
                    TradingCore(
                        settings, CoreConfig(emit_records=False), HeuristicAnalyst(), sink, market=market
                    ),
                    sink,
                )
            )
        cores[0][0].warm_up("BTC/USDT", {"1m": warm})
        for core, _ in cores[1:]:
            if shared:
                core.sync_prices("BTC/USDT")
            else:
                core.warm_up("BTC/USDT", {"1m": warm})
        for c in test:
            for core, _ in cores:
                core.on_candle("BTC/USDT", c)
        return [
            [
                (t.id[:0], t.side, t.entry_price, t.exit_price, t.exit_reason)
                for b in s.batches
                for t in b.closed
            ]
            for _, s in cores
        ]

    separate, shared = run(False), run(True)
    assert shared == separate and any(shared)
