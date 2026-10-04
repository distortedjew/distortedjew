"""Safety nets: order-direction check, loud alert failures, heartbeat watchdog."""
import importlib.util
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from optionbots.models import Leg
from optionbots.notify import Notifier
from tests.test_bots import NOW, make


def load_server():
    spec = importlib.util.spec_from_file_location("server", Path(__file__).parent.parent / "dashboard/server.py")
    server = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(server)
    return server


class DirectionCheck(unittest.TestCase):
    def test_correct_fill_passes(self):
        tmp = tempfile.mkdtemp()
        bot, _ = make("atlas", tmp=tmp)
        bot.signal = lambda bars, price: ("bullish", {})
        bot.maybe_enter(NOW)
        self.assertEqual(len(bot.store.positions("atlas")), 1)
        self.assertFalse((Path(tmp) / "PAUSE_atlas").exists())

    def test_wrong_direction_pauses_and_alerts(self):
        tmp = tempfile.mkdtemp()
        sent = []
        bot, broker = make("atlas", tmp=tmp)
        bot.notifier = Notifier(discord_url="x", send=sent.append)
        real_submit = broker.submit

        def flipped(legs, qty, limit, coid, closing):   # a broker that fills every leg the wrong way round
            oid = real_submit(legs, qty, limit, coid, closing)
            for l in legs:
                p = broker.pos.get(l.symbol)
                if p:
                    p["qty"] = -p["qty"]
            return oid
        broker.submit = flipped
        bot.signal = lambda bars, price: ("bullish", {})
        bot.maybe_enter(NOW)
        bot.notifier.flush()
        self.assertTrue((Path(tmp) / "PAUSE_atlas").exists())
        self.assertTrue(any("ORDER DIRECTION CHECK FAILED" in m for m in sent), sent)
        # and the paused bot opens nothing new
        before = len(bot.store.positions("atlas"))
        bot.store._exec("UPDATE positions SET opened_at='2020-01-01T00:00:00+00:00'")
        bot.maybe_enter(NOW)
        self.assertEqual(len(bot.store.positions("atlas")), before)

    def test_close_that_opens_new_exposure_is_caught(self):
        tmp = tempfile.mkdtemp()
        bot, broker = make("atlas", tmp=tmp)
        # our closing order BOUGHT this leg, and the broker now shows it long: it opened instead of closing
        broker.pos["SPY261120P00500000"] = {"qty": 2, "avg": 1.0}
        ok = bot.verify_legs([Leg("SPY261120P00500000", "buy")], opening=False, ref="test")
        self.assertFalse(ok)
        self.assertTrue((Path(tmp) / "PAUSE_atlas").exists())


class LoudAlerts(unittest.TestCase):
    def test_post_raises_on_http_error(self):
        n = Notifier(telegram_token="t", telegram_chat="c")
        resp = mock.Mock(status_code=400, text='{"description":"Bad Request: chat not found"}')
        with mock.patch("optionbots.notify.requests.post", return_value=resp):
            with self.assertRaisesRegex(RuntimeError, "chat not found"):
                n._post("hi")

    def test_cli_exits_nonzero_on_failure(self):
        import runpy
        import sys
        resp = mock.Mock(status_code=400, text="chat not found")
        env = {"TELEGRAM_BOT_TOKEN": "t", "TELEGRAM_CHAT_ID": "c", "DISCORD_WEBHOOK_URL": ""}
        with mock.patch.dict("os.environ", env), mock.patch("optionbots.notify.requests.post", return_value=resp), \
                mock.patch.object(sys, "argv", ["notify"]), mock.patch("optionbots.config.load_dotenv"):
            with self.assertRaises(SystemExit) as e:
                runpy.run_module("optionbots.notify", run_name="__main__")
        self.assertEqual(e.exception.code, 1)


class Watchdog(unittest.TestCase):
    def test_stale_then_recovered(self):
        server = load_server()
        store = server.Store(Path(tempfile.mkdtemp()) / "x.sqlite3")
        sent = []
        n = Notifier(discord_url="x", send=sent.append)
        now = datetime.now(timezone.utc)
        for name in server.BOTS:
            store.heartbeat(name, "trading", {})
        store._exec("UPDATE heartbeats SET ts=? WHERE bot='volt'", ((now - timedelta(minutes=25)).isoformat(),))
        stale = set()
        server.watchdog_pass(store, n, stale, now.timestamp(), now.timestamp())
        self.assertEqual(stale, {"volt"})
        store.heartbeat("volt", "trading", {})
        server.watchdog_pass(store, n, stale, now.timestamp(), now.timestamp() + 60)
        n.flush()
        self.assertEqual(stale, set())
        self.assertEqual(len(sent), 2, sent)
        self.assertIn("VOLT: no heartbeat for 25 min", sent[0])
        self.assertIn("heartbeat is back", sent[1])


if __name__ == "__main__":
    unittest.main()
