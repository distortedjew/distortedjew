#!/usr/bin/env python3
"""Read-only dashboard for the five bots. Reads the shared SQLite store; holds no broker keys.

    python dashboard/server.py            # http://127.0.0.1:8080
Set DASHBOARD_PASSWORD to require a login (and to allow binding to 0.0.0.0).
"""
from __future__ import annotations

import base64
import hmac
import json
import os
import sqlite3
import sys
import threading
import uuid
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from optionbots import backtest as bt  # noqa: E402
from optionbots.bots import BOTS  # noqa: E402
from optionbots.config import load_settings  # noqa: E402
from optionbots.store import Store  # noqa: E402

STATIC = Path(__file__).resolve().parent / "static"
TYPES = {".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".js": "text/javascript",
         ".css": "text/css", ".png": "image/png"}


def bot_summary(store: Store, cls) -> dict:
    name = cls.name
    hb = store.db.execute("SELECT * FROM heartbeats WHERE bot=?", (name,)).fetchone()
    detail = json.loads(hb["detail"]) if hb else {}
    open_pos = store.positions(name, "open")
    closed = store.positions(name, "closed", limit=10_000)
    booked = [p for p in closed if p["pnl"] is not None]
    wins = [p for p in booked if p["pnl"] > 0]
    stock = detail.get("stock") or {}
    unreal = sum(p["mark_pnl"] or 0 for p in open_pos) + (stock.get("unrealized") or 0)
    age = None
    if hb:
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(hb["ts"])).total_seconds()
    curve, total = [], 0.0
    for p in sorted(booked, key=lambda p: p["closed_at"]):
        total += p["pnl"]
        curve.append({"t": p["closed_at"], "v": round(total, 2)})
    return {
        "name": name, "title": cls.title, "underlying": cls.underlying, "tagline": cls.tagline,
        "strategy": cls.strategy, "color": cls.color,
        "rules": {"take_profit": cls.take_profit, "stop_loss": cls.stop_loss, "exit_dte": cls.exit_dte,
                  "max_open": cls.max_open},
        "status": (hb["status"] if hb else "offline") if age is None or age < 600 else "stale",
        "heartbeat": hb["ts"] if hb else None, "heartbeat_age": age, "detail": detail,
        "open": open_pos, "recent": closed[:15],
        "stats": {"trades": len(booked), "wins": len(wins),
                  "win_rate": len(wins) / len(booked) if booked else None,
                  "realized": round(sum(p["pnl"] for p in booked), 2), "unrealized": round(unreal, 2)},
        "curve": curve,
    }


def reason_group(reason: str | None) -> str:
    """'take profit (+52%)' -> 'take profit'."""
    return (reason or "unknown").split(" (")[0].split(":")[0].strip()


def bot_detail(store: Store, cls) -> dict:
    """Everything the per-bot page needs: summary, full history, analytics and the bot's own events."""
    out = bot_summary(store, cls)
    closed = sorted(store.positions(cls.name, "closed", limit=100_000), key=lambda p: p["closed_at"] or "")
    booked = [p for p in closed if p["pnl"] is not None]
    wins = [p["pnl"] for p in booked if p["pnl"] > 0]
    losses = [p["pnl"] for p in booked if p["pnl"] <= 0]
    peak = cum = max_dd = 0.0
    for p in booked:
        cum += p["pnl"]
        peak = max(peak, cum)
        max_dd = min(max_dd, cum - peak)
    holds = []
    for p in booked:
        try:
            holds.append((datetime.fromisoformat(p["closed_at"]) - datetime.fromisoformat(p["opened_at"])).total_seconds() / 86400)
        except (TypeError, ValueError):
            pass
    reasons: dict[str, dict] = {}
    for p in booked:
        r = reasons.setdefault(reason_group(p["exit_reason"]), {"count": 0, "pnl": 0.0})
        r["count"] += 1
        r["pnl"] = round(r["pnl"] + p["pnl"], 2)
    out["analytics"] = {
        "avg_win": sum(wins) / len(wins) if wins else None,
        "avg_loss": sum(losses) / len(losses) if losses else None,
        "profit_factor": (sum(wins) / -sum(losses)) if losses and sum(losses) < 0 else None,
        "expectancy": sum(p["pnl"] for p in booked) / len(booked) if booked else None,
        "best": max((p["pnl"] for p in booked), default=None),
        "worst": min((p["pnl"] for p in booked), default=None),
        "max_drawdown": round(max_dd, 2),
        "avg_hold_days": sum(holds) / len(holds) if holds else None,
        "exit_reasons": reasons,
        "open_risk": round(sum(p["max_loss"] * p["qty"] for p in out["open"]), 2),
    }
    out["history"] = list(reversed(closed))
    out["events"] = [dict(r) for r in store.db.execute(
        "SELECT * FROM events WHERE bot=? ORDER BY id DESC LIMIT 200", (cls.name,)).fetchall()]
    return out


def state(store: Store) -> dict:
    since = (datetime.now(timezone.utc) - timedelta(days=90)).strftime("%Y-%m-%dT%H:%M")
    eq = [{"t": r["minute"], "v": r["equity"]} for r in
          store.db.execute("SELECT * FROM equity WHERE minute >= ? ORDER BY minute", (since,)).fetchall()]
    events = [dict(r) for r in store.db.execute("SELECT * FROM events ORDER BY id DESC LIMIT 80").fetchall()]
    return {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "bots": [bot_summary(store, cls) for cls in BOTS.values()],
            "equity": eq, "events": events}


