"""Realistic contract objects and inserts that mirror what the engine writes (plain SQL per the DDL)."""

from __future__ import annotations

import itertools
import math
from datetime import UTC, datetime, timedelta
from typing import Any

from tradebot.analytics.metrics import classify
from tradebot.db import Database, iso, utcnow
from tradebot.schemas import (
    AIAnalysis,
    Candle,
    EngineStatus,
    IndicatorSnapshot,
    MTFReport,
    PortfolioState,
    Position,
    RegimeState,
    RiskCheck,
    RiskDecision,
    RiskMeter,
    RiskSnapshot,
    SignalEvaluation,
    Ticker,
    TimeframeSignal,
    Trade,
)

_ids = itertools.count(1)


def hex_id(prefix: str) -> str:
    return f"{prefix}_{next(_ids):012x}"


def ts(dt: datetime) -> int:
    return int(dt.timestamp())


# --------------------------------------------------------------------------
# Live state models
# --------------------------------------------------------------------------


def engine_status(**overrides: Any) -> EngineStatus:
    now = utcnow()
    data: dict[str, Any] = {
        "mode": "paper",
        "running": True,
        "trading_allowed": True,
        "strategy": "ai",
        "symbols": ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
        "primary_symbol": "BTC/USDT",
        "decision_timeframe": "5m",
        "feed": "simulated",
        "feed_connected": True,
        "ai_provider": "heuristic",
        "ai_model": "heuristic-v1",
        "openrouter_configured": False,
        "settings_version": 1,
        "started_at": now - timedelta(hours=3),
        "heartbeat_at": now,
        "last_market_update": now - timedelta(minutes=2),
        "version": "0.1.0",
        "pid": 4242,
        "cpu_pct": 3.5,
        "rss_mb": 120.0,
    }
    data.update(overrides)
    return EngineStatus.model_validate(data)


def portfolio_state(**overrides: Any) -> PortfolioState:
    data: dict[str, Any] = {
        "mode": "paper",
        "starting_balance": 10_000.0,
        "equity": 10_250.0,
        "cash": 10_100.0,
        "realized_pnl": 200.0,
        "unrealized_pnl": 50.0,
        "total_pnl": 250.0,
        "total_pnl_pct": 2.5,
        "today_pnl": 35.0,
        "today_pnl_pct": 0.34,
        "exposure": 3_000.0,
        "exposure_pct": 29.3,
        "open_positions": 1,
        "trades_today": 2,
        "peak_equity": 10_300.0,
        "drawdown_pct": -0.49,
        "updated_at": utcnow(),
    }
    data.update(overrides)
    return PortfolioState.model_validate(data)


def position(**overrides: Any) -> Position:
    opened = overrides.pop("opened_at", utcnow() - timedelta(minutes=50))
    data: dict[str, Any] = {
        "id": hex_id("pos"),
        "symbol": "BTC/USDT",
        "side": "LONG",
        "size": 0.03,
        "notional": 2_910.0,
        "entry_price": 97_000.0,
        "current_price": 97_400.0,
        "stop_loss": 96_200.0,
        "take_profit": 98_600.0,
        "unrealized_pnl": 10.55,
        "unrealized_pnl_pct": 0.36,
        "r_multiple": 0.44,
        "fees_paid": 1.45,
        "risk_amount": 24.0,
        "risk_pct": 0.24,
        "opened_at": opened,
        "duration_sec": int((utcnow() - opened).total_seconds()),
        "ai_confidence": 74.0,
        "analysis_id": None,
        "strategy": "ai",
        "regime": "TRENDING_BULLISH",
        "order_type": "market",
        "entry_reason": "EMA stack bullish with rising MACD histogram",
    }
    data.update(overrides)
    return Position.model_validate(data)


