# Strategy tournament: summary

- **Format:** 3 rounds, 18 subagent strategies plus incumbents and benchmarks.
- **Ranking:** every result was re-run by the organiser. Strategies were ranked by min(train Sharpe, validation Sharpe).
- **Holdout:** finalists were declared in advance and tested **once** on a sealed holdout that no subagent had access to (crypto Jul 2024 to Sep 2026, ETFs 2024 to Oct 2026). Full tables are in `LEADERBOARD.md` and `HOLDOUT.md`.

## Crypto: the improvement carries over
| Strategy | Tournament score | Holdout Sharpe | Holdout CAGR | Holdout MaxDD |
|---|---|---|---|---|
| **r2-crypto-champplus** (incumbent + BTC>100d gate + 4-of-9 consensus + coin>50d) | 1.38 | **0.71** | 5.8% | **-9.2%** |
| r1-crypto-regime (incumbent + BTC>100d gate) | 1.30 | 0.67 | 6.0% | -11.4% |
| r3-crypto-simple (4 parameters) | 1.34 | 0.57 | 10.7% | -23.7% |
| incumbent-trend (live bot) | 1.22 | 0.53 | 4.9% | -15.8% |
| buy & hold BTC | 0.47 | 0.50 | 13.3% | -53.1% |

The rank order held on unseen data, so the champion is a genuine improvement over the live strategy. Absolute returns in the choppy 2024-26 holdout were modest for every trend strategy.

## ETFs: no edge over simple benchmarks
In the 2024-26 bull market, every finalist (Sharpe 1.13 to 1.29) roughly matched equal-weight buy-and-hold (1.31), 60/40 (1.29) and SPY (1.29). The QQQ-based leaders (hindsight-flagged) did not blow up, but they did not beat 60/40 either. For stock exposure, the evidence supports a plain 60/40 or SPY.

## Eliminated families (and why)
- **Crypto:**
  - Cross-sectional rotation and dip-buying: fitted to 2021; churn and whipsaw out of sample.
  - Blending with Keltner breakouts: too correlated.
  - Multi-horizon TSMOM: too slow.
  - Drawdown brake and dominance filter: cut recoveries or the alt rallies.
- **ETF:**
  - Sector momentum: collapsed in 2020-22.
  - Risk parity and all-asset trend: bond-heavy, hurt by rising rates.
  - A real-time momentum choice of the equity sleeve: showed the QQQ gain was hindsight.
