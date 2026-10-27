"""SQLite persistence shared by the engine (the only trading-state writer) and the API.

The engine process and the API process never talk to each other directly; this
database is the boundary between them:

- The engine writes trading state (positions, trades, AI decisions, equity,
  candles), appends to the ``events`` outbox and refreshes ``live_state``
  snapshots every tick/heartbeat.
- The API reads all of it, tails ``events`` by id and watches ``live_state``
  versions to push WebSocket frames, and writes only ``settings``,
  ``notifications.read``, ``backtests`` and ``SETTINGS_CHANGED`` events.

Rows that carry a full contract model store it as JSON in ``payload``; the other
columns exist for filtering and ordering. Timestamps are fixed-width UTC ISO
strings (see ``iso``) so they sort and compare correctly as text.
"""

from __future__ import annotations

import contextlib
import json
import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from .schemas import BotSettings, Event, Notification

SCHEMA_VERSION = 1

DDL = """
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Single row (id = 1). version increments on every save; the engine applies it.
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    payload TEXT NOT NULL
);

-- Latest snapshots published by the engine. version increments on every write,
-- so the API can push only what changed. Keys: see LIVE_KEYS below.
CREATE TABLE IF NOT EXISTS live_state (
    key TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    payload TEXT NOT NULL
);

-- Outbox / activity log. payload = schemas.Event without the id.
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    type TEXT NOT NULL,
    severity TEXT NOT NULL,
    symbol TEXT,
    payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type, id);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);

-- time = candle open, unix seconds. The engine keeps every timeframe it serves.
CREATE TABLE IF NOT EXISTS candles (
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    time INTEGER NOT NULL,
    open REAL NOT NULL,
    high REAL NOT NULL,
    low REAL NOT NULL,
    close REAL NOT NULL,
    volume REAL NOT NULL,
    PRIMARY KEY (symbol, timeframe, time)
) WITHOUT ROWID;

-- payload = schemas.AIAnalysis (rewritten when risk/evaluation/trade_id change)
CREATE TABLE IF NOT EXISTS ai_decisions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    symbol TEXT NOT NULL,
    signal TEXT NOT NULL,
    confidence REAL NOT NULL,
    provider TEXT NOT NULL,
    risk_status TEXT NOT NULL,
    eval_status TEXT NOT NULL,
    trade_id TEXT,
    payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_created ON ai_decisions(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_symbol ON ai_decisions(symbol, created_at);

-- Open positions only; payload = schemas.Position. Deleted when the trade closes.
CREATE TABLE IF NOT EXISTS positions (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    opened_at TEXT NOT NULL,
    payload TEXT NOT NULL
);

-- Closed round trips; payload = schemas.Trade. Same id as the position it closed.
CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    strategy TEXT NOT NULL,
    result TEXT NOT NULL,
    exit_reason TEXT NOT NULL,
    regime TEXT NOT NULL,
    opened_at TEXT NOT NULL,
    closed_at TEXT NOT NULL,
    pnl REAL NOT NULL,
    pnl_pct REAL NOT NULL,
    ai_confidence REAL,
    analysis_id TEXT,
    payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trades_closed ON trades(closed_at);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol, closed_at);

-- One row per minute (and on every trade close). time = unix seconds.
CREATE TABLE IF NOT EXISTS equity_snapshots (
    time INTEGER PRIMARY KEY,
    equity REAL NOT NULL,
    cash REAL NOT NULL,
    realized_pnl REAL NOT NULL,
    unrealized_pnl REAL NOT NULL,
    exposure REAL NOT NULL,
    drawdown_pct REAL NOT NULL
);

-- payload = schemas.Notification without id/read.
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    type TEXT NOT NULL,
    severity TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0,
    payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read, id);

-- One row per LLM request (successful or not). Heuristic answers are not rows.
CREATE TABLE IF NOT EXISTS ai_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    success INTEGER NOT NULL,
    latency_ms REAL NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    error TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_ts ON ai_usage(ts);

-- Regime segments per symbol; end is NULL for the current one.
CREATE TABLE IF NOT EXISTS regime_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    regime TEXT NOT NULL,
    confidence REAL NOT NULL,
    start TEXT NOT NULL,
    end TEXT
);
CREATE INDEX IF NOT EXISTS idx_regime_symbol ON regime_history(symbol, start);

-- summary = schemas.BacktestSummary, result = schemas.BacktestResult (when completed).
CREATE TABLE IF NOT EXISTS backtests (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL,
    progress REAL NOT NULL DEFAULT 0,
    summary TEXT NOT NULL,
    result TEXT,
    error TEXT
);
"""

