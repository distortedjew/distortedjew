# Active stock trading: research and backtests

**Result: none of the four evidence-based active strategies tested beat simply holding SPY after 2015.** No live stock trader has been built, because the backtests say it would most likely underperform the index.

## Data and method
- **Data:** daily prices from [Johnbrick123/sp500-data](https://github.com/Johnbrick123/sp500-data), split- and dividend-adjusted, with point-in-time S&P 500 membership. The strategy may only pick stocks that were in the index on that date.
- **Coverage caveat:** prices for companies that later left the index are incomplete (about 63% coverage in 2008, 76% in 2015, 97% in 2024). The missing names are mostly failures, so results before 2015 are flattered, and **2015 onward is the main test**.
- **Execution:** signals at the close, fills at the next open, 0.05% cost per side (Alpaca stocks are commission-free; this covers spread and slippage). A held stock that stops trading is sold at its last close.
- **Discipline:** rules were fixed in advance from the literature and not tuned. Four strategies were tried, so picking the best of them would itself be a form of overfitting.

## Results, 2015-01-01 to 2026-10-01

| Strategy | CAGR | Sharpe | Max DD | Notes |
|---|---|---|---|---|
| **Buy & hold SPY** | **13.7%** | **0.82** | -33.7% | the benchmark |
| SPY with 200-day timing (cash below it) | 9.1% | 0.79 | **-19.5%** | lower return, about half the drawdown |
| Weekly 12-1 momentum, top 20, SPY regime ([Jegadeesh & Titman 1993](https://www.bauer.uh.edu/rsusmel/phd/jegadeesh-titman93.pdf)) | 9.0% | 0.49 | -34.0% | +58% in the last 12 months, but negative in 2015, 2016, 2018, 2022, 2023 |
| RSI(2) mean reversion, 10 slots ([Connors](https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/rsi-2), [short-term reversal](https://quantpedia.com/strategies/short-term-reversal-in-stocks)) | 6.2% | 0.49 | -24.8% | about 900 trades/yr; 1.2% CAGR at 0.1% cost, negative at 0.2% |
| 52-week-high breakouts, trailing stop | 3.9% | 0.33 | -24.6% | |

- **RSI(2) robustness:** entry RSI 5 or 20, 5 or 20 slots, no regime filter, or a 5-day maximum hold all give Sharpe between 0.34 and 0.53, and none of them rescue it.
- **Why it fails:** this is consistent with published anomalies decaying once they're widely known. The short-term reversal effect still exists in academic tests measured relative to industry peers, but this simple long-only implementation doesn't capture enough of it after costs.

## Reproduce
```bash
pip install duckdb
curl -L -o prices.parquet https://github.com/Johnbrick123/sp500-data/releases/download/data/prices.parquet
curl -L -o members.parquet https://github.com/Johnbrick123/sp500-data/releases/download/data/membership_intervals.parquet
# export to data/stocks.csv (date,ticker,open,high,low,close,volume,member; adjusted; point-in-time member flag)
python3 -c "import duckdb; duckdb.sql(open('scripts/export-stocks.sql').read())"
npm run backtest-stocks              # RSI(2) reversion with robustness table
npx tsx src/backtest-stocks-alt.ts   # momentum and breakouts
```
