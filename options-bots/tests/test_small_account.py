"""A $100 account: $1-wide spreads, one trade at a time, ORCHARD switched off."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from optionbots.bots import BOTS
from optionbots.config import load_settings
from optionbots.simbroker import SimBroker
from optionbots.store import Store
from tests.test_bots import NOW

SMALL = {
    "BOT_ALLOCATION_PCT": "0.95", "RISK_PER_TRADE_PCT": "0.95", "ACCOUNT_RISK_CAP_PCT": "0.95",
    "MAX_CONTRACTS": "1", "DAILY_MAX_LOSS_PCT": "0.30",
    "ATLAS_WIDTH": "1", "RANGER_WIDTH": "1", "NOVA_MAX_WIDTH": "1", "VOLT_MAX_WIDTH": "1",
    "ORCHARD_ENABLED": "0",
}
FORCED = {"atlas": "bullish", "nova": "bullish", "ranger": "neutral", "volt": "bullish", "orchard": "bullish"}


class SmallAccount(unittest.TestCase):
    def setUp(self):
        self.env = mock.patch.dict(os.environ, SMALL)
        self.env.start()
        self.tmp = tempfile.mkdtemp()
        self.settings = load_settings()
        self.settings.data_dir = Path(self.tmp)
        self.settings.exec_wait_sec = 0
        self.settings.alphavantage_key = ""
        self.broker = SimBroker(seed=1, speed=0, equity=100.0)
        self.store = Store(self.settings.db_path)

    def tearDown(self):
        self.env.stop()

    def bot(self, name):
        b = BOTS[name](self.broker, self.store, self.settings, sleep=lambda s: None)
        b.signal = lambda bars, price, d=FORCED[name]: (d, {})
        return b

    def test_each_affordable_bot_fits_in_100_dollars(self):
        for name in ("atlas", "nova", "ranger", "volt"):
            with self.subTest(bot=name):
                self.store._exec("DELETE FROM positions")
                b = self.bot(name)
                b.maybe_enter(NOW)
                pos = self.store.positions(name)
                msgs = [r[0] for r in self.store.db.execute("SELECT message FROM events WHERE bot=? ORDER BY id DESC LIMIT 2", (name,))]
                self.assertEqual(len(pos), 1, msgs)
                p = pos[0]
                self.assertEqual(p["qty"], 1)
                self.assertLessEqual(p["max_loss"], 95, p)               # can't lose more than the account
                strikes = sorted({l["strike"] for l in p["legs"]})
                self.assertLessEqual(strikes[1] - strikes[0], 1.0, strikes)   # $1-wide
                b.exit_reason = lambda *a: "test exit"
                b.manage()

    def test_only_one_trade_at_a_time_across_bots(self):
        self.bot("ranger").maybe_enter(NOW)
        self.assertEqual(len(self.store.positions(None)), 1)
        nova = self.bot("nova")
        nova.maybe_enter(NOW)
        self.assertEqual(len(self.store.positions(None)), 1)
        last = self.store.db.execute("SELECT message FROM events WHERE bot='nova' ORDER BY id DESC LIMIT 1").fetchone()[0]
        self.assertIn("budget room", last)

    def test_orchard_is_switched_off(self):
        b = self.bot("orchard")
        self.assertEqual(b.enabled, 0)
        b.maybe_enter(NOW)
        self.assertEqual(self.store.positions("orchard"), [])
        self.assertIn("disabled", b.signal_state.get("blocked", ""))


if __name__ == "__main__":
    unittest.main()
