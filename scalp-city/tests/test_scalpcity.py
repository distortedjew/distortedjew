import json
import os
import tempfile
import unittest
from datetime import date, datetime, timedelta

from scalpcity.backtest import make_paper_broker, run
from scalpcity.bars import ET, Bar, next_trading_day
from scalpcity.city import City
from scalpcity.config import CityConfig, WorkerConfig, load_config
from scalpcity.feeds import SyntheticMarket
from scalpcity.options import Contract, bs_price, pick_contract
from scalpcity.strategy import CALL, PUT, Indicators, SignalEngine
from scalpcity.worker import TARGET_HIT, Worker

DAY = date(2026, 10, 2)  # a Friday


def bar(i, c, o=None, h=None, lo=None, v=1000, d=DAY):
    o = c if o is None else o
    ts = datetime(d.year, d.month, d.day, 9, 30, tzinfo=ET) + timedelta(minutes=i)
    return Bar(ts, o, max(o, c) if h is None else h, min(o, c) if lo is None else lo, c, v)


class Indicators_(unittest.TestCase):
    def test_vwap_resets_each_session(self):
        ind = Indicators(ema_len=3)
        ind.update(bar(0, 10, h=10, lo=10, v=100))
        lv = ind.update(bar(1, 20, h=20, lo=20, v=300))
        self.assertAlmostEqual(lv.vwap, (10 * 100 + 20 * 300) / 400)
        lv = ind.update(bar(0, 50, h=50, lo=50, v=10, d=DAY + timedelta(days=3)))
        self.assertAlmostEqual(lv.vwap, 50)

    def test_opening_range_is_first_15_minutes(self):
        ind = Indicators(or_minutes=15)
        for i in range(15):
            lv = ind.update(bar(i, 100, h=100 + i, lo=100 - i))
        self.assertEqual((lv.or_high, lv.or_low), (114, 86))  # completes on the 09:44 bar's close
        lv = ind.update(bar(15, 200, h=300, lo=1))
        self.assertEqual((lv.or_high, lv.or_low), (114, 86))  # later bars don't widen it

    def test_ema_withheld_until_warm(self):
        ind = Indicators(ema_len=50)
        for i in range(49):
            self.assertIsNone(ind.update(bar(i, 100)).ema)
        self.assertIsNotNone(ind.update(bar(49, 100)).ema)


class Signals(unittest.TestCase):
    def test_vwap_cross_up_buys_call_and_down_buys_put(self):
        eng = SignalEngine(["vwap"])
        for i in range(5):
            self.assertIsNone(eng.on_bar(bar(i, 100, v=1e6)))  # heavy volume pins VWAP at 100
        s = eng.on_bar(bar(5, 101))
        self.assertEqual((s.direction, s.triggers), (CALL, ["vwap"]))
        self.assertIsNone(eng.on_bar(bar(6, 101.5)))  # staying above is not a new cross
        self.assertEqual(eng.on_bar(bar(7, 99)).direction, PUT)

    def test_ema_cross(self):
        eng = SignalEngine(["ema50"])
        for i in range(60):
            eng.on_bar(bar(i, 100))
        self.assertEqual(eng.on_bar(bar(60, 102)).direction, CALL)

    def test_orb_breakout_once_per_direction(self):
        eng = SignalEngine(["orb"], or_minutes=15)
        for i in range(15):
            eng.on_bar(bar(i, 100, h=101, lo=99))
        self.assertIsNone(eng.on_bar(bar(15, 100.5)))
        self.assertEqual(eng.on_bar(bar(16, 101.2)).triggers, ["orb"])
        eng.on_bar(bar(17, 100.5))  # back inside
        self.assertIsNone(eng.on_bar(bar(18, 101.3)))  # second upside break is ignored
        self.assertEqual(eng.on_bar(bar(19, 98.5)).direction, PUT)

    def test_agreeing_triggers_merge_into_one_signal(self):
        eng = SignalEngine(["vwap", "orb"], or_minutes=15)
        for i in range(15):
            eng.on_bar(bar(i, 100, h=101, lo=99, v=1e6))  # range 99-101, VWAP pinned at 100
        self.assertEqual(eng.on_bar(bar(15, 99.8, v=1)).direction, PUT)  # dips under VWAP (inside the range)
        s = eng.on_bar(bar(16, 101.5, v=1))  # one candle crosses VWAP AND breaks the range high
        self.assertEqual((s.direction, s.triggers), (CALL, ["orb", "vwap"]))

    def test_first_bar_of_day_never_signals(self):
        eng = SignalEngine(["vwap"])
        eng.on_bar(bar(389, 50))
        self.assertIsNone(eng.on_bar(bar(0, 200, d=DAY + timedelta(days=3))))


