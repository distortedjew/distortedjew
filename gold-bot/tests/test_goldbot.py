"""python -m unittest discover -s tests   (no network, no broker account needed)"""
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

from goldbot.backtest import report, run
from goldbot.bot import GoldBot
from goldbot.brokers.base import Broker, Position
from goldbot.config import Config, StrategyParams
from goldbot.notify import Notifier
from goldbot.risk import position_units
from goldbot.strategy import add_indicators, in_session, manage, signal_at


def synthetic(n=6000, seed=1, start="2026-01-05", drift=0.02):
    """Weekday-only M15 gold-like random walk with regime-switching trends."""
    rng = np.random.default_rng(seed)
    times = pd.date_range(start, periods=n * 2, freq="15min", tz="UTC")
    times = times[times.weekday < 5][:n]
    regime = np.sign(np.sin(np.arange(n) / 700)) * drift
    steps = rng.normal(regime, 1.2, n)
    close = 2400 + np.cumsum(steps)
    open_ = np.r_[close[0], close[:-1]]
    wick = np.abs(rng.normal(0, 0.8, n))
    return pd.DataFrame({"time": times, "open": open_, "high": np.maximum(open_, close) + wick,
                         "low": np.minimum(open_, close) - wick, "close": close})


class FakeBroker(Broker):
    name = "fake"

    def __init__(self, df):
        self.df, self.upto, self.eq, self.pos, self.n = df, 0, 10_000.0, None, 0
        self.closed = 0

    def candles(self, count):
        return self.df.iloc[max(0, self.upto - count): self.upto].reset_index(drop=True)

    def equity(self):
        return self.eq

    def quote(self):
        c = self.df["close"].iloc[self.upto - 1]
        return c - 0.15, c + 0.15

    def position(self):
        return self.pos

    def min_units(self):
        return 1

    def normalize_units(self, units):
        return float(int(units)) if units >= 1 else 0.0

    def open(self, side, units, sl, tp):
        self.n += 1
        bid, ask = self.quote()
        self.pos = Position(str(self.n), side, units, ask if side == "buy" else bid, sl, tp)
        return self.pos

    def set_sl(self, pos, sl):
        pos.sl = sl

    def close(self, pos):
        self.pos, self.closed = None, self.closed + 1


class StrategyTests(unittest.TestCase):
    def test_session(self):
        p = StrategyParams()
        self.assertTrue(in_session(datetime(2026, 10, 7, 12, tzinfo=timezone.utc), p))   # Wed noon
        self.assertFalse(in_session(datetime(2026, 10, 7, 3, tzinfo=timezone.utc), p))   # Asia
        self.assertFalse(in_session(datetime(2026, 10, 9, 19, tzinfo=timezone.utc), p))  # late Fri
        self.assertFalse(in_session(datetime(2026, 10, 10, 12, tzinfo=timezone.utc), p))  # Sat

    def test_signals_are_trend_aligned_and_sized_by_atr(self):
        p = StrategyParams()
        ind = add_indicators(synthetic(), p)
        sigs = [(i, signal_at(ind, i, p)) for i in range(len(ind))]
        sigs = [(i, s) for i, s in sigs if s]
        self.assertGreater(len(sigs), 5)
        for i, s in sigs:
            row = ind.iloc[i]
            if s.side == "buy":
                self.assertGreater(row["ema_slow"], row["ema_trend"])
            else:
                self.assertLess(row["ema_slow"], row["ema_trend"])
            self.assertAlmostEqual(s.tp_dist / s.sl_dist, p.tp_atr / p.sl_atr)

    def test_no_signal_during_warmup(self):
        p = StrategyParams()
        ind = add_indicators(synthetic(500), p)
        self.assertTrue(all(signal_at(ind, i, p) is None for i in range(350)))

    def test_manage(self):
        p = StrategyParams()
        wed = datetime(2026, 10, 7, 12, tzinfo=timezone.utc)
        self.assertEqual(manage("buy", 100, 97, 3, 101, 4, wed, p), ("hold", None))
        act, sl = manage("buy", 100, 97, 3, 103.5, 4, wed, p)
        self.assertEqual(act, "move_sl")
        self.assertGreater(sl, 100)
        self.assertEqual(manage("buy", 100, 100.2, 3, 104, 4, wed, p)[0], "hold")  # already at BE
        act, sl = manage("sell", 100, 103, 3, 96.5, 4, wed, p)
        self.assertEqual(act, "move_sl")
        self.assertLess(sl, 100)
        self.assertEqual(manage("buy", 100, 97, 3, 101, 64, wed, p)[0], "close")
        fri = datetime(2026, 10, 9, 20, 15, tzinfo=timezone.utc)
        self.assertEqual(manage("buy", 100, 97, 3, 101, 4, fri, p)[0], "close")


