"""SQLite store shared by the bots (writers) and the dashboard (reader)."""
from __future__ import annotations

import json
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot TEXT NOT NULL, underlying TEXT NOT NULL, kind TEXT NOT NULL, direction TEXT NOT NULL,
  legs TEXT NOT NULL, qty INTEGER NOT NULL,
  entry_price REAL NOT NULL,          -- net per unit at open: debit > 0, credit < 0
  max_loss REAL NOT NULL,             -- dollars per unit
  opened_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
  closed_at TEXT, exit_price REAL, pnl REAL, exit_reason TEXT,
  mark REAL, mark_pnl REAL, marked_at TEXT,
  meta TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS positions_bot ON positions(bot, status);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, bot TEXT NOT NULL, ts TEXT NOT NULL,
  level TEXT NOT NULL, message TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS heartbeats (
  bot TEXT PRIMARY KEY, ts TEXT NOT NULL, status TEXT NOT NULL, detail TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS equity (
  minute TEXT PRIMARY KEY, equity REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (
  bot TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (bot, key)
);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Store:
    def __init__(self, path: Path | str, clock=None):
        self.path = path
        self.clock = clock or (lambda: datetime.now(timezone.utc))   # a backtest passes simulated time
        self.db = sqlite3.connect(str(path), timeout=30, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript(SCHEMA)
        self.db.commit()

    def _now(self) -> str:
        return self.clock().astimezone(timezone.utc).isoformat(timespec="seconds")

    def _exec(self, sql: str, args: tuple = ()) -> sqlite3.Cursor:
        for attempt in range(5):
            try:
                cur = self.db.execute(sql, args)
                self.db.commit()
                return cur
            except sqlite3.OperationalError as e:
                if "locked" not in str(e) or attempt == 4:
                    raise
                time.sleep(0.2 * (attempt + 1))
        raise AssertionError("unreachable")

    # -- events / heartbeat / equity ------------------------------------------
    def event(self, bot: str, message: str, level: str = "info") -> None:
        self._exec("INSERT INTO events(bot, ts, level, message) VALUES (?,?,?,?)", (bot, self._now(), level, message))

    def heartbeat(self, bot: str, status: str, detail: dict) -> None:
        self._exec("INSERT OR REPLACE INTO heartbeats(bot, ts, status, detail) VALUES (?,?,?,?)",
                   (bot, self._now(), status, json.dumps(detail, default=str)))

    def record_equity(self, equity: float) -> None:
        minute = self.clock().astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M")
        self._exec("INSERT OR REPLACE INTO equity(minute, equity) VALUES (?,?)", (minute, equity))

    # -- key/value per bot --------------------------------------------------------
    def get(self, bot: str, key: str, default=None):
        row = self.db.execute("SELECT value FROM kv WHERE bot=? AND key=?", (bot, key)).fetchone()
        return json.loads(row["value"]) if row else default

    def put(self, bot: str, key: str, value) -> None:
        self._exec("INSERT OR REPLACE INTO kv(bot, key, value) VALUES (?,?,?)", (bot, key, json.dumps(value)))

    # -- positions ------------------------------------------------------------------
    def open_position(self, bot: str, underlying: str, kind: str, direction: str, legs: list[dict],
                      qty: int, entry_price: float, max_loss: float, meta: dict) -> int:
        cur = self._exec(
            "INSERT INTO positions(bot, underlying, kind, direction, legs, qty, entry_price, max_loss, opened_at, meta)"
            " VALUES (?,?,?,?,?,?,?,?,?,?)",
            (bot, underlying, kind, direction, json.dumps(legs), qty, entry_price, max_loss, self._now(), json.dumps(meta)))
        return cur.lastrowid

    def close_position(self, pid: int, exit_price: float | None, pnl: float | None, reason: str, qty_left: int = 0) -> None:
        if qty_left > 0:   # partial close: book the closed part as its own row, keep the rest open
            row = self.db.execute("SELECT * FROM positions WHERE id=?", (pid,)).fetchone()
            closed_qty = row["qty"] - qty_left
            self._exec(
                "INSERT INTO positions(bot, underlying, kind, direction, legs, qty, entry_price, max_loss, opened_at,"
                " status, closed_at, exit_price, pnl, exit_reason, meta) VALUES (?,?,?,?,?,?,?,?,?,'closed',?,?,?,?,?)",
                (row["bot"], row["underlying"], row["kind"], row["direction"], row["legs"], closed_qty,
                 row["entry_price"], row["max_loss"], row["opened_at"], self._now(), exit_price, pnl, reason, row["meta"]))
            self._exec("UPDATE positions SET qty=? WHERE id=?", (qty_left, pid))
            return
        self._exec("UPDATE positions SET status='closed', closed_at=?, exit_price=?, pnl=?, exit_reason=? WHERE id=?",
                   (self._now(), exit_price, pnl, reason, pid))

    def mark(self, pid: int, mark: float, mark_pnl: float) -> None:
        self._exec("UPDATE positions SET mark=?, mark_pnl=?, marked_at=? WHERE id=?", (mark, mark_pnl, self._now(), pid))

    def positions(self, bot: str | None = None, status: str | None = "open", limit: int = 500) -> list[dict]:
        sql, args = "SELECT * FROM positions WHERE 1=1", []
        if bot:
            sql += " AND bot=?"
            args.append(bot)
        if status:
            sql += " AND status=?"
            args.append(status)
        sql += " ORDER BY id DESC LIMIT ?"
        args.append(limit)
        out = []
        for r in self.db.execute(sql, args).fetchall():
            d = dict(r)
            d["legs"], d["meta"] = json.loads(d["legs"]), json.loads(d["meta"])
            out.append(d)
        return out

    def last_open_time(self, bot: str) -> str | None:
        row = self.db.execute("SELECT MAX(opened_at) AS t FROM positions WHERE bot=?", (bot,)).fetchone()
        return row["t"] if row else None