class Options(unittest.TestCase):
    def test_1dte_skips_weekend_and_holidays(self):
        self.assertEqual(next_trading_day(DAY), date(2026, 10, 5))  # Fri -> Mon
        self.assertEqual(next_trading_day(date(2026, 11, 25)), date(2026, 11, 27))  # skips Thanksgiving
        c = pick_contract("QQQ", 600.4, CALL, DAY, dte=1)
        self.assertEqual((c.expiry, c.strike), (date(2026, 10, 5), 600))
        self.assertEqual(pick_contract("QQQ", 600.4, CALL, DAY, dte=0).expiry, DAY)
        self.assertEqual(pick_contract("QQQ", 600.4, PUT, DAY, otm_steps=2).strike, 598)

    def test_occ_symbol(self):
        self.assertEqual(Contract("QQQ", date(2025, 10, 3), CALL, 600).occ, "QQQ251003C00600000")
        self.assertEqual(Contract("SPY", date(2025, 10, 3), PUT, 662.5).occ, "SPY251003P00662500")

    def test_black_scholes_put_call_parity(self):
        s, k, t, iv, r = 600, 605, 2 / 365, 0.2, 0.04
        import math

        c, p = bs_price(s, k, t, iv, CALL, r), bs_price(s, k, t, iv, PUT, r)
        self.assertAlmostEqual(c - p, s - k * math.exp(-r * t), places=6)


def cfg(**kw):
    w = WorkerConfig(name="T", symbol="QQQ", triggers=["vwap"], contracts=1, **kw)
    return CityConfig(workers=[w], spread_pct=0.0, min_spread=0.0, fee_per_contract=0.0, iv={"QQQ": 0.2})


class WorkerRules(unittest.TestCase):
    def feed(self, c, closes):
        w = Worker(c.workers[0], make_paper_broker(c))
        for i, px in enumerate(closes):
            w.on_bar(bar(i, px, v=1e6 if i < 3 else 1))
        return w

    def test_takes_profit_and_stops_for_the_day_at_target(self):
        c = cfg(take_profit_pct=20, daily_profit_target=50, entry_start="09:30")
        w = self.feed(c, [600, 600, 600, 601] + [601 + i for i in range(1, 20)])
        trades = w.days[str(DAY)].trades
        self.assertEqual(trades[0]["reason"], "target")
        self.assertEqual(trades[0]["right"], CALL)
        self.assertEqual(w.status, TARGET_HIT)
        self.assertEqual(len(trades), 1)  # no trades after the daily target

    def test_stop_loss(self):
        c = cfg(stop_loss_pct=15, take_profit_pct=500, entry_start="09:30", exit_on_opposite=False, daily_max_loss=0)
        w = self.feed(c, [600, 600, 600, 601, 600.95, 600.9] + [600.9 - 0.4 * i for i in range(1, 10)])
        self.assertEqual(w.days[str(DAY)].trades[0]["reason"], "stop")

    def test_replayed_bars_never_trade(self):
        c = cfg(entry_start="09:30")
        w = Worker(c.workers[0], make_paper_broker(c))
        for i, px in enumerate([600, 600, 600, 601, 599, 601]):
            w.on_bar(bar(i, px, v=1e6 if i < 3 else 1), trade=False)
        dl = w.days[str(DAY)]
        self.assertEqual(len(dl.bars), 6)
        self.assertTrue(dl.signals)  # the chart still shows the signals...
        self.assertEqual((dl.trades, w.pos), ([], None))  # ...but nothing was bought

    def test_no_entries_outside_window(self):
        c = cfg(entry_start="10:00")
        w = self.feed(c, [600, 600, 600, 601, 599, 601, 599])
        self.assertEqual(w.days[str(DAY)].trades, [])
        self.assertIsNone(w.pos)


