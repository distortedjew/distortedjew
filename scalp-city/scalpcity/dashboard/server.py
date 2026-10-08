"""Read-only dashboard: serves the 3D city page and the state JSON the bots write. No control endpoints.

    python -m scalpcity.dashboard.server --state state.json --port 8050
"""

from __future__ import annotations

import argparse
import json
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

STATIC = os.path.join(os.path.dirname(__file__), "static")


def slim_state(path: str, day: str | None) -> bytes:
    """The state with per-minute bars for one day only (default: the latest), so each poll stays small."""
    with open(path, "rb") as f:
        st = json.load(f)
    day = day or st.get("day")
    for w in st.get("workers", []):
        w["days"] = {d: v for d, v in (w.get("days") or {}).items() if d == day}
    return json.dumps(st, separators=(",", ":")).encode()


class Handler(SimpleHTTPRequestHandler):
    state_path = "state.json"

    def do_GET(self):  # noqa: N802
        url = urlparse(self.path)
        if url.path == "/api/state":
            day = parse_qs(url.query).get("day", [None])[0]
            try:
                body = slim_state(self.state_path, day)
            except FileNotFoundError:
                body = b'{"error":"no state yet: run the backtest or the live bot first"}'
            except ValueError as e:  # the bot is mid-write or the file is corrupt
                body = json.dumps({"error": f"state file unreadable: {e}"}).encode()
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("cache-control", "no-store")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def log_message(self, *a):
        pass


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--state", default="state.json")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8050)
    a = ap.parse_args(argv)
    Handler.state_path = os.path.abspath(a.state)
    srv = ThreadingHTTPServer((a.host, a.port), partial(Handler, directory=STATIC))
    print(f"Scalp City dashboard on http://{a.host}:{a.port}  (state: {Handler.state_path})")
    srv.serve_forever()


if __name__ == "__main__":
    main()
