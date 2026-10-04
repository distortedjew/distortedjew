# Strategy: research, design and evidence

## Verdict on the previous approach

The earlier design had the bot trade every few seconds to minutes on a 30 to 120 second prediction, with an LLM setting a plan every 30 minutes. Two facts rule it out:

- **Fees beat the edge.** Alpaca crypto charges 0.15% maker and 0.25% taker at the base tier ([Alpaca](https://alpaca.markets/support/crypto-maker-taker-gmt-faq)), so a round trip costs about 0.5% plus spread. A 2-minute BTC move is typically a few hundredths of a percent, so even a correct prediction loses money.
- **LLMs are not a proven signal.** The live arena at [TradeRank](https://www.traderank.ai/llm-trading-benchmark) reports that across 9 seasons and 56 models only 46.2% of model-seasons were profitable, and as of 24 Sep 2026 none of 18 models beat simply holding Bitcoin. Some multi-agent LLM results look strong in backtests ([arXiv 2501.00826](https://arxiv.org/html/2501.00826v3)), but live results are inconsistent.

That mode is still available as `STRATEGY=scalp` for experiments. It is no longer the default.

## What has evidence: crypto trend following with volatility sizing

- **Donchian ensemble.** [Zarattini, Pagani & Barbon (2025), *Catching Crypto Trends*](https://papers.ssrn.com/sol3/Delivery.cfm/5209907.pdf?abstractid=5209907&mirid=1) combines Donchian-channel breakout models over many lookbacks, a trailing stop that only rises, and volatility-targeted sizing. On BTC since 2015 it reports a 30% CAGR net of fees, Sharpe 1.56 and a maximum drawdown of 19%, against more than 80% for buy-and-hold. It also reports Sharpe above 1.5 on a rotating basket of the 20 most liquid coins. ETH shows Sharpe 1.51 with a 15% drawdown ([replication notes](https://github.com/alfred1123/Quant_Strategies/pull/61)).
- **Time-series momentum.** In crypto it beats cross-sectional momentum, and volatility scaling improves its Sharpe and skew ([comparative study](https://www.journals.vu.lt/BATP/en/article/download/44540/42590/138419), [AUT study](https://acfr.aut.ac.nz/__data/assets/pdf_file/0009/918729/Time_Series_and_Cross_Sectional_Momentum_in_the_Cryptocurrency_Market_with_IA.pdf)).
- **Simple crossovers.** Grayscale's 20/100-day moving-average crossover beat buy-and-hold on a risk-adjusted basis ([Grayscale](https://research.grayscale.com/reports/the-trend-is-your-friend-managing-bitcoins-volatility-with-momentum-signals)). A decade-long study shows trend following in crypto working across regimes ([arXiv 2009.12155](https://arxiv.org/pdf/2009.12155)).
- **Bitcoin at extremes.** Bitcoin tends to trend at new highs and mean-revert at lows ([Quantpedia](https://quantpedia.com/trend-following-and-mean-reversion-in-bitcoin/)), which is the behaviour a breakout-entry, stop-exit model exploits.

Honest caveats: trend following gives back profits in choppy markets (2021 to mid-2023 had no sustained trend), and published results suffer from selection bias. That is why this repo reruns the idea on its own data and does not rely on the papers' numbers.

## The design

| Layer | Role | Why |
|---|---|---|
| **Trend ensemble** (`src/strategy/trend.ts`) | Nine long/flat Donchian models per coin (5 to 360 days). Entry on a close at or above the highest close of the previous *n* days. Exit on a close below a mid-channel trailing stop that only rises. The signal is the fraction of models that are long. | Many lookbacks means no single parameter to overfit. This is the core, and it decides direction. |
| **Volatility-targeted sizing** | Inverse-volatility base weights, scaled with the recent covariance so the portfolio runs at `TARGET_VOL` (25%) when every model is long, then multiplied by each coin's signal. Caps are 35% per coin and 100% gross, with no leverage. | Equal risk per coin. Exposure shrinks automatically in weak trends and high-volatility crashes. |
| **Trade threshold** | Skips rebalances that change a coin by less than 2% of capital, or less than 20% of its weight. Exits always go through. | Keeps turnover, and therefore fees, low. |
| **AI risk officer** (`src/overlay.ts`) | Every 6 hours an LLM (OpenRouter) sees the positions, multi-timeframe data, order book, funding, open interest and news. It may multiply a coin's target by a factor from 0 to 1 for a concrete risk such as a hack, delisting, regulatory action or extreme leverage. | LLMs can read events that price data can't see yet. They can never add risk, and any failure means no change. |
| **Jev executor** (`src/executor.ts`) | Works each daily order over `EXEC_WINDOW_MIN` in slices. It delays a slice while Jev is at least 65% sure the price is about to move in our favour, and the deadline always completes the order. | Uses Jev's speed where speed matters. Its value is measured as cost against the arrival price, in basis points. |
| **Shadow portfolio** | The same strategy without the AI cuts, shown side by side on the dashboard. | After a few months this shows whether the AI officer adds or destroys value. |
| **Risk layer** (unchanged) | Hard caps, a daily-loss kill switch, a $10 minimum order and no shorting. | Nothing above can override it. |

## Backtest (`npm run backtest`)

The test runs on daily data from 2018-01-01 to 2026-09-30 for BTC, ETH, SOL, DOGE, AVAX and LINK. Each coin trades only after 365 days of history. Signals use the close of day *t* and fills happen at the open of *t+1*. Every trade pays 0.30% (0.25% fee plus 0.05% slippage).

|                         | CAGR | Sharpe | Sortino | Max DD | Calmar | Vol | Avg exposure |
|---|---|---|---|---|---|---|---|
| **Trend ensemble**      | **21.7%** | **1.49** | **2.52** | **-16.0%** | **1.36** | 13.8% | 13% |
| MA 20/100 crossover     | 31.7% | 0.86 | 1.43 | -56.3% | 0.56 | 41.4% | 34% |
| Buy & hold BTC          | 22.9% | 0.65 | 0.93 | -81.3% | 0.28 | 63.7% | 100% |
| Buy & hold all 6 coins  | 47.8% | 0.85 | 1.40 | -84.4% | 0.57 | 92.6% | 100% |

- **2022-now, which includes the 2022 crash:** the trend strategy returned 10.2% a year with Sharpe 0.92 and a -16% drawdown. BTC returned 12.6% with a -66.8% drawdown, and the basket returned -2.7% with a -77.6% drawdown. In 2022 itself the strategy lost 5.7%, BTC lost 64% and the basket lost 77%.
- **Last 12 months:** the trend strategy was flat (-0.3%). BTC lost 26.7% and the basket lost 42.8%.
- **Robustness (not used to choose the parameters):** Sharpe stays between 1.2 and 1.6 across fees of 0.15% to 1%, target volatility of 15% to 35%, volatility windows of 30 to 90 days, short-only and long-only lookback sets, and BTC+ETH only. `TARGET_VOL` is the risk dial: 15% gives about 13% CAGR with a -9% drawdown, and 35% gives about 31% CAGR with a -21% drawdown.

**One design change came from the backtest, and it is disclosed here.** The first version gave each coin 25% / 6 of the volatility budget, which left the portfolio only 8% invested with 7.8% volatility. The fix sizes the whole portfolio to 25% using the coins' covariance, as the paper targets strategy-level volatility. No parameter was tuned.

**What the backtest cannot show:** the AI officer and Jev's execution timing. There is no historical record of the LLM's calls, and no free intraday history. Both are measured live instead, through the shadow portfolio and cost against arrival. It also can't show intraday gaps below a stop, which it only sees at the daily close.

## Regime filters (strategy tournament winner)

A tournament of 18 subagent strategies (`src/arena/TOURNAMENT.md`) produced one improvement that held up on a sealed 2024-26 holdout. It adds three filters on top of the trend ensemble (`TREND_FILTERS=on`, default):
1. Hold nothing while BTC closes below its 100-day average.
2. Hold a coin only when at least 4 of its 9 models are long.
3. Hold a coin only while it closes above its own 50-day average.

| 2018-2026, 0.30% costs | CAGR | Sharpe | Max DD | Last 12 months |
|---|---|---|---|---|
| Trend + filters | 22.0% | **1.64** | **-10.7%** | +4.3% |
| Trend (previous default) | 21.7% | 1.49 | -16.0% | -0.3% |
| Same pair at `TARGET_VOL=0.5`, `MAX_WEIGHT=0.5` | 45.2% / 44.7% | 1.63 / 1.50 | -20.5% / -29.7% | +7.4% / -2.8% |

On the holdout alone, the filtered version scored Sharpe 0.71 against 0.53 for the unfiltered strategy.

## The risk dial and faster variants

**Risk dial (`TARGET_VOL`, `MAX_WEIGHT`).** Same signals, more money at work. Sharpe stays about 1.5 at every setting. What changes is the size of gains and drawdowns. Backtest 2018-2026, 0.30% costs:

| Setting | CAGR | Max DD | Avg exposure | Trades/month |
|---|---|---|---|---|
| 0.25 / 0.35 (default) | 21.7% | -16.0% | 13% | 12 |
| 0.35 / 0.35 | 31.1% | -21.1% | 19% | 16 |
| 0.5 / 0.5 | 44.7% | -29.7% | 26% | 20 |
| 0.7 / 0.6 | 61.7% | -39.1% | 36% | 24 |

Even the winning strategy lost money in 56% of all 30-day windows and 45% of 90-day windows. Days or weeks of losses say nothing about whether it works.

**Faster variants (`TREND_VARIANT`).** `4h-fast` runs the same nine bar counts on 4-hour candles, so trends of about 1-60 days, with roughly 8x more trades. `4h-same` keeps the daily 5-360 day horizons but rechecks every 4 hours. Neither has published evidence. Test them on your own data with `npm run fetch-data -- --interval 4h && npm run backtest -- --compare`. The command prints a verdict, and you should switch only if a variant beats `1d` after costs, including at 0.5%.

**Backtest integrity check.** On trendless random-walk prices (zero drift), all three variants score Sharpe ≈ 0 before costs and lose after them, and the fastest loses most: -8%/yr at 0.30% cost from about 1,200 trades a year. So the backtest has no look-ahead, and the daily strategy's real-data Sharpe of 1.49 comes from real trends. This check runs as an automated test.

## Where Jev's speed is used

Speed only creates value when information goes stale fast and acting on it is cheap. The scalper used Jev's speed on decisions that cost ~0.46% each to act on, which is why it lost. In the trend design Jev works in three places:

1. **News reflex** (`src/news-reflex.ts`). Crypto crashes after hacks, insolvencies and delistings unfold within minutes, and the AI officer only reviews every 6 h. Jev answers two typed questions about every new headline (which coin, what impact) in one ~0.3 s pass. A "severe" verdict at ≥70% confidence cuts that coin (or every coin, for market-wide news) to zero for 12 h, sold in one urgent order. It is reduce-only, ignores news older than 30 min, falls back to conservative keywords if Jev errors, and only accepts http(s) links from feeds.
2. **Execution timing** (`src/executor.ts`). Rebalance slices wait while Jev expects a better price.
3. **Scorecard** (`src/scorecard.ts`). Jev predicts each coin on a cadence without trading. The dashboard shows hit rate, a z-score against a coin flip, and the average move in the predicted direction by confidence, compared with the round-trip cost. A limit-order scalper is worth building only if confident calls move more than the cost.

## What "good" looks like live

- The strategy is **flat or small most of the time**. Average exposure is 13% of capital. It makes its money in a few strong trends and loses little in crashes.
- **Expect flat months.** Judge it on at least 6 to 12 months of paper trading, not weeks.
- **AI officer:** it earns its place only if live returns beat the shadow line over time.
- **Jev:** it earns its place only if the average cost against arrival is lower (better) than simply crossing the spread, about half the spread plus the fee.