class EndToEnd(unittest.TestCase):
    def test_example_config_backtest_and_state(self):
        here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        c = load_config(os.path.join(here, "config.example.toml"))
        data = SyntheticMarket(c.symbols, seed=3).days(5, date(2026, 10, 2))
        city = run(c, data)
        self.assertEqual(len(city.history()), 5)
        for w in city.workers:
            self.assertIsNone(w.pos)  # everything flat at the end
            for dl in w.days.values():
                for t in dl.trades:
                    self.assertLessEqual(t["opened"], t["closed"])
                    self.assertLess(t["closed"], "15:56")
        with tempfile.TemporaryDirectory() as d:
            city.write_state(os.path.join(d, "s.json"))
            with open(os.path.join(d, "s.json")) as f:
                s = json.load(f)
        self.assertEqual(len(s["workers"]), 5)
        self.assertIn("vault", s)

    def test_vault_target_clocks_everyone_out(self):
        c = load_config(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config.example.toml"))
        c.daily_profit_target = 1.0
        city = City(c, make_paper_broker(c))
        data = SyntheticMarket(c.symbols, seed=1).day(DAY)
        for i in range(390):
            for s, bars in data.items():
                city.on_bar(s, bars[i])
            if city.vault_closed:
                break
        self.assertTrue(city.vault_closed)
        self.assertTrue(all(w.pos is None for w in city.workers))


class Dashboard(unittest.TestCase):
    """The stats module and the HTTP endpoints the 3D dashboard polls."""

    @classmethod
    def setUpClass(cls):
        here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        c = load_config(os.path.join(here, "config.example.toml"))
        cls.city = run(c, SyntheticMarket(c.symbols, seed=5).days(4, date(2026, 10, 2)))
        cls.tmp = tempfile.TemporaryDirectory()
        cls.path = os.path.join(cls.tmp.name, "state.json")
        cls.city.write_state(cls.path)
        from scalpcity.dashboard.server import make_server

        cls.srv = make_server(cls.path, "127.0.0.1", 0)
        import threading

        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()
        cls.tmp.cleanup()

    def get(self, path, gzip_ok=False):
        import gzip
        import urllib.request

        req = urllib.request.Request(self.base + path, headers={"accept-encoding": "gzip"} if gzip_ok else {})
        with urllib.request.urlopen(req, timeout=5) as r:
            body = r.read()
            if r.headers.get("content-encoding") == "gzip":
                body = gzip.decompress(body)
            return r.status, r.headers, body

    def test_stats_match_the_trades(self):
        from scalpcity.stats import compute

        with open(self.path) as f:
            st = json.load(f)
        s = compute(st)
        trades = [t for w in self.city.workers for dl in w.days.values() for t in dl.trades]
        self.assertEqual(s["totals"]["trades"], len(trades))
        self.assertAlmostEqual(s["totals"]["total"], sum(h["pnl"] for h in self.city.history()), places=2)
        self.assertEqual(sum(r["trades"] for r in s["by_worker"]), len(trades))
        self.assertAlmostEqual(s["equity"][-1]["cum"], s["totals"]["total"], places=2)
        self.assertTrue(all(e["dd"] <= 0 for e in s["equity"]))

    def test_state_endpoint_sends_one_day_plus_today(self):
        _, _, body = self.get("/api/state")
        st = json.loads(body)
        self.assertEqual({d for w in st["workers"] for d in w["days"]}, {st["day"]})
        first = st["history"][0]["date"]
        _, _, body = self.get("/api/state?day=" + first)
        st2 = json.loads(body)
        self.assertEqual({d for w in st2["workers"] for d in w["days"]}, {first, st["day"]})
        bar = st["workers"][0]["days"][st["day"]]["bars"][0]
        self.assertEqual(len(bar), 7)  # time, close, vwap, ema, open, high, low

    def test_gzip_and_static_page(self):
        status, headers, body = self.get("/api/state", gzip_ok=True)
        self.assertEqual(headers.get("content-encoding"), "gzip")
        self.assertIn("vault", json.loads(body))
        status, _, page = self.get("/")
        self.assertEqual(status, 200)
        self.assertIn(b"js/main.js", page)
        for js in ("main", "world", "ui", "charts", "shaders", "util"):
            self.assertEqual(self.get(f"/js/{js}.js")[0], 200)

    def test_stats_endpoint(self):
        _, _, body = self.get("/api/stats")
        s = json.loads(body)
        self.assertEqual(s["totals"]["days"], 4)
        self.assertIn("by_trigger", s)

    def test_missing_state_is_reported_not_crashed(self):
        from scalpcity.dashboard.server import StateCache

        with self.assertRaises(FileNotFoundError):
            StateCache(os.path.join(self.tmp.name, "nope.json")).get()


if __name__ == "__main__":
    unittest.main()