def trade(
    *,
    pnl: float,
    closed_at: datetime,
    duration: timedelta = timedelta(hours=1),
    **overrides: Any,
) -> Trade:
    notional = overrides.pop("notional", 2_000.0)
    side = overrides.get("side", "LONG")
    entry = overrides.pop("entry_price", 97_000.0)
    pnl_pct = pnl / notional * 100.0
    move = entry * pnl_pct / 100.0
    exit_price = entry + move if side == "LONG" else entry - move
    data: dict[str, Any] = {
        "id": hex_id("pos"),
        "symbol": "BTC/USDT",
        "side": side,
        "size": notional / entry,
        "notional": notional,
        "entry_price": entry,
        "exit_price": exit_price,
        "stop_loss": entry * (0.99 if side == "LONG" else 1.01),
        "take_profit": entry * (1.02 if side == "LONG" else 0.98),
        "opened_at": closed_at - duration,
        "closed_at": closed_at,
        "duration_sec": int(duration.total_seconds()),
        "pnl": pnl,
        "pnl_pct": pnl_pct,
        "gross_pnl": pnl + 2.0,
        "fees": 2.0,
        "result": classify(pnl),
        "exit_reason": "TAKE_PROFIT" if pnl > 0 else "STOP_LOSS",
        "r_multiple": pnl / 20.0,
        "ai_confidence": 72.0,
        "analysis_id": None,
        "strategy": "ai",
        "regime": "TRENDING_BULLISH",
        "entry_reason": "Breakout above the 20-bar high on rising volume",
        "mfe_pct": 1.2,
        "mae_pct": -0.4,
    }
    data.update(overrides)
    return Trade.model_validate(data)


def analysis(**overrides: Any) -> AIAnalysis:
    signal = overrides.get("signal", "LONG")
    risk_status = overrides.pop("risk_status", "APPROVED" if signal != "HOLD" else "NOT_APPLICABLE")
    reasons = overrides.pop("risk_reasons", [])
    eval_status = overrides.pop("eval_status", "PENDING" if signal != "HOLD" else "NOT_APPLICABLE")
    data: dict[str, Any] = {
        "id": hex_id("dec"),
        "symbol": "BTC/USDT",
        "timeframe": "5m",
        "created_at": utcnow() - timedelta(minutes=5),
        "signal": signal,
        "confidence": 72.0,
        "regime": "TRENDING_BULLISH",
        "regime_confidence": 68.0,
        "price": 97_000.0,
        "entry": 97_000.0 if signal != "HOLD" else None,
        "stop_loss": 96_200.0 if signal == "LONG" else (97_800.0 if signal == "SHORT" else None),
        "take_profit": 98_600.0 if signal == "LONG" else (95_400.0 if signal == "SHORT" else None),
        "risk_reward": 2.0 if signal != "HOLD" else None,
        "summary": "Trend continuation with momentum confirmation.",
        "reasons": ["EMA 21 above EMA 50", "MACD histogram rising"],
        "risks": ["RSI approaching overbought"],
        "invalidation": "Close below $96,200 (EMA 50)",
        "detailed_reasoning": "Price holds above the rising EMA stack; volume expands on up candles.",
        "indicators": IndicatorSnapshot(price=97_000.0, ema21=96_800.0, ema50=96_400.0, rsi=61.0),
        "mtf": [],
        "strategy": "ai",
        "baseline_signal": signal,
        "provider": "heuristic",
        "model": "heuristic-v1",
        "latency_ms": 4,
        "risk": RiskDecision(
            status=risk_status,
            reasons=reasons,
            checks=[
                RiskCheck(name="Risk / reward", passed=risk_status != "REJECTED", value="2.0", limit="≥ 1.5")
            ],
        ),
        "trade_id": None,
        "evaluation": SignalEvaluation(status=eval_status),
    }
    data.update(overrides)
    return AIAnalysis.model_validate(data)


def ticker(symbol: str = "BTC/USDT", price: float = 97_400.0, **overrides: Any) -> Ticker:
    data: dict[str, Any] = {
        "symbol": symbol,
        "price": price,
        "change_24h": price * 0.012,
        "change_24h_pct": 1.2,
        "high_24h": price * 1.02,
        "low_24h": price * 0.97,
        "volume_24h": 12_345.0,
        "quote_volume_24h": 12_345.0 * price,
        "ts": utcnow(),
        "sparkline": [price * (1 + 0.001 * math.sin(i / 3)) for i in range(24)],
    }
    data.update(overrides)
    return Ticker.model_validate(data)


