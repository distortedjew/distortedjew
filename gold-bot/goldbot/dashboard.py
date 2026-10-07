"""Read-only web dashboard, served by the bot process itself (stdlib only).

    http://127.0.0.1:8050            the page
    http://127.0.0.1:8050/api/status the JSON it polls every 15 s

It has no buttons that trade. By default it listens on localhost only: from your own
computer use an SSH tunnel (ssh -L 8050:127.0.0.1:8050 you@vps). To expose it, set
DASHBOARD_HOST=0.0.0.0 and DASHBOARD_TOKEN, then open http://vps:8050/?token=...
"""
from __future__ import annotations

import hmac
import json
import logging
import math
import threading
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

log = logging.getLogger("goldbot")
PAGE = Path(__file__).with_name("dashboard.html")
CLOSE_EVENTS = {"closed": "stop / target", "time_close": "time / weekend exit",
                "kill_switch_close": "daily loss limit"}


def _clean(x):
    """JSON-safe: NaN/inf become null."""
    if isinstance(x, float):
        return x if math.isfinite(x) else None
    if isinstance(x, dict):
        return {k: _clean(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_clean(v) for v in x]
    return x


def _tail_jsonl(path: Path, n: int) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    with path.open() as f:
        for line in deque(f, maxlen=n):
            try:
                rows.append(json.loads(line))
            except ValueError:
                continue
    return rows


def trades_from_journal(rows: list[dict]) -> list[dict]:
    """Pair each 'open' with its close; P&L is the equity change while the trade was on."""
    trades: dict[str, dict] = {}
    for r in rows:
        tid = r.get("trade_id")
        if r["event"] == "open":
            trades[tid] = {"time": r["ts"], "side": r["side"], "units": r["units"], "entry": r["entry"],
                           "sl": r["sl"], "tp": r["tp"], "reason": r.get("reason", ""),
                           "equity_open": r.get("equity"), "result": "open", "pnl": None}
        elif r["event"] == "breakeven" and tid in trades:
            trades[tid]["sl"] = r["sl"]
        elif r["event"] in CLOSE_EVENTS and tid in trades and trades[tid]["result"] == "open":
            t = trades[tid]
            t["result"] = CLOSE_EVENTS[r["event"]]
            if r.get("equity") is not None and t["equity_open"] is not None:
                t["pnl"] = r["equity"] - t["equity_open"]
    return list(reversed(list(trades.values())))


def describe(r: dict) -> str:
    e = r["event"]
    if e == "open":
        return (f"{r['side'].upper()} {r['units']:g} oz @ {r['entry']:.2f} · SL {r['sl']:.2f} · "
                f"TP {r['tp']:.2f} ({r.get('reason', '')})")
    if e == "breakeven":
        return f"Stop moved to breakeven: {r['sl']:.2f}"
    if e == "closed":
        return f"Trade closed by stop/target. Equity {r.get('equity', 0):,.2f}"
    if e == "time_close":
        return f"Closed after {r.get('bars', '?')} bars (time / weekend exit)"
    if e == "kill_switch_close":
        return "Daily loss limit hit: position closed, no more trades today"
    if e == "skipped":
        return f"{r.get('side', '').capitalize()} signal skipped: {r.get('why', '')}"
    return e


def build_status(bot) -> dict:
    with bot.lock:
        snap = dict(bot.snapshot)
    rows = _tail_jsonl(bot.journal, 2000)
    eq = _tail_jsonl(bot.equity_log, 5000)
    step = max(1, len(eq) // 400)
    snap["equity_curve"] = [[r["t"], r["equity"]] for r in eq[::step]] + ([[eq[-1]["t"], eq[-1]["equity"]]] if eq else [])
    snap["trades"] = trades_from_journal(rows)[:20]
    snap["events"] = [{"ts": r["ts"], "text": describe(r)} for r in reversed(rows[-30:])]
    return _clean(snap)


def make_handler(bot):
    token = bot.cfg.dashboard_token

    class Handler(BaseHTTPRequestHandler):
        def _authorized(self, query: dict) -> bool:
            if not token:
                return True
            given = query.get("token", [""])[0] or self.headers.get("X-Token", "")
            return hmac.compare_digest(given.encode(), token.encode())

        def _send(self, code: int, body: bytes, ctype: str) -> None:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):  # noqa: N802
            url = urlparse(self.path)
            if not self._authorized(parse_qs(url.query)):
                return self._send(401, b"unauthorized: add ?token=...", "text/plain")
            if url.path == "/":
                return self._send(200, PAGE.read_bytes(), "text/html; charset=utf-8")
            if url.path == "/api/status":
                try:
                    body = json.dumps(build_status(bot)).encode()
                except Exception as e:  # never let the dashboard take the bot down
                    log.exception("dashboard status failed")
                    return self._send(500, json.dumps({"error": str(e)}).encode(), "application/json")
                return self._send(200, body, "application/json")
            return self._send(404, b"not found", "text/plain")

        def log_message(self, *args):  # keep the bot log clean
            pass

    return Handler


def start_dashboard(bot) -> ThreadingHTTPServer | None:
    cfg = bot.cfg
    try:
        srv = ThreadingHTTPServer((cfg.dashboard_host, cfg.dashboard_port), make_handler(bot))
    except OSError as e:
        log.error("dashboard could not start on %s:%s: %s", cfg.dashboard_host, cfg.dashboard_port, e)
        return None
    threading.Thread(target=srv.serve_forever, daemon=True, name="dashboard").start()
    log.info("dashboard on http://%s:%d", cfg.dashboard_host, srv.server_address[1])
    return srv
