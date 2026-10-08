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


if __name__ == "__main__":
    unittest.main()
