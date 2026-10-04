"""End-to-end against the simulator: each bot opens a trade on a forced signal, then exits."""
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from optionbots.base import ET
from optionbots.bots import BOTS
from optionbots.config import load_settings
from optionbots.simbroker import SimBroker
from optionbots.store import Store

NOW = datetime.now(ET).replace(hour=11, minute=0)
FORCED = {"atlas": "bullish", "nova": "bullish", "ranger": "neutral", "volt": "bearish", "orchard": "bullish"}


def make(name, broker=None, tmp=None):
    settings = load_settings()
    settings.data_dir = Path(tmp)
    settings.alphavantage_key = ""
    settings.exec_wait_sec = 0
    broker = broker or SimBroker(seed=1, speed=0)
    bot = BOTS[name](broker, Store(settings.db_path), settings, sleep=lambda s: None)
    return bot, broker


class BotFlow(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def test_each_bot_opens_and_closes(self):
        for name, direction in FORCED.items():
            with self.subTest(bot=name):
                bot, broker = make(name, tmp=self.tmp)
                bot.signal = lambda bars, price, d=direction: (d, {"forced": True})
                bot.maybe_enter(NOW)
                pos = bot.store.positions(name)
                self.assertEqual(len(pos), 1, bot.store.db.execute(
                    "SELECT message FROM events WHERE bot=? ORDER BY id DESC LIMIT 1", (name,)).fetchone()[0])
                p = pos[0]
                self.assertGreaterEqual(p["qty"], 1)
                if p["kind"] in ("credit_spread", "iron_condor", "csp"):
                    self.assertLess(p["entry_price"], 0)
                else:
                    self.assertGreater(p["entry_price"], 0)
                # the second identical signal is blocked by spacing / max-open rules
                bot.maybe_enter(NOW)
                self.assertEqual(len(bot.store.positions(name)), 1)
                # force an exit and check it is booked
                bot.exit_reason = lambda *a: "stop loss (test)"
                bot.manage()
                self.assertEqual(bot.store.positions(name), [])
                closed = bot.store.positions(name, "closed")
                self.assertIsNotNone(closed[0]["pnl"])
                self.assertFalse(broker.positions(), "all legs flattened at the broker")

    def test_sizing_respects_risk_per_trade(self):
        bot, broker = make("atlas", tmp=self.tmp)
        bot.signal = lambda bars, price: ("bullish", {})
        bot.maybe_enter(NOW)
        p = bot.store.positions("atlas")[0]
        self.assertLessEqual(p["max_loss"] * p["qty"], 100_000 * bot.settings.risk_per_trade_pct + 1)

    def test_pause_file_blocks_entries(self):
        bot, _ = make("nova", tmp=self.tmp)
        (Path(self.tmp) / "PAUSE").touch()
        bot.signal = lambda bars, price: ("bullish", {})
        bot.maybe_enter(NOW)
        self.assertEqual(bot.store.positions("nova"), [])

    def test_orchard_sells_covered_calls_when_holding_shares(self):
        broker = SimBroker(seed=1, speed=0)
        broker.pos["AAPL"] = {"qty": 200, "avg": broker.spot["AAPL"]}
        bot, _ = make("orchard", broker, self.tmp)
        bot.maybe_enter(NOW)
        p = bot.store.positions("orchard")
        if not p:   # signal() decides from bars; with 200 shares it must be "cover"
            self.fail(bot.signal_state)
        self.assertEqual(p[0]["kind"], "covered_call")
        self.assertEqual(p[0]["qty"], 2)
        self.assertGreaterEqual(p[0]["legs"][0]["strike"], broker.spot["AAPL"] - 1e-6)

    def test_real_signals_run_on_sim_bars(self):
        for name in BOTS:
            bot, broker = make(name, tmp=self.tmp)
            bars = bot.completed_bars(NOW.date())
            direction, state = bot.signal(bars, broker.last_price(bot.underlying))
            self.assertIn(direction, (None, "bullish", "bearish", "neutral", "cover"))
            self.assertTrue(state)

    def test_dashboard_state(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location("server", Path(__file__).parent.parent / "dashboard/server.py")
        server = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(server)
        bot, _ = make("ranger", tmp=self.tmp)
        bot.signal = lambda bars, price: ("neutral", {})
        bot.maybe_enter(NOW)
        st = server.state(bot.store)
        self.assertEqual([b["name"] for b in st["bots"]], list(BOTS))
        self.assertEqual(len(st["bots"][2]["open"]), 1)


if __name__ == "__main__":
    unittest.main()
