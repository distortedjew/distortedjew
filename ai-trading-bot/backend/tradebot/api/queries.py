"""Database readers for the API. Every function returns contract models (``schemas``).

Live snapshots come from ``live_state`` (written by the engine about once a second);
history comes from the engine's tables. Nothing here writes, except the two small
helpers at the end that flip notification read flags (an API-owned column).
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal, TypeVar

from pydantic import BaseModel

from ..analytics import metrics
from ..config import VERSION, EnvConfig
from ..db import Database, iso, parse_iso, row_to_event, row_to_notification, utcnow
from ..schemas import (
    REGIMES,
    AIAnalysis,
    AIDecisionPage,
    BotStatus,
    Candle,
    EngineStatus,
    Event,
    EventPage,
    ExitReason,
    MTFReport,
    Notification,
    NotificationList,
    PortfolioState,
    Position,
    RegimePerformance,
    RegimeSegment,
    RegimeState,
    RiskSnapshot,
    Side,
    Signal,
    StrategyName,
    Ticker,
    Trade,
    TradePage,
    TradeResult,
    TradeSummary,
)
from .errors import EngineStateUnavailable

ONLINE_MAX_AGE_SEC = 10.0
DEGRADED_MAX_AGE_SEC = 60.0

M = TypeVar("M", bound=BaseModel)


# --------------------------------------------------------------------------
# Live state
# --------------------------------------------------------------------------


def live(db: Database, key: str, model: type[M]) -> M | None:
    row = db.read_one("SELECT payload FROM live_state WHERE key = ?", (key,))
    return model.model_validate_json(row["payload"]) if row else None


def require(value: M | None) -> M:
    """The value, or HTTP 503 when the engine has never published it."""
    if value is None:
        raise EngineStateUnavailable()
    return value


def engine_status(db: Database) -> EngineStatus | None:
    return live(db, "status", EngineStatus)


def portfolio_state(db: Database) -> PortfolioState | None:
    return live(db, "portfolio", PortfolioState)


def risk_snapshot(db: Database) -> RiskSnapshot | None:
    return live(db, "risk", RiskSnapshot)


def live_positions(db: Database) -> list[Position] | None:
    row = db.read_one("SELECT payload FROM live_state WHERE key = 'positions'")
    if row is None:
        return None
    return [Position.model_validate(p) for p in _json_list(row["payload"])]


def ticker(db: Database, symbol: str) -> Ticker | None:
    return live(db, f"ticker:{symbol}", Ticker)


def mtf_report(db: Database, symbol: str) -> MTFReport | None:
    return live(db, f"mtf:{symbol}", MTFReport)


def regime_state(db: Database, symbol: str) -> RegimeState | None:
    return live(db, f"regime:{symbol}", RegimeState)


def _json_list(payload: str) -> list[Any]:
    value = json.loads(payload)
    return value if isinstance(value, list) else []


def bot_status(engine: EngineStatus | None, config: EnvConfig, now: datetime | None = None) -> BotStatus:
    """Engine liveness from the heartbeat age: online < 10 s, degraded < 60 s, else offline.

    An engine that reported ``running: false`` (clean shutdown) is offline at once.
    """
    now = now or utcnow()
    if engine is None:
        return BotStatus(
            state="offline",
            online=False,
            heartbeat_age_sec=None,
            mode=config.trading_mode,
            engine=None,
            api_version=VERSION,
            server_time=now,
        )
    age = max(0.0, (now - engine.heartbeat_at).total_seconds())
    if not engine.running or age >= DEGRADED_MAX_AGE_SEC:
        state = "offline"
    elif age >= ONLINE_MAX_AGE_SEC:
        state = "degraded"
    else:
        state = "online"
    return BotStatus(
        state=state,
        online=state != "offline",
        heartbeat_age_sec=round(age, 2),
        mode=engine.mode,
        engine=engine,
        api_version=VERSION,
        server_time=now,
    )


def active_symbols(db: Database, engine: EngineStatus | None = None) -> list[str]:
    """Symbols the engine is trading (its status), else the configured ones."""
    engine = engine if engine is not None else engine_status(db)
    if engine is not None and engine.symbols:
        return list(engine.symbols)
    return list(db.get_settings().trading.symbols)


def primary_symbol(db: Database, engine: EngineStatus | None = None) -> str:
    engine = engine if engine is not None else engine_status(db)
    if engine is not None and engine.primary_symbol:
        return engine.primary_symbol
    return db.get_settings().trading.primary_symbol


def newest_tick(db: Database, symbols: Sequence[str]) -> datetime | None:
    stamps = [t.ts for s in symbols if (t := ticker(db, s)) is not None]
    return max(stamps) if stamps else None


def has_candles(db: Database, symbol: str) -> bool:
    return db.read_one("SELECT 1 FROM candles WHERE symbol = ? LIMIT 1", (symbol,)) is not None


# --------------------------------------------------------------------------
# Positions and trades
# --------------------------------------------------------------------------


def find_position(db: Database, position_id: str) -> Position | None:
    """An open position, preferring the live (marked-to-market) copy."""
    for position in live_positions(db) or ():
        if position.id == position_id:
            return position
    row = db.read_one("SELECT payload FROM positions WHERE id = ?", (position_id,))
    return Position.model_validate_json(row["payload"]) if row else None


def open_positions(db: Database, symbol: str | None = None) -> list[Position]:
    positions = live_positions(db)
    if positions is None:
        positions = [
            Position.model_validate_json(r["payload"]) for r in db.read("SELECT payload FROM positions")
        ]
    return [p for p in positions if symbol is None or p.symbol == symbol]


def find_trade(db: Database, trade_id: str) -> Trade | None:
    row = db.read_one("SELECT payload FROM trades WHERE id = ?", (trade_id,))
    return Trade.model_validate_json(row["payload"]) if row else None


TradeSort = Literal[
    "closed_at",
    "opened_at",
    "pnl",
    "pnl_pct",
    "symbol",
    "side",
    "confidence",
    "duration",
    "exit_reason",
    "result",
    "strategy",
]
SortOrder = Literal["asc", "desc"]
_TRADE_SORT_SQL: dict[str, str] = {
    "closed_at": "closed_at",
    "opened_at": "opened_at",
    "pnl": "pnl",
    "pnl_pct": "pnl_pct",
    "symbol": "symbol",
    "side": "side",
    "confidence": "ai_confidence",
    "duration": "(julianday(closed_at) - julianday(opened_at))",
    "exit_reason": "exit_reason",
    "result": "result",
    "strategy": "strategy",
}


def _like(text: str) -> str:
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


@dataclass(frozen=True)
class TradeFilters:
    symbol: str | None = None
    side: Side | None = None
    result: TradeResult | None = None
    strategy: StrategyName | None = None
    exit_reason: ExitReason | None = None
    min_confidence: float | None = None
    max_confidence: float | None = None
    start: datetime | None = None
    end: datetime | None = None
    q: str | None = None

    def where(self) -> tuple[str, list[Any]]:
        clauses: list[str] = []
        params: list[Any] = []
        for column in ("symbol", "side", "result", "strategy", "exit_reason"):
            value = getattr(self, column)
            if value is not None:
                clauses.append(f"{column} = ?")
                params.append(value)
        if self.min_confidence is not None:
            clauses.append("ai_confidence >= ?")
            params.append(self.min_confidence)
        if self.max_confidence is not None:
            clauses.append("ai_confidence <= ?")
            params.append(self.max_confidence)
        if self.start is not None:
            clauses.append("closed_at >= ?")
            params.append(iso(self.start))
        if self.end is not None:
            clauses.append("closed_at <= ?")
            params.append(iso(self.end))
        if self.q:
            columns = (
                "id",
                "symbol",
                "analysis_id",
                "exit_reason",
                "regime",
                "strategy",
                "json_extract(payload, '$.entry_reason')",
            )
            clauses.append("(" + " OR ".join(f"{c} LIKE ? ESCAPE '\\'" for c in columns) + ")")
            params.extend([_like(self.q)] * len(columns))
        return (" WHERE " + " AND ".join(clauses)) if clauses else "", params


def _order_by(sort: TradeSort, order: SortOrder) -> str:
    direction = "ASC" if order == "asc" else "DESC"
    column = _TRADE_SORT_SQL[sort]
    return f" ORDER BY {column} IS NULL, {column} {direction}, closed_at DESC, id DESC"


def trade_summary(db: Database, filters: TradeFilters) -> TradeSummary:
    where, params = filters.where()
    row = db.read_one(
        "SELECT COUNT(*) AS n, COALESCE(SUM(result = 'WIN'), 0) AS wins, "
        "COALESCE(SUM(result = 'LOSS'), 0) AS losses, COALESCE(SUM(pnl), 0) AS pnl, "
        "COALESCE(SUM(json_extract(payload, '$.fees')), 0) AS fees, AVG(pnl_pct) AS avg_pct "
        f"FROM trades{where}",
        params,
    )
    count = int(row["n"])
    return TradeSummary(
        count=count,
        wins=int(row["wins"]),
        losses=int(row["losses"]),
        win_rate=round(row["wins"] / count * 100.0, 2) if count else None,
        net_pnl=round(row["pnl"], 2),
        fees=round(row["fees"], 4),
        avg_pnl_pct=round(row["avg_pct"], 4) if row["avg_pct"] is not None else None,
    )


def trade_page(
    db: Database, filters: TradeFilters, sort: TradeSort, order: SortOrder, limit: int, offset: int
) -> TradePage:
    where, params = filters.where()
    rows = db.read(
        f"SELECT payload FROM trades{where}{_order_by(sort, order)} LIMIT ? OFFSET ?",
        [*params, limit, offset],
    )
    summary = trade_summary(db, filters)
    return TradePage(
        items=[Trade.model_validate_json(r["payload"]) for r in rows],
        total=summary.count,
        limit=limit,
        offset=offset,
        summary=summary,
    )


def trades_for_export(
    db: Database, filters: TradeFilters, sort: TradeSort, order: SortOrder, cap: int
) -> list[Trade]:
    where, params = filters.where()
    rows = db.read(f"SELECT payload FROM trades{where}{_order_by(sort, order)} LIMIT ?", [*params, cap])
    return [Trade.model_validate_json(r["payload"]) for r in rows]


def trades_in_window(db: Database, symbol: str, start: datetime, end: datetime, limit: int) -> list[Trade]:
    """The most recent ``limit`` trades on ``symbol`` that overlap [start, end]."""
    rows = db.read(
        "SELECT payload FROM trades WHERE symbol = ? AND closed_at >= ? AND opened_at <= ? "
        "ORDER BY closed_at DESC LIMIT ?",
        (symbol, iso(start), iso(end), limit),
    )
    return [Trade.model_validate_json(r["payload"]) for r in rows]


# --------------------------------------------------------------------------
# AI decisions
# --------------------------------------------------------------------------


def find_analysis(db: Database, analysis_id: str | None) -> AIAnalysis | None:
    if not analysis_id:
        return None
    row = db.read_one("SELECT payload FROM ai_decisions WHERE id = ?", (analysis_id,))
    return AIAnalysis.model_validate_json(row["payload"]) if row else None


def latest_analysis(db: Database, symbol: str | None = None) -> AIAnalysis | None:
    if symbol is None:
        row = db.read_one("SELECT payload FROM ai_decisions ORDER BY created_at DESC, id DESC LIMIT 1")
    else:
        row = db.read_one(
            "SELECT payload FROM ai_decisions WHERE symbol = ? ORDER BY created_at DESC, id DESC LIMIT 1",
            (symbol,),
        )
    return AIAnalysis.model_validate_json(row["payload"]) if row else None


def ai_history(
    db: Database,
    *,
    symbol: str | None,
    signal: Signal | None,
    risk_status: str | None,
    provider: str | None,
    min_confidence: float | None,
    limit: int,
    offset: int,
) -> AIDecisionPage:
    clauses: list[str] = []
    params: list[Any] = []
    for column, value in (
        ("symbol", symbol),
        ("signal", signal),
        ("risk_status", risk_status),
        ("provider", provider),
    ):
        if value is not None:
            clauses.append(f"{column} = ?")
            params.append(value)
    if min_confidence is not None:
        clauses.append("confidence >= ?")
        params.append(min_confidence)
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    total = int(db.read_one(f"SELECT COUNT(*) AS n FROM ai_decisions{where}", params)["n"])
    rows = db.read(
        f"SELECT payload FROM ai_decisions{where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        [*params, limit, offset],
    )
    return AIDecisionPage(
        items=[AIAnalysis.model_validate_json(r["payload"]) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


# --------------------------------------------------------------------------
# Events and notifications
# --------------------------------------------------------------------------


def events_page(
    db: Database,
    *,
    limit: int,
    before_id: int | None = None,
    types: Sequence[str] = (),
    severities: Sequence[str] = (),
    symbol: str | None = None,
) -> EventPage:
    """Newest first; ``before_id`` pages backwards; ``total`` counts the whole filtered set."""
    clauses: list[str] = []
    params: list[Any] = []
    if types:
        clauses.append(f"type IN ({','.join('?' * len(types))})")
        params.extend(types)
    if severities:
        clauses.append(f"severity IN ({','.join('?' * len(severities))})")
        params.extend(severities)
    if symbol is not None:
        clauses.append("symbol = ?")
        params.append(symbol)
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    total = int(db.read_one(f"SELECT COUNT(*) AS n FROM events{where}", params)["n"])
    if before_id is not None:
        where += (" AND " if where else " WHERE ") + "id < ?"
        params.append(before_id)
    rows = db.read(f"SELECT id, payload FROM events{where} ORDER BY id DESC LIMIT ?", [*params, limit + 1])
    return EventPage(
        items=[row_to_event(r) for r in rows[:limit]],
        total=total,
        has_more=len(rows) > limit,
    )


def events_between(db: Database, after_id: int, upto_id: int, limit: int) -> list[Event]:
    """The newest ``limit`` events with after_id < id <= upto_id, oldest first."""
    rows = db.read(
        "SELECT id, payload FROM events WHERE id > ? AND id <= ? ORDER BY id DESC LIMIT ?",
        (after_id, upto_id, limit),
    )
    return [row_to_event(r) for r in reversed(rows)]


def recent_issues(db: Database, limit: int = 20) -> list[Event]:
    rows = db.read(
        "SELECT id, payload FROM events WHERE severity IN ('warning', 'error') ORDER BY id DESC LIMIT ?",
        (limit,),
    )
    return [row_to_event(r) for r in rows]


def notification_list(db: Database, *, limit: int, unread_only: bool) -> NotificationList:
    where = " WHERE read = 0" if unread_only else ""
    rows = db.read(f"SELECT id, read, payload FROM notifications{where} ORDER BY id DESC LIMIT ?", (limit,))
    counts = db.read_one("SELECT COUNT(*) AS total, COALESCE(SUM(read = 0), 0) AS unread FROM notifications")
    return NotificationList(
        items=[row_to_notification(r) for r in rows],
        unread_count=int(counts["unread"]),
        total=int(counts["unread"] if unread_only else counts["total"]),
    )


def notifications_after(db: Database, last_id: int, limit: int = 200) -> list[Notification]:
    rows = db.read(
        "SELECT id, read, payload FROM notifications WHERE id > ? ORDER BY id LIMIT ?", (last_id, limit)
    )
    return [row_to_notification(r) for r in rows]


def last_notification_id(db: Database) -> int:
    row = db.read_one("SELECT MAX(id) AS id FROM notifications")
    return int(row["id"] or 0)


def mark_notifications_read(db: Database, ids: Sequence[int]) -> int:
    """Mark the given notifications (all when ``ids`` is empty) as read; returns rows changed."""
    with db.tx() as conn:
        if not ids:
            return conn.execute("UPDATE notifications SET read = 1 WHERE read = 0").rowcount
        placeholders = ",".join("?" * len(ids))
        return conn.execute(
            f"UPDATE notifications SET read = 1 WHERE read = 0 AND id IN ({placeholders})", list(ids)
        ).rowcount


# --------------------------------------------------------------------------
# Candles and regimes
# --------------------------------------------------------------------------


def _candle(row: Any) -> Candle:
    # Rows come from the engine's own table; skip re-validation on this hot path.
    return Candle.model_construct(
        time=row[0], open=row[1], high=row[2], low=row[3], close=row[4], volume=row[5]
    )


def latest_candles(db: Database, symbol: str, timeframe: str, count: int) -> list[Candle]:
    """The most recent ``count`` candles (the last one is still forming), oldest first."""
    rows = db.read(
        "SELECT time, open, high, low, close, volume FROM candles WHERE symbol = ? AND timeframe = ? "
        "ORDER BY time DESC LIMIT ?",
        (symbol, timeframe, count),
    )
    return [_candle(r) for r in reversed(rows)]


def candles_before(db: Database, symbol: str, timeframe: str, before: int, count: int) -> list[Candle]:
    """Up to ``count`` candles opening strictly before ``before``, oldest first."""
    rows = db.read(
        "SELECT time, open, high, low, close, volume FROM candles WHERE symbol = ? AND timeframe = ? "
        "AND time < ? ORDER BY time DESC LIMIT ?",
        (symbol, timeframe, before, count),
    )
    return [_candle(r) for r in reversed(rows)]


def candles_between(db: Database, symbol: str, timeframe: str, start: int, end: int) -> list[Candle]:
    rows = db.read(
        "SELECT time, open, high, low, close, volume FROM candles WHERE symbol = ? AND timeframe = ? "
        "AND time >= ? AND time <= ? ORDER BY time",
        (symbol, timeframe, start, end),
    )
    return [_candle(r) for r in rows]


def count_candles_between(db: Database, symbol: str, timeframe: str, start: int, end: int) -> int:
    row = db.read_one(
        "SELECT COUNT(*) AS n FROM candles WHERE symbol = ? AND timeframe = ? AND time >= ? AND time <= ?",
        (symbol, timeframe, start, end),
    )
    return int(row["n"])


def regime_performance(db: Database, symbol: str) -> list[RegimePerformance]:
    """Bot results on ``symbol`` grouped by the regime each trade was opened in.

    Every regime is listed (``UNKNOWN`` only when trades carry it), with the shared
    WIN rule and profit factor from :mod:`tradebot.analytics.metrics`.
    """
    by_regime: dict[str, list[tuple[float, float]]] = {}
    for r in db.read("SELECT regime, pnl, pnl_pct FROM trades WHERE symbol = ?", (symbol,)):
        by_regime.setdefault(r["regime"], []).append((r["pnl"], r["pnl_pct"]))
    out: list[RegimePerformance] = []
    for regime in REGIMES:
        rows = by_regime.get(regime, [])
        if not rows and regime == "UNKNOWN":
            continue
        pnls = [pnl for pnl, _ in rows]
        wins = sum(1 for pnl in pnls if metrics.classify(pnl) == "WIN")
        profit_factor = metrics.profit_factor(pnls)
        out.append(
            RegimePerformance(
                regime=regime,
                trades=len(rows),
                wins=wins,
                win_rate=round(wins / len(rows) * 100.0, 2) if rows else None,
                avg_trade_pct=round(sum(pct for _, pct in rows) / len(rows), 4) if rows else None,
                total_pnl=round(sum(pnls), 2),
                profit_factor=round(profit_factor, 3) if profit_factor is not None else None,
            )
        )
    return out


def regime_history(db: Database, symbol: str, since: datetime) -> list[RegimeSegment]:
    rows = db.read(
        "SELECT regime, confidence, start, end FROM regime_history "
        "WHERE symbol = ? AND (end IS NULL OR end >= ?) ORDER BY start",
        (symbol, iso(since)),
    )
    return [
        RegimeSegment(
            regime=r["regime"],
            start=parse_iso(r["start"]),
            end=parse_iso(r["end"]) if r["end"] else None,
            confidence=r["confidence"],
        )
        for r in rows
    ]