# live_state keys written by the engine. "{symbol}" is the slash form, e.g. ticker:BTC/USDT.
LIVE_KEYS = {
    "status": "schemas.EngineStatus — engine heartbeat, every ~2 s",
    "portfolio": "schemas.PortfolioState — every tick (throttled to ~1 s)",
    "positions": "list[schemas.Position] — every tick (throttled to ~1 s)",
    "risk": "schemas.RiskSnapshot — every ~2 s and on change",
    "ticker:{symbol}": "schemas.Ticker — every tick (throttled to ~1 s)",
    "mtf:{symbol}": "schemas.MTFReport — on every 1m candle close",
    "regime:{symbol}": "schemas.RegimeState — on every decision-timeframe candle close",
}


def utcnow() -> datetime:
    return datetime.now(UTC)


def iso(dt: datetime) -> str:
    """Fixed-width UTC ISO string that sorts correctly as text."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def dumps(obj: Any) -> str:
    if isinstance(obj, BaseModel):
        return obj.model_dump_json()
    if isinstance(obj, list) and obj and isinstance(obj[0], BaseModel):
        return "[" + ",".join(item.model_dump_json() for item in obj) + "]"
    return json.dumps(obj, default=_json_default, separators=(",", ":"))


def _json_default(obj: Any) -> Any:
    if isinstance(obj, BaseModel):
        return obj.model_dump(mode="json")
    if isinstance(obj, datetime):
        return iso(obj)
    raise TypeError(f"not JSON serializable: {type(obj).__name__}")


class Database:
    """Thread-safe access: one SQLite connection per thread, WAL mode.

    Use ``read()`` for queries and ``tx()`` for writes (BEGIN IMMEDIATE, so
    concurrent writers from the two processes queue on busy_timeout instead of
    failing).
    """

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self._local = threading.local()
        self._all: list[sqlite3.Connection] = []
        self._lock = threading.Lock()

    # -- connections -------------------------------------------------------

    def conn(self) -> sqlite3.Connection:
        conn = getattr(self._local, "conn", None)
        if conn is None:
            if str(self.path) != ":memory:":
                self.path.parent.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(self.path, timeout=10, isolation_level=None, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.execute("PRAGMA busy_timeout=10000")
            conn.execute("PRAGMA foreign_keys=ON")
            self._local.conn = conn
            with self._lock:
                self._all.append(conn)
        return conn

    def close(self) -> None:
        with self._lock:
            for conn in self._all:
                with contextlib.suppress(sqlite3.Error):
                    conn.close()
            self._all.clear()
        self._local = threading.local()

    def init(self) -> Database:
        conn = self.conn()
        conn.executescript(DDL)
        conn.execute(
            "INSERT INTO meta(key, value) VALUES ('schema_version', ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (str(SCHEMA_VERSION),),
        )
        return self

    @contextmanager
    def tx(self) -> Iterator[sqlite3.Connection]:
        conn = self.conn()
        conn.execute("BEGIN IMMEDIATE")
        try:
            yield conn
        except BaseException:
            conn.execute("ROLLBACK")
            raise
        else:
            conn.execute("COMMIT")

    def read(self, sql: str, params: tuple | dict = ()) -> list[sqlite3.Row]:
        return self.conn().execute(sql, params).fetchall()

    def read_one(self, sql: str, params: tuple | dict = ()) -> sqlite3.Row | None:
        return self.conn().execute(sql, params).fetchone()

    # -- settings ------------------------------------------------------------

    def get_settings(self) -> BotSettings:
        row = self.read_one("SELECT version, updated_at, payload FROM settings WHERE id = 1")
        if row is None:
            return self.save_settings(BotSettings())
        settings = BotSettings.model_validate_json(row["payload"])
        settings.version = row["version"]
        settings.updated_at = parse_iso(row["updated_at"])
        return settings

    def save_settings(self, settings: BotSettings) -> BotSettings:
        now = utcnow()
        with self.tx() as conn:
            row = conn.execute("SELECT version FROM settings WHERE id = 1").fetchone()
            version = (row["version"] if row else 0) + 1
            saved = settings.model_copy(update={"version": version, "updated_at": now})
            conn.execute(
                "INSERT INTO settings(id, version, updated_at, payload) VALUES (1, ?, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET version = excluded.version, "
                "updated_at = excluded.updated_at, payload = excluded.payload",
                (version, iso(now), saved.model_dump_json()),
            )
        return saved

    def settings_version(self) -> int:
        row = self.read_one("SELECT version FROM settings WHERE id = 1")
        return row["version"] if row else 0

    # -- live_state ----------------------------------------------------------

    def put_live(self, key: str, value: Any, conn: sqlite3.Connection | None = None) -> None:
        sql = (
            "INSERT INTO live_state(key, version, updated_at, payload) VALUES (?, 1, ?, ?) "
            "ON CONFLICT(key) DO UPDATE SET version = live_state.version + 1, "
            "updated_at = excluded.updated_at, payload = excluded.payload"
        )
        params = (key, iso(utcnow()), dumps(value))
        if conn is not None:
            conn.execute(sql, params)
        else:
            with self.tx() as c:
                c.execute(sql, params)

    def get_live(self, key: str) -> Any | None:
        row = self.read_one("SELECT payload FROM live_state WHERE key = ?", (key,))
        return json.loads(row["payload"]) if row else None

    def live_versions(self) -> dict[str, int]:
        return {row["key"]: row["version"] for row in self.read("SELECT key, version FROM live_state")}

    # -- events outbox -------------------------------------------------------

    def append_event(
        self,
        type: str,
        title: str,
        message: str,
        *,
        severity: str = "info",
        symbol: str | None = None,
        data: dict[str, Any] | None = None,
        ts: datetime | None = None,
        conn: sqlite3.Connection | None = None,
    ) -> int:
        ts = ts or utcnow()
        payload = {
            "ts": iso(ts),
            "type": type,
            "severity": severity,
            "symbol": symbol,
            "title": title,
            "message": message,
            "data": data or {},
        }
        sql = "INSERT INTO events(ts, type, severity, symbol, payload) VALUES (?, ?, ?, ?, ?)"
        params = (iso(ts), type, severity, symbol, dumps(payload))
        if conn is not None:
            return int(conn.execute(sql, params).lastrowid)
        with self.tx() as c:
            return int(c.execute(sql, params).lastrowid)

    def events_after(self, last_id: int, limit: int = 500) -> list[Event]:
        rows = self.read("SELECT id, payload FROM events WHERE id > ? ORDER BY id LIMIT ?", (last_id, limit))
        return [row_to_event(r) for r in rows]

    def last_event_id(self) -> int:
        row = self.read_one("SELECT MAX(id) AS id FROM events")
        return int(row["id"] or 0) if row else 0

    # -- notifications -------------------------------------------------------

    def add_notification(
        self,
        type: str,
        title: str,
        message: str,
        *,
        severity: str = "info",
        data: dict[str, Any] | None = None,
        ts: datetime | None = None,
        conn: sqlite3.Connection | None = None,
    ) -> int:
        ts = ts or utcnow()
        payload = {
            "ts": iso(ts),
            "type": type,
            "severity": severity,
            "title": title,
            "message": message,
            "data": data or {},
        }
        sql = "INSERT INTO notifications(ts, type, severity, read, payload) VALUES (?, ?, ?, 0, ?)"
        params = (iso(ts), type, severity, dumps(payload))
        if conn is not None:
            return int(conn.execute(sql, params).lastrowid)
        with self.tx() as c:
            return int(c.execute(sql, params).lastrowid)


def row_to_event(row: sqlite3.Row) -> Event:
    return Event.model_validate({**json.loads(row["payload"]), "id": row["id"]})


def row_to_notification(row: sqlite3.Row) -> Notification:
    return Notification.model_validate(
        {**json.loads(row["payload"]), "id": row["id"], "read": bool(row["read"])}
    )
