import math
import unittest
from datetime import date

from optionbots import blackscholes as bs
from optionbots import indicators as ind
from optionbots.execution import net_prices, reversed_legs
from optionbots.models import Leg, occ_symbol, parse_occ


class Indicators(unittest.TestCase):
    def test_sma_ema_rsi(self):
        up = [float(i) for i in range(1, 60)]
        self.assertEqual(ind.sma(up, 5), 57.0)
        self.assertEqual(ind.rsi(up, 14), 100.0)
        self.assertLess(ind.rsi(list(reversed(up)), 14), 1)
        self.assertGreater(ind.ema(up, 10), ind.sma(up, 30))

    def test_adx_trend_vs_chop(self):
        n = 120
        trend_c = [100 + i for i in range(n)]
        trend = ind.adx([c + 1 for c in trend_c], [c - 1 for c in trend_c], trend_c)
        chop_c = [100 + (1 if i % 2 else -1) for i in range(n)]
        chop = ind.adx([c + 1.5 for c in chop_c], [c - 1.5 for c in chop_c], chop_c)
        self.assertGreater(trend, 40)
        self.assertLess(chop, 20)

    def test_macd_and_bollinger(self):
        vals = [100 + math.sin(i / 5) * 5 for i in range(100)]
        self.assertEqual(len(ind.macd_hist(vals)), 100)
        lo, mid, hi = ind.bollinger(vals)
        self.assertLess(lo, mid)
        self.assertLess(mid, hi)


class BlackScholes(unittest.TestCase):
    def test_put_call_parity_and_iv(self):
        s, k, t, v = 100, 95, 0.25, 0.3
        c, p = bs.price("call", s, k, t, v), bs.price("put", s, k, t, v)
        self.assertAlmostEqual(c - p, s - k * math.exp(-bs.RATE * t), places=6)
        self.assertAlmostEqual(bs.implied_vol("put", p, s, k, t), v, places=4)
        self.assertTrue(-0.5 < bs.delta("put", s, k, t, v) < 0)


class Symbols(unittest.TestCase):
    def test_occ_roundtrip(self):
        sym = occ_symbol("SPY", date(2026, 11, 20), "put", 550.5)
        self.assertEqual(sym, "SPY261120P00550500")
        self.assertEqual(parse_occ(sym), ("SPY", date(2026, 11, 20), "put", 550.5))


class Pricing(unittest.TestCase):
    def test_credit_spread_signs(self):
        legs = [Leg("S", "sell"), Leg("L", "buy")]
        quotes = {"S": (1.90, 2.10), "L": (0.90, 1.10)}
        mid, natural = net_prices(legs, quotes)
        self.assertAlmostEqual(mid, -1.0)        # we receive a 1.00 credit at mid
        self.assertAlmostEqual(natural, -0.8)    # worst case credit
        cmid, cnat = net_prices(reversed_legs(legs), quotes)
        self.assertAlmostEqual(cmid, 1.0)        # closing costs a 1.00 debit
        self.assertAlmostEqual(cnat, 1.2)


if __name__ == "__main__":
    unittest.main()
