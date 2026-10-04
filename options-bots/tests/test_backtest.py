import json
import threading
import time
import unittest
import urllib.request
from datetime import date, timedelta
from http.server import ThreadingHTTPServer
from pathlib import Path

from optionbots import backtest as bt
from optionbots.bots import BOTS
from optionbots.models import Bar

END = date(2026, 6, 30)
START = END - timedelta(days=2 * 365)


def bars(symbol="SPY"):
    return bt.synthetic_bars(symbol, START - timedelta(days=420), END)


class Engine(unittest.TestCase):
    def test_every_bot_runs_and_reports(self):
        for name, cls in BOTS.items():
            with self.subTest(bot=name):
                r = bt.run_backtest(name, START, END, bars=bars(cls.underlying), data_source="test")
                s = r["stats"]
                self.assertEqual(len(r["curve"]), len(r["buy_hold"]))
                self.assertGreater(len(r["curve"]), 400)
                self.assertLessEqual(s["max_drawdown"], 0)
                self.assertEqual(s["trades"], len([t for t in r["trades"] if t["pnl"] is not None]))
                self.assertTrue(all(t["opened_at"] >= START.isoformat() for t in r["trades"]))

    def test_deterministic(self):
        a = bt.run_backtest("ranger", START, END, bars=bars("IWM"))
        b = bt.run_backtest("ranger", START, END, bars=bars("IWM"))
        self.assertEqual(a["curve"], b["curve"])

    def test_overrides_change_behaviour_and_are_whitelisted(self):
        base = bt.run_backtest("atlas", START, END, bars=bars())
        tuned = bt.run_backtest("atlas", START, END, bars=bars(), overrides={"max_open": 1, "min_days_between": 30, "evil": 5})
        self.assertEqual(tuned["overrides"], {"max_open": 1, "min_days_between": 30})
        self.assertLess(tuned["stats"]["trades"], base["stats"]["trades"])

    def test_no_lookahead(self):
        """Changing prices after day N must not change anything that happened up to day N."""
        b1 = bars("NVDA")
        b2 = [Bar(x.day, x.o * 3, x.h * 3, x.l * 3, x.c * 3, x.v) if x.day > START + timedelta(days=300) else x for x in b1]
        r1 = bt.run_backtest("volt", START, END, bars=b1)
        r2 = bt.run_backtest("volt", START, END, bars=b2)
        cut = (START + timedelta(days=300)).isoformat()
        self.assertEqual([c for c in r1["curve"] if c["t"] <= cut], [c for c in r2["curve"] if c["t"] <= cut])

    def test_wheel_gets_assigned_in_a_selloff(self):
        """ORCHARD sells puts; in a steady decline puts expire ITM and shares are assigned."""
        days, d, p = [], START - timedelta(days=420), 200.0
        while d <= END:
            if d.weekday() < 5:
                # long uptrend (so the 200-day filter allows puts), then a slow grind lower
                p *= 1.0015 if d < START + timedelta(days=120) else 0.9985
                days.append(Bar(d, p, p * 1.004, p * 0.996, p, 1e7))
            d += timedelta(days=1)
        r = bt.run_backtest("orchard", START, END, bars=days, overrides={"stop_loss": 0}, allocation_pct=0.9)
        msgs = " ".join(e["message"] for e in r["events"])
        self.assertIn("assigned", msgs)


class JobApi(unittest.TestCase):
    def test_post_and_poll(self):
        import importlib.util
        import tempfile
        spec = importlib.util.spec_from_file_location("server", Path(__file__).parent.parent / "dashboard/server.py")
        server = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(server)
        store = server.Store(Path(tempfile.mkdtemp()) / "x.sqlite3")
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.make_handler(store, "", "admin"))
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        url = f"http://127.0.0.1:{httpd.server_port}"
        try:
            body = json.dumps({"bot": "atlas", "years": 1, "overrides": {"max_open": 2}}).encode()
            req = urllib.request.Request(url + "/api/backtest", data=body, headers={"Content-Type": "application/json"})
            jid = json.load(urllib.request.urlopen(req))["id"]
            for _ in range(200):
                job = json.load(urllib.request.urlopen(f"{url}/api/backtest/{jid}"))
                if job["status"] != "running":
                    break
                time.sleep(0.1)
            self.assertEqual(job["status"], "done", job.get("error"))
            self.assertEqual(job["result"]["overrides"], {"max_open": 2})
            defaults = json.load(urllib.request.urlopen(url + "/api/backtest-defaults"))
            self.assertIn("short_delta", defaults["atlas"])
            bad = urllib.request.Request(url + "/api/backtest", data=b'{"bot":"nope"}')
            with self.assertRaises(urllib.error.HTTPError) as e:
                urllib.request.urlopen(bad)
            self.assertEqual(e.exception.code, 400)
        finally:
            httpd.shutdown()


if __name__ == "__main__":
    unittest.main()