class RiskTests(unittest.TestCase):
    def test_sizing_risks_the_fraction(self):
        units = position_units(10_000, 0.005, 5.0, 2400, 10)
        self.assertAlmostEqual(units * 5.0, 50.0)  # $50 = 0.5% of $10k

    def test_leverage_cap(self):
        units = position_units(10_000, 0.02, 0.1, 2400, 10)  # tiny stop would mean huge size
        self.assertLessEqual(units * 2400, 100_000 + 1e-6)

    def test_config_guards(self):
        cfg = Config(risk_per_trade=0.05)
        self.assertRaises(ValueError, cfg.validate)
        cfg = Config(oanda_env="live")
        self.assertRaises(ValueError, cfg.validate)


class BacktestTests(unittest.TestCase):
    def test_runs_and_reports(self):
        df = synthetic()
        trades, curve = run(df, StrategyParams())
        r = report(trades, curve, 10_000)
        self.assertEqual(len(curve), len(df))
        self.assertGreater(r["trades"], 0)
        for t in trades:
            self.assertGreater(t.exit_time, t.entry_time)
            self.assertLessEqual(t.pnl / t.units, t.risk * 2.2)  # never far beyond the 2R target
        # a losing trade costs about the configured 0.5% risk (plus costs), not more
        worst = min(t.pnl for t in trades)
        self.assertGreater(worst, -10_000 * 0.005 * 2)


class BotLoopTests(unittest.TestCase):
    def test_bot_trades_through_fake_broker(self):
        df = synthetic()
        broker = FakeBroker(df)
        with tempfile.TemporaryDirectory() as d:
            cfg = Config(state_file=f"{d}/state.json", log_dir=d, candles=600)
            bot = GoldBot(cfg, broker=broker, notifier=Notifier())
            opens = 0
            for upto in range(700, len(df)):
                broker.upto = upto
                last = df["time"].iloc[upto - 1].to_pydatetime()
                pos_before = broker.pos
                # simulate the broker-side stop/target
                if broker.pos:
                    hi, lo = df["high"].iloc[upto - 1], df["low"].iloc[upto - 1]
                    p = broker.pos
                    hit = (lo <= p.sl or hi >= p.tp) if p.side == "buy" else (hi >= p.sl or lo <= p.tp)
                    if hit:
                        broker.pos = None
                bot.on_bar(now=last + timedelta(minutes=15, seconds=10))
                if broker.pos and broker.pos is not pos_before:
                    opens += 1
                    p = broker.pos
                    self.assertLessEqual(abs(p.entry - p.sl) * p.units, 10_000 * cfg.risk_per_trade + 1e-6)
                bot.on_bar(now=last + timedelta(minutes=15, seconds=20))  # same bar twice: no-op
            self.assertGreater(opens, 0)
            self.assertLessEqual(max(bot.state.trades_today, 0), cfg.max_trades_per_day)

    def test_daily_loss_flattens_and_halts(self):
        df = synthetic()
        broker = FakeBroker(df)
        with tempfile.TemporaryDirectory() as d:
            cfg = Config(state_file=f"{d}/state.json", log_dir=d)
            bot = GoldBot(cfg, broker=broker, notifier=Notifier())
            broker.upto = 1000
            now = df["time"].iloc[999].to_pydatetime() + timedelta(minutes=15, seconds=10)
            bot.on_bar(now=now)
            broker.pos = Position("x", "buy", 10, 2400, 2390, 2420)
            broker.eq = 9_700  # -3% on the day
            broker.upto = 1001
            bot.on_bar(now=now + timedelta(minutes=15))
            self.assertIsNone(broker.pos)
            self.assertEqual(bot.state.halted_day, now.strftime("%Y-%m-%d"))

    def test_stale_data_blocks_entries(self):
        df = synthetic()
        broker = FakeBroker(df)
        with tempfile.TemporaryDirectory() as d:
            bot = GoldBot(Config(state_file=f"{d}/s.json", log_dir=d), broker=broker, notifier=Notifier())
            for upto in range(700, 3000):
                broker.upto = upto
                bot.on_bar(now=df["time"].iloc[upto - 1].to_pydatetime() + timedelta(hours=3))
            self.assertEqual(broker.n, 0)


if __name__ == "__main__":
    unittest.main()
