import tempfile
import time
import unittest
from pathlib import Path

from optionbots.notify import Notifier
from tests.test_bots import NOW, make


class Alerts(unittest.TestCase):
    def test_disabled_without_channels(self):
        self.assertFalse(Notifier().alert("ATLAS", "open", "x"))

    def test_dedupe_and_delivery(self):
        sent = []
        n = Notifier(discord_url="https://example.invalid", dedupe_min=30, send=sent.append)
        self.assertTrue(n.alert("ATLAS", "error", "boom"))
        self.assertFalse(n.alert("ATLAS", "error", "boom"))        # same alert within 30 min
        self.assertTrue(n.alert("ATLAS", "error", "other"))
        n.flush()
        self.assertEqual(len(sent), 2)
        self.assertTrue(sent[0].startswith("🛑 ATLAS: boom"))

    def test_send_failure_never_raises(self):
        def broken(msg):
            raise RuntimeError("network down")
        n = Notifier(discord_url="x", send=broken)
        n.alert("NOVA", "open", "hi")
        n.flush()   # worker swallowed the error

    def test_bot_sends_open_and_close_alerts(self):
        sent = []
        tmp = tempfile.mkdtemp()
        bot, _ = make("atlas", tmp=tmp)
        bot.notifier = Notifier(discord_url="x", send=sent.append)
        bot.signal = lambda bars, price: ("bullish", {})
        bot.maybe_enter(NOW)
        bot.exit_reason = lambda *a: "take profit (test)"
        bot.manage()
        bot.notifier.flush()
        kinds = [m.split(" ")[0] for m in sent]
        self.assertEqual(len(sent), 2, sent)
        self.assertIn("🟦", kinds[0])                    # open
        self.assertIn(kinds[1], ("✅", "🔻"))            # close, win or loss
        self.assertIn("ATLAS: CLOSE", sent[1])


class DetailApi(unittest.TestCase):
    def test_bot_detail(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location("server", Path(__file__).parent.parent / "dashboard/server.py")
        server = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(server)
        bot, _ = make("nova", tmp=tempfile.mkdtemp())
        bot.signal = lambda bars, price: ("bullish", {})
        for _ in range(2):
            bot.maybe_enter(NOW)
            bot.exit_reason = lambda *a: "stop loss (-55%)"
            bot.manage()
            bot.store._exec("UPDATE positions SET opened_at='2020-01-01T00:00:00+00:00'")   # allow re-entry
            del bot.exit_reason
        bot.maybe_enter(NOW)
        d = server.bot_detail(bot.store, type(bot))
        self.assertEqual(len(d["history"]), 2)
        self.assertEqual(len(d["open"]), 1)
        self.assertEqual(d["analytics"]["exit_reasons"]["stop loss"]["count"], 2)
        self.assertGreater(d["analytics"]["open_risk"], 0)
        self.assertLessEqual(d["analytics"]["max_drawdown"], 0)


if __name__ == "__main__":
    unittest.main()