class BacktestJobs:
    """Runs one backtest at a time in a background thread; the page polls for progress."""

    def __init__(self):
        self.jobs: dict[str, dict] = {}
        self.busy = threading.Lock()

    def start(self, req: dict) -> tuple[int, dict]:
        name = req.get("bot")
        if name not in BOTS:
            return 400, {"error": "unknown bot"}
        try:
            end = date.fromisoformat(req["end"]) if req.get("end") else date.today() - timedelta(days=1)
            start = date.fromisoformat(req["start"]) if req.get("start") else end - timedelta(days=int(float(req.get("years", 3)) * 365))
            capital = float(req.get("capital", 100_000))
            model = bt.Model(**{k: float(v) for k, v in (req.get("model") or {}).items() if k in bt.Model.__dataclass_fields__})
            risk = float(req["risk_per_trade_pct"]) if req.get("risk_per_trade_pct") not in (None, "") else None
            alloc = float(req["allocation_pct"]) if req.get("allocation_pct") not in (None, "") else None
        except (ValueError, TypeError, KeyError) as e:
            return 400, {"error": f"bad parameters: {e}"}
        if not (date(2005, 1, 1) <= start < end) or (end - start).days > 365 * 12 or not 1_000 <= capital <= 1e9:
            return 400, {"error": "dates must be in order, at most 12 years apart; capital 1,000 - 1,000,000,000"}
        if not self.busy.acquire(blocking=False):
            return 429, {"error": "another backtest is running - try again in a few seconds"}
        jid = uuid.uuid4().hex[:12]
        job = self.jobs[jid] = {"id": jid, "status": "running", "progress": 0.0, "bot": name}

        def work():
            try:
                job["result"] = bt.run_backtest(name, start, end, capital, req.get("overrides") or {}, model,
                                                risk, alloc, progress=lambda p: job.update(progress=p))
                job["status"], job["progress"] = "done", 1.0
            except Exception as e:     # report to the page instead of dying silently
                job["status"], job["error"] = "error", str(e)
            finally:
                self.busy.release()

        threading.Thread(target=work, name=f"backtest-{jid}", daemon=True).start()
        if len(self.jobs) > 20:        # keep memory bounded
            for old in list(self.jobs)[:-20]:
                self.jobs.pop(old, None)
        return 202, {"id": jid}


JOBS = BacktestJobs()


def make_handler(store: Store, password: str, user: str):
    lock = threading.Lock()     # one SQLite connection, many request threads
    expected = base64.b64encode(f"{user}:{password}".encode()).decode() if password else ""

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _send(self, code: int, body: bytes, ctype: str, extra: dict | None = None):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", "no-store")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(body)

        def _authorized(self) -> bool:
            if not expected:
                return True
            got = self.headers.get("Authorization", "").removeprefix("Basic ")
            if hmac.compare_digest(got, expected):
                return True
            self._send(401, b"login required", "text/plain", {"WWW-Authenticate": 'Basic realm="options-bots"'})
            return False

        def _json(self, code: int, obj) -> None:
            self._send(code, json.dumps(obj, default=str).encode(), "application/json")

        def do_POST(self):
            if not self._authorized():
                return
            if self.path.split("?")[0] != "/api/backtest":
                return self._send(404, b"not found", "text/plain")
            try:
                length = min(int(self.headers.get("Content-Length", 0)), 64_000)
                req = json.loads(self.rfile.read(length) or b"{}")
            except (ValueError, json.JSONDecodeError):
                return self._json(400, {"error": "invalid JSON"})
            code, body = JOBS.start(req if isinstance(req, dict) else {})
            self._json(code, body)

        def do_GET(self):
            if not self._authorized():
                return
            path = self.path.split("?")[0]
            if path.startswith("/api/backtest/"):
                job = JOBS.jobs.get(path.rsplit("/", 1)[-1])
                return self._json(200, dict(job)) if job else self._json(404, {"error": "unknown job"})
            if path == "/api/backtest-defaults":
                return self._json(200, {n: {k: getattr(c, k) for k in bt.TUNABLE if hasattr(c, k)} for n, c in BOTS.items()}
                                  | {"_model": bt.Model().__dict__})
            if path.startswith("/api/bot/"):
                cls = BOTS.get(path.rsplit("/", 1)[-1])
                if not cls:
                    return self._send(404, b"unknown bot", "text/plain")
                with lock:
                    body = json.dumps(bot_detail(store, cls), default=str).encode()
                return self._send(200, body, "application/json")
            if path == "/api/state":
                try:
                    with lock:
                        body = json.dumps(state(store), default=str).encode()
                except sqlite3.Error as e:
                    return self._send(503, str(e).encode(), "text/plain")
                return self._send(200, body, "application/json")
            rel = "index.html" if path in ("/", "") else path.lstrip("/")
            f = (STATIC / rel).resolve()
            if STATIC not in f.parents or not f.is_file():
                return self._send(404, b"not found", "text/plain")
            self._send(200, f.read_bytes(), TYPES.get(f.suffix, "application/octet-stream"))

    return Handler


def main() -> None:
    settings = load_settings()
    password = os.environ.get("DASHBOARD_PASSWORD", "")
    user = os.environ.get("DASHBOARD_USER", "admin")
    host = os.environ.get("DASHBOARD_HOST", "0.0.0.0" if password else "127.0.0.1")
    if host not in ("127.0.0.1", "localhost") and not password:
        raise SystemExit("Refusing to expose the dashboard without DASHBOARD_PASSWORD")
    port = int(os.environ.get("DASHBOARD_PORT", 8080))
    store = Store(settings.db_path)
    print(f"dashboard on http://{host}:{port}", flush=True)
    ThreadingHTTPServer((host, port), make_handler(store, password, user)).serve_forever()


if __name__ == "__main__":
    main()
