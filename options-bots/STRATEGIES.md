# The five strategies

Each bot trades one underlying and uses a defined-risk structure, so the most it can
lose on a trade is known before it enters. Signals use **completed daily bars only**
(no look-ahead). Entries are checked between 10:00 and 15:30 ET. Exits are checked
every 2 minutes while the market is open.

Exit thresholds are relative to the entry price. For credit trades that means the
credit received; for debit trades it means the debit paid.

| Bot | Ticker | Edge it tries to harvest | Structure |
|---|---|---|---|
| ATLAS | SPY | Index drift up + the volatility risk premium | Bull put credit spread |
| NOVA | QQQ | Medium-term trend persistence in tech | Call or put debit spread |
| RANGER | IWM | Small caps chopping sideways + premium decay | Iron condor |
| VOLT | NVDA | Volume-confirmed breakouts in a high-momentum stock | Call or put debit spread |
| ORCHARD | AAPL | Premium from a quality stock you'd be fine owning | The wheel (CSP → covered call) |

## ATLAS · SPY · bull put credit spreads
- **Enter** when SPY > 200-day SMA **and** 50-day > 200-day (uptrend), **and** 20-day realised
  vol < 35% (not mid-crash). An optional "only on dips" filter (close ≤ 10-day EMA or RSI(14) < 45,
  `require_dip = 1`) is **off**: in backtests it made results worse in both 2018–22 and 2023–26,
  because it bought into selloffs that kept falling.
- **Trade:** sell the ~0.20-delta put and buy the put $5 lower, 30–50 DTE (target 40).
- **Exit:** +50% of credit, or when the spread costs 2× the credit (−100%), or at 21 DTE.
- Max 3 open, at least 5 days apart.

## NOVA · QQQ · trend debit spreads
- **Bullish:** EMA20 > EMA50, close > EMA20, MACD histogram positive and rising, RSI 50–70.
  **Bearish** (the mirror image, with RSI 30–50, `allow_bearish = 1`) is **off**: in backtests the
  bearish trades lost money in both 2018–22 and 2023–26. NOVA now trades uptrends and sits out
  downtrends.
- **Trade:** buy the ~0.60-delta and sell the ~0.30-delta option, 21–45 DTE (target 30).
  The spread costs no more than 75% of its width.
- **Exit:** +80%, −50%, 7 DTE, or when EMA20 crosses back through EMA50.
- Max 2 open, at least 3 days apart.

## RANGER · IWM · iron condors
- **Enter** when ADX(14) < 20 (no trend), the close is inside the 20-day Bollinger Bands,
  and realised vol < 30%.
- **Trade:** sell the ~0.16-delta put and call, buy wings $5 further out, 30–50 DTE (target 45).
- **Exit:** +50% of credit, −100%, 21 DTE, or IWM trades through a short strike.
- Max 2 open, at least 7 days apart.

## VOLT · NVDA · breakout debit spreads
- **Bullish:** close above the prior 20-day high, volume > 1.5× its 20-day average, close > 50-day SMA.
  **Bearish:** below the 20-day low on the same volume surge, below the 50-day SMA.
- **Trade:** buy the ~0.55-delta and sell the ~0.25-delta option, 30–60 DTE (target 45).
- **Exit:** +100%, −50%, 10 DTE, a close back through the 10-day low/high, or the day
  before earnings. No new entry if earnings fall before expiry. Earnings checks need
  `ALPHAVANTAGE_API_KEY`.
- Max 2 open, at least 5 days apart.

## ORCHARD · AAPL · the wheel
- **No shares:** while AAPL > 200-day SMA and RSI < 65, sell a ~0.25-delta cash-secured
  put, 25–45 DTE. Buy it back at +50%, or stop out at −200% (put worth 3× the credit).
- **Assigned (≥100 shares):** sell ~0.30-delta covered calls at or above your cost basis.
  Buy them back at +50%, or let the shares be called away.
- Positions are held to expiry, because assignment is part of the plan. ORCHARD needs
  strike × 100 in cash per put (about $25k+). That's why `ORCHARD_ALLOCATION_PCT`
  defaults to 35%.

## Why these and not "the best"
There is no strategy that is best in all markets. These are well-known, rules-based
approaches, and each matches its underlying's character: index drift for SPY, trend
for QQQ, chop for IWM, momentum for NVDA, quality for AAPL. **They have not been
backtested on historical option prices**, because that data isn't freely available.
The thresholds are common practitioner defaults, not optimised values. Treat the
first months on paper as the real test, and change the class attributes at the top
of each bot file (`optionbots/bots/*.py`) once you have evidence.

Known risks: a gap through a short strike can lose the full spread width before any
stop fires. Credit strategies win often but lose more when they lose. Debit spreads
lose often but win bigger. The indicative (free) Alpaca options feed can lag, so fills
can differ from the quotes the bots see.
