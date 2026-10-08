"""Read-only dashboard: serves the 3D city page and the state JSON the bots write. No control endpoints.

    python -m scalpcity.dashboard.server --state state.json --port 8050

    GET /api/state[?day=YYYY-MM-DD]   live state, minute bars for one day only (default: the latest)
    GET /api/stats                    performance across every day in the state file
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from ..stats import compute

STATIC = os.path.join(os.path.dirname(__file__), "static")


class StateCache:
    """Parses the state file once per change (the bot rewrites it each minute; phones poll every 2 s)."""

    def __init__(self, path: str):
        self.path = path
        self.key = None
        self.state: dict | None = None
        self.stats: dict | None = None
        self.lock = threading.Lock()

    def get(self) -> dict:
        st = os.stat(self.path)  # FileNotFoundError propagates to the handler
        key = (st.st_mtime_ns, st.st_size)
        with self.lock:
            if key != self.key:
                with open(self.path, "rb") as f:
                    self.state = json.load(f)
                self.key, self.stats = key, None
            return self.state

    def get_stats(self) -> dict:
        state = self.get()
        with self.lock:
            if self.stats is None:
                self.stats = compute(state)
            return self.stats


def slim_state(state: dict, day: str | None) -> dict:
    """The state with per-minute bars for the viewed day (and today) only, so each poll stays small."""
    keep = {day or state.get("day"), state.get("day")}  # the viewed day, plus today for the live numbers
    out = dict(state, workers=[])
    for w in state.get("workers", []):
        out["workers"].append(dict(w, days={d: v for d, v in (w.get("days") or {}).items() if d in keep}))
    return out


class Handler(SimpleHTTPRequestHandler):
    cache: StateCache

    def _json(self, obj) -> None:
        body = json.dumps(obj, separators=(",", ":")).encode()
        gz = "gzip" in self.headers.get("accept-encoding", "") and len(body) > 1024
        if gz:
            body = gzip.compress(body, 5)
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("cache-control", "no-store")
        if gz:
            self.send_header("content-encoding", "gzip")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # noqa: N802
        url = urlparse(self.path)
        if url.path in ("/api/state", "/api/stats"):
            try:
                if url.path == "/api/stats":
                    obj = self.cache.get_stats()
                else:
                    obj = slim_state(self.cache.get(), parse_qs(url.query).get("day", [None])[0])
            except FileNotFoundError:
                obj = {"error": "no state yet: run the backtest or the live bot first"}
            except ValueError as e:  # corrupt file (writes are atomic, so this should not happen)
                obj = {"error": f"state file unreadable: {e}"}
            return self._json(obj)
        return super().do_GET()

    def end_headers(self):
        if not self.path.startswith("/api/"):
            self.send_header("cache-control", "no-cache")  # always pick up a new dashboard after git pull
        super().end_headers()

    def log_message(self, *a):
        pass


def make_server(state_path: str, host: str = "127.0.0.1", port: int = 8050) -> ThreadingHTTPServer:
    handler = type("BoundHandler", (Handler,), {"cache": StateCache(os.path.abspath(state_path))})
    return ThreadingHTTPServer((host, port), partial(handler, directory=STATIC))


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--state", default="state.json")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8050)
    a = ap.parse_args(argv)
    srv = make_server(a.state, a.host, a.port)
    print(f"Scalp City dashboard on http://{a.host}:{a.port}  (state: {os.path.abspath(a.state)})")
    srv.serve_forever()


if __name__ == "__main__":
    main()