def mtf_report(symbol: str = "BTC/USDT") -> MTFReport:
    rows = [
        TimeframeSignal(timeframe=tf, trend="BULL", signal="LONG", strength=70.0, ema_alignment="BULLISH")
        for tf in ("5m", "15m", "1h", "4h")
    ]
    return MTFReport(
        symbol=symbol,
        timeframes=rows,
        aligned_count=4,
        total=4,
        dominant="BULL",
        alignment_label="4/4 TIMEFRAMES ALIGNED",
        updated_at=utcnow(),
    )


def regime_state(symbol: str = "BTC/USDT", regime: str = "TRENDING_BULLISH") -> RegimeState:
    return RegimeState(
        symbol=symbol,
        regime=regime,
        confidence=71.0,
        since=utcnow() - timedelta(hours=6),
        metrics={"adx": 31.2, "atr_pct": 0.42},
        updated_at=utcnow(),
    )


def risk_snapshot(**overrides: Any) -> RiskSnapshot:
    data: dict[str, Any] = {
        "trading_allowed": True,
        "equity": 10_250.0,
        "current_exposure": 3_000.0,
        "current_exposure_pct": 29.3,
        "max_exposure_pct": 150.0,
        "risk_per_trade_pct": 1.0,
        "open_risk": 24.0,
        "open_risk_pct": 0.23,
        "daily_pnl": 35.0,
        "daily_loss": 0.0,
        "max_daily_loss": 200.0,
        "drawdown_pct": -0.49,
        "max_drawdown_pct": -1.8,
        "max_drawdown_limit_pct": 15.0,
        "open_positions": 1,
        "max_positions": 3,
        "consecutive_losses": 0,
        "max_consecutive_losses": 4,
        "min_risk_reward": 1.5,
        "min_confidence": 65.0,
        "rejections_today": 1,
        "meters": [
            RiskMeter(
                key="daily_loss",
                label="Daily loss",
                current=0.0,
                limit=200.0,
                unit="usd",
                utilization_pct=0.0,
                status="ok",
            )
        ],
        "updated_at": utcnow(),
    }
    data.update(overrides)
    return RiskSnapshot.model_validate(data)


# --------------------------------------------------------------------------
# Inserts (the engine's tables)
# --------------------------------------------------------------------------


def insert_trade(db: Database, t: Trade) -> Trade:
    with db.tx() as conn:
        conn.execute(
            "INSERT INTO trades(id, symbol, side, strategy, result, exit_reason, regime, opened_at, closed_at, "
            "pnl, pnl_pct, ai_confidence, analysis_id, payload) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                t.id,
                t.symbol,
                t.side,
                t.strategy,
                t.result,
                t.exit_reason,
                t.regime,
                iso(t.opened_at),
                iso(t.closed_at),
                t.pnl,
                t.pnl_pct,
                t.ai_confidence,
                t.analysis_id,
                t.model_dump_json(),
            ),
        )
    return t


def insert_position(db: Database, p: Position) -> Position:
    with db.tx() as conn:
        conn.execute(
            "INSERT INTO positions(id, symbol, side, opened_at, payload) VALUES (?,?,?,?,?)",
            (p.id, p.symbol, p.side, iso(p.opened_at), p.model_dump_json()),
        )
    return p


def insert_analysis(db: Database, a: AIAnalysis) -> AIAnalysis:
    with db.tx() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO ai_decisions(id, created_at, symbol, signal, confidence, provider, risk_status, "
            "eval_status, trade_id, payload) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                a.id,
                iso(a.created_at),
                a.symbol,
                a.signal,
                a.confidence,
                a.provider,
                a.risk.status,
                a.evaluation.status,
                a.trade_id,
                a.model_dump_json(),
            ),
        )
    return a


