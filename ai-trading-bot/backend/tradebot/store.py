"""Engine-side persistence: everything the trading engine writes to the shared database.

The API process only reads these rows, so every write is shaped by the contract in
``schemas.py`` and the table comments in ``db.py``:

- ``write(batch)`` persists one ``core.Batch`` in a single transaction — AI decisions
  (rewritten when the risk decision, trade id or evaluation change), position upserts, the
  atomic position → trade move on a close (same id), equity snapshots, ``ai_usage`` rows,
  regime segments, MTF / regime snapshots, events (``db.append_event``) and notifications
  (``db.add_notification``). An ``AIAnalysis`` is therefore always committed together with its
  ``AI_ANALYSIS`` event. ``write_many`` does the same for a run of batches (bootstrap replays).
- ``flush_live`` upserts the forming candles and the ``live_state`` snapshots (ticker,
  portfolio, positions, …) in one transaction, about once a second.
- ``housekeeping`` applies the retention rules; the loaders rebuild the engine's state after a
  restart (positions, realized P&L, the day's numbers, peak equity, halts, pending signal
  evaluations, regimes) and tell a feed what market data is already stored.

Engine bookkeeping that has no table of its own (risk halts, day-start equity, simulator state)
lives in the ``meta`` key/value table under ``engine.*`` keys.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from .core import Batch, EquityRecord, EventRecord, NotificationRecord, RestoredState
from .db import Database, dumps, iso, parse_iso, utcnow
from .market.candles import CandleArrays
from .market.feed import MarketHistory, StoredMarket
from .risk import RiskState
from .schemas import (
    TIMEFRAMES,
    AIAnalysis,
    Candle,
    MTFReport,
    Notification,
    Position,
    RegimeState,
    Trade,
)

log = logging.getLogger(__name__)

META_RISK = "engine.risk_state"
META_ACCOUNTING = "engine.accounting"
META_SIM = "engine.sim_state"
META_BOOTSTRAP = "engine.bootstrap"

# Retention (engine housekeeping, hourly)
MARKET_UPDATE_DAYS = 7
CANDLE_RETENTION_DAYS: dict[str, int] = {"1m": 14, "5m": 60, "15m": 180}

RECENT_TRADES = 20
CANDLE_SQL = (
    "INSERT INTO candles(symbol, timeframe, time, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
    "ON CONFLICT(symbol, timeframe, time) DO UPDATE SET open = excluded.open, high = excluded.high, "
    "low = excluded.low, close = excluded.close, volume = excluded.volume"
)

CandleRow = tuple[str, str, int, float, float, float, float, float]


def candle_row(symbol: str, timeframe: str, c: Candle) -> CandleRow:
    return (symbol, timeframe, int(c.time), c.open, c.high, c.low, c.close, c.volume)


def _midnight(now: datetime) -> datetime:
    return now.astimezone(UTC).replace(hour=0, minute=0, second=0, microsecond=0)


@dataclass(slots=True)
class HousekeepingReport:
    market_updates: int = 0
    candles: int = 0

    @property
    def total(self) -> int:
        return self.market_updates + self.candles


class Store:
    """Engine writes on a ``db.Database``.

    ``historical=True`` (the bootstrap replay) writes snapshots that only matter "now" —
    the MTF and regime ``live_state`` keys — once at the end (``finish_historical``) instead of
    for every replayed bar.
    """

    def __init__(self, db: Database, *, historical: bool = False) -> None:
        self.db = db
        self.historical = historical
        #: called with the notifications a write created (unread ones only), for channel delivery
        self.on_notifications: Callable[[list[Notification]], None] | None = None
        self._open_regime: dict[str, tuple[int, str]] | None = None  # symbol → (row id, regime)
        self._pending_live: dict[str, Any] = {}

    # ------------------------------------------------------------------
    # core batches
    # ------------------------------------------------------------------

    def write(self, batch: Batch) -> None:
        self.write_many([batch])

    def write_many(self, batches: Sequence[Batch]) -> None:
        created: list[Notification] = []
        with self.db.tx() as conn:
            for batch in batches:
                created.extend(self._write(conn, batch))
        if created and self.on_notifications is not None:
            self.on_notifications(created)

    def _write(self, conn: sqlite3.Connection, batch: Batch) -> list[Notification]:
        for analysis in batch.analyses:
            self._analysis(conn, analysis)
        closing = {t.id for t in batch.closed}
        for pos in batch.positions:
            if pos.id not in closing:
                self._position(conn, pos)
        for trade in batch.closed:
            self._close(conn, trade)
        for rec in batch.equity:
            self._equity(conn, rec)
        for usage in batch.usage:
            conn.execute(
                "INSERT INTO ai_usage(ts, provider, model, success, latency_ms, prompt_tokens, completion_tokens, "
                "cost_usd, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    iso(usage.ts),
                    usage.provider,
                    usage.model,
                    int(usage.success),
                    round(usage.latency_ms, 1),
                    usage.prompt_tokens,
                    usage.completion_tokens,
                    usage.cost_usd,
                    usage.error,
                ),
            )
        for state, switched in batch.regimes:
            self._regime(conn, state, switched)
        for report in batch.mtf:
            self._live(conn, f"mtf:{report.symbol}", report)
        for event in batch.events:
            self._event(conn, event)
        created = [n for n in (self._notification(conn, rec) for rec in batch.notifications) if n is not None]
        if batch.risk_state is not None:
            self.set_meta(META_RISK, batch.risk_state, conn=conn)
        if batch.accounting is not None:
            self.set_meta(META_ACCOUNTING, batch.accounting, conn=conn)
        return created

    def _analysis(self, conn: sqlite3.Connection, a: AIAnalysis) -> None:
        conn.execute(
            "INSERT INTO ai_decisions(id, created_at, symbol, signal, confidence, provider, risk_status, eval_status, "
            "trade_id, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET "
            "risk_status = excluded.risk_status, eval_status = excluded.eval_status, trade_id = excluded.trade_id, "
            "payload = excluded.payload",
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

    def _position(self, conn: sqlite3.Connection, p: Position) -> None:
        conn.execute(
            "INSERT INTO positions(id, symbol, side, opened_at, payload) VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET payload = excluded.payload",
            (p.id, p.symbol, p.side, iso(p.opened_at), p.model_dump_json()),
        )

    def _close(self, conn: sqlite3.Connection, t: Trade) -> None:
        """The position row becomes a trade row with the same id, atomically."""
        conn.execute("DELETE FROM positions WHERE id = ?", (t.id,))
        conn.execute(
            "INSERT INTO trades(id, symbol, side, strategy, result, exit_reason, regime, opened_at, closed_at, pnl, "
            "pnl_pct, ai_confidence, analysis_id, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET result = excluded.result, exit_reason = excluded.exit_reason, "
            "closed_at = excluded.closed_at, pnl = excluded.pnl, pnl_pct = excluded.pnl_pct, payload = excluded.payload",
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

    def _equity(self, conn: sqlite3.Connection, r: EquityRecord) -> None:
        conn.execute(
            "INSERT INTO equity_snapshots(time, equity, cash, realized_pnl, unrealized_pnl, exposure, drawdown_pct) "
            "VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(time) DO UPDATE SET equity = excluded.equity, "
            "cash = excluded.cash, realized_pnl = excluded.realized_pnl, unrealized_pnl = excluded.unrealized_pnl, "
            "exposure = excluded.exposure, drawdown_pct = excluded.drawdown_pct",
            (r.time, r.equity, r.cash, r.realized_pnl, r.unrealized_pnl, r.exposure, r.drawdown_pct),
        )

    def _regime(self, conn: sqlite3.Connection, state: RegimeState, switched: bool) -> None:
        """Keep ``regime_history`` as segments: a switch closes the open one and opens the next."""
        self._live(conn, f"regime:{state.symbol}", state)
        open_rows = self._open_segments(conn)
        current = open_rows.get(state.symbol)
        if current is not None and current[1] == state.regime and not switched:
            return
        start = state.since or state.updated_at
        if current is not None:
            conn.execute("UPDATE regime_history SET end = ? WHERE id = ?", (iso(start), current[0]))
        row_id = conn.execute(
            "INSERT INTO regime_history(symbol, regime, confidence, start, end) VALUES (?, ?, ?, ?, NULL)",
            (state.symbol, state.regime, state.confidence, iso(start)),
        ).lastrowid
        open_rows[state.symbol] = (int(row_id or 0), state.regime)

    def _open_segments(self, conn: sqlite3.Connection) -> dict[str, tuple[int, str]]:
        if self._open_regime is None:
            rows = conn.execute(
                "SELECT id, symbol, regime FROM regime_history WHERE end IS NULL ORDER BY id"
            ).fetchall()
            self._open_regime = {r["symbol"]: (int(r["id"]), r["regime"]) for r in rows}
        return self._open_regime

    def _live(self, conn: sqlite3.Connection, key: str, value: Any) -> None:
        if self.historical:
            self._pending_live[key] = value
        else:
            self.db.put_live(key, value, conn=conn)

    def _event(self, conn: sqlite3.Connection, e: EventRecord) -> None:
        self.db.append_event(
            e.type, e.title, e.message, severity=e.severity, symbol=e.symbol, data=e.data, ts=e.ts, conn=conn
        )

    def _notification(self, conn: sqlite3.Connection, n: NotificationRecord) -> Notification | None:
        nid = self.db.add_notification(
            n.type, n.title, n.message, severity=n.severity, data=n.data, ts=n.ts, conn=conn
        )
        if n.read:
            conn.execute("UPDATE notifications SET read = 1 WHERE id = ?", (nid,))
            return None
        return Notification(
            id=nid, ts=n.ts, type=n.type, severity=n.severity, title=n.title, message=n.message, data=n.data
        )

    def finish_historical(self) -> None:
        """Write the snapshots a historical replay held back, then behave like a live store."""
        if self._pending_live:
            with self.db.tx() as conn:
                for key, value in self._pending_live.items():
                    self.db.put_live(key, value, conn=conn)
        self._pending_live = {}
        self.historical = False

    # ------------------------------------------------------------------
    # engine-level events and notifications
    # ------------------------------------------------------------------

    def event(
        self,
        type: str,
        title: str,
        message: str,
        *,
        severity: str = "info",
        symbol: str | None = None,
        data: dict[str, Any] | None = None,
        ts: datetime | None = None,
    ) -> int:
        return self.db.append_event(type, title, message, severity=severity, symbol=symbol, data=data, ts=ts)

    def notify(
        self,
        type: str,
        title: str,
        message: str,
        *,
        severity: str = "info",
        data: dict[str, Any] | None = None,
        ts: datetime | None = None,
    ) -> Notification:
        ts = ts or utcnow()
        nid = self.db.add_notification(type, title, message, severity=severity, data=data, ts=ts)
        note = Notification(
            id=nid,
            ts=ts,
            type=type,  # type: ignore[arg-type]
            severity=severity,  # type: ignore[arg-type]
            title=title,
            message=message,
            data=data or {},
        )
        if self.on_notifications is not None:
            self.on_notifications([note])
        return note

    # ------------------------------------------------------------------
    # candles and live state
    # ------------------------------------------------------------------

    def write_history(self, history: MarketHistory) -> int:
        """Persist a feed's closed history (every symbol and timeframe) in one transaction."""
        rows = 0
        with self.db.tx() as conn:
            for symbol, per_tf in history.candles.items():
                for tf, arrays in per_tf.items():
                    if len(arrays):
                        conn.executemany(CANDLE_SQL, arrays.rows(symbol, tf))
                        rows += len(arrays)
        return rows

    def write_candles(self, rows: Iterable[CandleRow]) -> None:
        with self.db.tx() as conn:
            conn.executemany(CANDLE_SQL, list(rows))

    def flush_live(self, candles: Sequence[CandleRow], live: Mapping[str, Any]) -> None:
        """Forming / closed candle upserts and ``live_state`` snapshots in one transaction."""
        if not candles and not live:
            return
        with self.db.tx() as conn:
            if candles:
                conn.executemany(CANDLE_SQL, candles)
            for key, value in live.items():
                self.db.put_live(key, value, conn=conn)

    def put_live(self, key: str, value: Any) -> None:
        self.db.put_live(key, value)

    def get_live(self, key: str) -> Any | None:
        return self.db.get_live(key)

    def latest_candles(
        self, symbol: str, timeframe: str, limit: int, *, until: int | None = None
    ) -> list[Candle]:
        """The latest ``limit`` stored candles (open time ≤ ``until`` when given), oldest first."""
        if until is None:
            rows = self.db.read(
                "SELECT time, open, high, low, close, volume FROM candles WHERE symbol = ? AND timeframe = ? "
                "ORDER BY time DESC LIMIT ?",
                (symbol, timeframe, limit),
            )
        else:
            rows = self.db.read(
                "SELECT time, open, high, low, close, volume FROM candles WHERE symbol = ? AND timeframe = ? "
                "AND time <= ? ORDER BY time DESC LIMIT ?",
                (symbol, timeframe, until, limit),
            )
        return [
            Candle(
                time=r["time"],
                open=r["open"],
                high=r["high"],
                low=r["low"],
                close=r["close"],
                volume=r["volume"],
            )
            for r in reversed(rows)
        ]

    # ------------------------------------------------------------------
    # meta
    # ------------------------------------------------------------------

    def get_meta(self, key: str) -> Any | None:
        row = self.db.read_one("SELECT value FROM meta WHERE key = ?", (key,))
        if row is None:
            return None
        try:
            return json.loads(row["value"])
        except ValueError:
            return None

    def set_meta(self, key: str, value: Any, *, conn: sqlite3.Connection | None = None) -> None:
        sql = (
            "INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        )
        params = (key, dumps(value))
        if conn is not None:
            conn.execute(sql, params)
        else:
            with self.db.tx() as c:
                c.execute(sql, params)

    # ------------------------------------------------------------------
    # housekeeping
    # ------------------------------------------------------------------

    def housekeeping(self, now: datetime) -> HousekeepingReport:
        """Retention: MARKET_UPDATE events 7 days; 1m candles 14 days, 5m 60 days, 15m 180 days."""
        report = HousekeepingReport()
        with self.db.tx() as conn:
            report.market_updates = conn.execute(
                "DELETE FROM events WHERE type = 'MARKET_UPDATE' AND ts < ?",
                (iso(now - timedelta(days=MARKET_UPDATE_DAYS)),),
            ).rowcount
            for tf, days in CANDLE_RETENTION_DAYS.items():
                cutoff = int((now - timedelta(days=days)).timestamp())
                report.candles += conn.execute(
                    "DELETE FROM candles WHERE timeframe = ? AND time < ?", (tf, cutoff)
                ).rowcount
        if report.total:
            self.db.conn().execute("PRAGMA optimize")
        return report

    # ------------------------------------------------------------------
    # restart recovery
    # ------------------------------------------------------------------

    def is_empty(self) -> bool:
        """True for a fresh install: no market data and no trading history yet."""
        for table in ("candles", "trades", "positions", "ai_decisions", "equity_snapshots"):
            if self.db.read_one(f"SELECT 1 FROM {table} LIMIT 1") is not None:  # noqa: S608 - fixed names
                return False
        return True

    def stored_market(self, symbols: Sequence[str]) -> StoredMarket:
        """The latest closed 1m candle per symbol (the newest stored row may be a forming one)."""
        stored = StoredMarket(sim_state=self.get_meta(META_SIM))
        for sym in symbols:
            rows = self.db.read(
                "SELECT time, open, high, low, close, volume FROM candles WHERE symbol = ? AND timeframe = '1m' "
                "ORDER BY time DESC LIMIT 2",
                (sym,),
            )
            if not rows:
                continue
            last = rows[1] if len(rows) > 1 else rows[0]
            candle = Candle(
                time=last["time"],
                open=last["open"],
                high=last["high"],
                low=last["low"],
                close=last["close"],
                volume=last["volume"],
            )
            day_start = candle.time - candle.time % 86_400
            recent = self.db.read(
                "SELECT time, open, high, low, close, volume FROM candles WHERE symbol = ? AND timeframe = '1m' "
                "AND time >= ? AND time <= ? ORDER BY time",
                (sym, day_start, candle.time),
            )
            stored.last_1m[sym] = candle
            stored.recent_1m[sym] = [
                Candle(
                    time=r["time"],
                    open=r["open"],
                    high=r["high"],
                    low=r["low"],
                    close=r["close"],
                    volume=r["volume"],
                )
                for r in recent
            ]
        return stored

    def warmup_history(self, symbol: str, until: int, depth: int = 600) -> dict[str, list[Candle]]:
        """Stored candles of every timeframe for a core warm-up, ending at the closed 1m candle ``until``."""
        out: dict[str, list[Candle]] = {}
        for tf in TIMEFRAMES:
            out[tf] = self.latest_candles(symbol, tf, depth, until=until)
        return out

    def save_sim_state(self, state: dict | None) -> None:
        if state is not None:
            self.set_meta(META_SIM, state)

    def restored_state(self, now: datetime) -> RestoredState:
        """Everything the trading core needs to continue exactly where it stopped."""
        midnight = _midnight(now)
        today = midnight.date().isoformat()
        positions = [
            Position.model_validate_json(r["payload"]) for r in self.db.read("SELECT payload FROM positions")
        ]
        totals = self.db.read_one("SELECT COALESCE(SUM(pnl), 0) AS total FROM trades")
        today_pnl = self.db.read_one(
            "SELECT COALESCE(SUM(pnl), 0) AS pnl FROM trades WHERE closed_at >= ?", (iso(midnight),)
        )
        opened_today = self.db.read_one(
            "SELECT COUNT(*) AS n FROM trades WHERE opened_at >= ?", (iso(midnight),)
        )
        trades_today = int(opened_today["n"] if opened_today else 0) + sum(
            1 for p in positions if p.opened_at >= midnight
        )

        accounting = self.get_meta(META_ACCOUNTING) or {}
        day_start: float | None = None
        if accounting.get("day") == today and accounting.get("day_start_equity") is not None:
            day_start = float(accounting["day_start_equity"])
        else:
            row = self.db.read_one(
                "SELECT equity FROM equity_snapshots WHERE time <= ? ORDER BY time DESC LIMIT 1",
                (int(midnight.timestamp()),),
            )
            day_start = float(row["equity"]) if row else None
        extremes = self.db.read_one(
            "SELECT MAX(equity) AS peak, MIN(drawdown_pct) AS dd FROM equity_snapshots"
        )
        peaks = [
            v
            for v in (accounting.get("peak_equity"), extremes["peak"] if extremes else None)
            if v is not None
        ]
        dds = [
            v
            for v in (accounting.get("max_drawdown_pct"), extremes["dd"] if extremes else None)
            if v is not None
        ]

        risk_data = self.get_meta(META_RISK)
        risk_state = None
        if isinstance(risk_data, dict):
            try:
                risk_state = RiskState.from_dict(risk_data)
            except (TypeError, ValueError):
                log.warning("Ignoring unreadable risk state in the database")

        pending = [
            AIAnalysis.model_validate_json(r["payload"])
            for r in self.db.read(
                "SELECT payload FROM ai_decisions WHERE eval_status = 'PENDING' ORDER BY created_at"
            )
        ]
        regimes: dict[str, RegimeState] = {}
        for r in self.db.read("SELECT key, payload FROM live_state WHERE key LIKE 'regime:%'"):
            try:
                state = RegimeState.model_validate_json(r["payload"])
            except ValueError:
                continue
            regimes[state.symbol] = state
        latest: dict[str, AIAnalysis] = {}
        for r in self.db.read(
            "SELECT d.payload FROM ai_decisions d JOIN (SELECT symbol, MAX(created_at) AS created_at "
            "FROM ai_decisions GROUP BY symbol) m ON d.symbol = m.symbol AND d.created_at = m.created_at"
        ):
            a = AIAnalysis.model_validate_json(r["payload"])
            latest[a.symbol] = a
        recent = [
            Trade.model_validate_json(r["payload"])
            for r in self.db.read(
                "SELECT payload FROM trades ORDER BY closed_at DESC LIMIT ?", (RECENT_TRADES,)
            )
        ]
        recent.reverse()
        last_trade = self.db.read_one("SELECT MAX(closed_at) AS ts FROM trades")
        last_open = max((p.opened_at for p in positions), default=None)
        last_trade_at = parse_iso(last_trade["ts"]) if last_trade and last_trade["ts"] else None
        if last_open is not None and (last_trade_at is None or last_open > last_trade_at):
            last_trade_at = last_open
        last_analysis = self.db.read_one("SELECT MAX(created_at) AS ts FROM ai_decisions")
        return RestoredState(
            positions=positions,
            realized_total=float(totals["total"] if totals else 0.0),
            realized_today=float(today_pnl["pnl"] if today_pnl else 0.0),
            trades_today=trades_today,
            day_start_equity=day_start,
            peak_equity=max(peaks) if peaks else None,
            max_drawdown_pct=min(dds) if dds else 0.0,
            risk_state=risk_state,
            pending_evaluations=pending,
            regimes=regimes,
            latest_analysis=latest,
            recent_trades=recent,
            last_trade_at=last_trade_at,
            last_analysis_at=parse_iso(last_analysis["ts"])
            if last_analysis and last_analysis["ts"]
            else None,
            day=today,
        )

    def mtf_reports(self) -> dict[str, MTFReport]:
        out: dict[str, MTFReport] = {}
        for r in self.db.read("SELECT payload FROM live_state WHERE key LIKE 'mtf:%'"):
            try:
                report = MTFReport.model_validate_json(r["payload"])
            except ValueError:
                continue
            out[report.symbol] = report
        return out

    def summary(self) -> dict[str, Any]:
        """Row counts and trading totals (bootstrap announcement, logs)."""
        counts = {
            table: int(self.db.read_one(f"SELECT COUNT(*) AS n FROM {table}")["n"])  # noqa: S608 - fixed names
            for table in ("trades", "positions", "ai_decisions", "events", "equity_snapshots", "candles")
        }
        stats = self.db.read_one(
            "SELECT COUNT(*) AS n, COALESCE(SUM(pnl), 0) AS pnl, COALESCE(SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END), 0) "
            "AS wins FROM trades"
        )
        return {
            "counts": counts,
            "trades": int(stats["n"]) if stats else 0,
            "wins": int(stats["wins"]) if stats else 0,
            "realized_pnl": float(stats["pnl"]) if stats else 0.0,
        }


def arrays_rows(symbol: str, per_tf: Mapping[str, CandleArrays]) -> list[CandleRow]:
    rows: list[CandleRow] = []
    for tf, arrays in per_tf.items():
        rows.extend(arrays.rows(symbol, tf))
    return rows
