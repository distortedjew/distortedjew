"""Read-only dashboard: serves the 3D city page and the state JSON the bots write. No control endpoints.

    python -m scalpcity.dashboard.server --state state.json --port 8050
"""

from __future__ import annotations

import argparse
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

STATIC = os.path.join(os.path.dirname(__file__), "static")


class Handler(SimpleHTTPRequestHandler):
    state_path = "state.json"

    def do_GET(self):  # noqa: N802
        if self.path.split("?")[0] == "/api/state":
            try:
                with open(self.state_path, "rb") as f:
                    body = f.read()
            except FileNotFoundError:
                body = b'{"error":"no state yet: run the backtest or the live bot first"}'
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