def insert_equity(db: Database, points: list[tuple[int, float]]) -> None:
    with db.tx() as conn:
        conn.executemany(
            "INSERT OR REPLACE INTO equity_snapshots(time, equity, cash, realized_pnl, unrealized_pnl, exposure, "
            "drawdown_pct) VALUES (?, ?, ?, 0, 0, 0, 0)",
            [(t, e, e) for t, e in points],
        )


def insert_candles(db: Database, symbol: str, timeframe: str, candles: list[Candle]) -> None:
    with db.tx() as conn:
        conn.executemany(
            "INSERT OR REPLACE INTO candles(symbol, timeframe, time, open, high, low, close, volume) "
            "VALUES (?,?,?,?,?,?,?,?)",
            [(symbol, timeframe, c.time, c.open, c.high, c.low, c.close, c.volume) for c in candles],
        )


def candle_series(end: int, step: int, count: int, start_price: float = 97_000.0) -> list[Candle]:
    """``count`` candles of ``step`` seconds, the last one opening at ``end`` (a gentle wave)."""
    out: list[Candle] = []
    price = start_price
    first = end - (count - 1) * step
    for i in range(count):
        open_ = price
        close = open_ * (1 + 0.0015 * math.sin(i / 7))
        out.append(
            Candle(
                time=first + i * step,
                open=round(open_, 2),
                high=round(max(open_, close) * 1.0008, 2),
                low=round(min(open_, close) * 0.9992, 2),
                close=round(close, 2),
                volume=round(10 + 5 * (1 + math.sin(i / 5)), 4),
            )
        )
        price = close
    return out


def insert_usage(
    db: Database,
    when: datetime,
    *,
    success: bool = True,
    latency_ms: float = 900.0,
    prompt_tokens: int = 1_200,
    completion_tokens: int = 300,
    cost_usd: float = 0.002,
    error: str | None = None,
    model: str = "anthropic/claude-haiku-4.5",
) -> None:
    with db.tx() as conn:
        conn.execute(
            "INSERT INTO ai_usage(ts, provider, model, success, latency_ms, prompt_tokens, completion_tokens, "
            "cost_usd, error) VALUES (?, 'openrouter', ?, ?, ?, ?, ?, ?, ?)",
            (iso(when), model, int(success), latency_ms, prompt_tokens, completion_tokens, cost_usd, error),
        )


def insert_regime_segment(
    db: Database, symbol: str, regime: str, start: datetime, end: datetime | None, confidence: float = 66.0
) -> None:
    with db.tx() as conn:
        conn.execute(
            "INSERT INTO regime_history(symbol, regime, confidence, start, end) VALUES (?,?,?,?,?)",
            (symbol, regime, confidence, iso(start), iso(end) if end else None),
        )


def publish_live_state(
    db: Database, *, symbols: tuple[str, ...] = ("BTC/USDT", "ETH/USDT", "SOL/USDT")
) -> None:
    """Everything the engine publishes to ``live_state`` on a healthy heartbeat."""
    prices = {"BTC/USDT": 97_400.0, "ETH/USDT": 3_450.0, "SOL/USDT": 165.0}
    db.put_live("status", engine_status(symbols=list(symbols)))
    db.put_live("portfolio", portfolio_state())
    db.put_live("risk", risk_snapshot())
    for symbol in symbols:
        db.put_live(f"ticker:{symbol}", ticker(symbol, prices.get(symbol, 100.0)))
        db.put_live(f"mtf:{symbol}", mtf_report(symbol))
        db.put_live(f"regime:{symbol}", regime_state(symbol))


def at(day_offset: int = 0, hour: int = 12, minute: int = 0, base: datetime | None = None) -> datetime:
    """A UTC moment relative to today's (or ``base``'s) midnight."""
    base = base or utcnow()
    midnight = datetime(base.year, base.month, base.day, tzinfo=UTC)
    return midnight + timedelta(days=day_offset, hours=hour, minutes=minute)
