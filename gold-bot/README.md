# gold-bot

An always-on Python bot that trades **XAUUSD (gold) on 15-minute candles** by itself. It runs on **demo/practice money by default** and refuses a real-money account unless you set `LIVE_TRADING=yes`.

## What it does

Every 15 minutes, 10 seconds after the candle closes, it:

1. Downloads the last 600 completed M15 candles from your broker.
2. Manages any open trade: moves the stop to breakeven at +1R, closes after 16 hours, and closes before the weekend (Friday 20:00 UTC).
3. If flat, looks for an entry:

| | Long (short is the mirror) |
|---|---|
| Trend | EMA20 > EMA50 > EMA200, close above EMA200 |
| Pullback | RSI(14) dipped below 40 in the last 6 bars |
| Trigger | RSI crosses back above 50, close above EMA20 |
| Filters | 07:00-20:00 UTC only (London + New York); ATR not below 60% of its 5-day median; spread ≤ $0.60; no new trades late Friday |
| Stop / target | 1.5 ATR / 3 ATR (2:1), **sent with the order**, so they stay on the broker's server even if the bot or VPS goes down |

### Risk limits (in code, not up to the strategy)

- **0.5% of equity risked per trade.** Size = equity × 0.5% ÷ stop distance. The bot never rounds up to meet a broker minimum; it skips the trade instead.
- **-2% on the day:** closes everything and stops trading until the next UTC day.
- At most 4 trades a day, one position at a time, a 2-bar cooldown, and notional capped at 10× equity.
- Real-money accounts are refused unless `LIVE_TRADING=yes`. Risk settings above 2%/trade or 10%/day are rejected at startup.

## Setup

### Option A: OANDA on a Linux VPS (recommended for 24/5)

1. Open a free **demo** account at oanda.com. Under *Manage API Access*, generate a token, and note your account ID (`101-...`).
2. On the VPS (Ubuntu with `python3-venv` installed):

```bash
git clone https://github.com/distortedjew/distortedjew.git
cd distortedjew/gold-bot
sudo bash deploy/install.sh        # installs to /opt/gold-bot as a systemd service
sudo nano /opt/gold-bot/.env       # paste OANDA_TOKEN and OANDA_ACCOUNT_ID
sudo systemctl restart gold-bot
journalctl -u gold-bot -f          # live log
```

The service starts on boot and restarts on crash. Update later with `git pull && sudo bash deploy/install.sh && sudo systemctl restart gold-bot`. Your `.env` and state are kept.

### Option B: MetaTrader 5 (Windows)

Use this if your gold broker is MT5-only. The MT5 terminal must stay open, so use a Windows VPS for always-on running.

```powershell
cd gold-bot
pip install -r requirements.txt MetaTrader5
copy .env.example .env     # set BROKER=mt5, MT5_SYMBOL (XAUUSD / GOLD / XAUUSD.m), MT5_SERVER_UTC_OFFSET
python -m goldbot
```

Turn on *Algo Trading* in the terminal. For auto-restart, run it from Task Scheduler ("At startup", "restart on failure") or NSSM.

### Run locally

```bash
pip install -r requirements.txt
cp .env.example .env       # fill in your demo keys
python -m goldbot
```

## Backtest before you trust it

```bash
python -m goldbot.fetch_data --years 3            # OANDA M15 history -> data/xauusd_m15.csv
python -m goldbot.backtest data/xauusd_m15.csv --spread 0.35 --trades data/trades.csv
```

The backtest calls the same strategy and trade-management functions as the live bot. Fills are pessimistic: entry at the next candle's open plus half the spread and slippage, and when a candle touches both the stop and the target, the stop counts first. MT5 *Export Bars* CSVs work too.

## Files

- `goldbot/strategy.py`: indicators, entry signal, trade management (pure functions)
- `goldbot/bot.py`: the always-on loop, the daily-loss kill switch, and state in `data/state.json` (survives restarts; adopts an open trade after a restart)
- `goldbot/risk.py`: position sizing
- `goldbot/brokers/oanda.py`, `goldbot/brokers/mt5.py`: broker adapters
- `goldbot/backtest.py`, `goldbot/fetch_data.py`: research tools
- `logs/trades.jsonl`: every open, breakeven, close, and kill-switch event. `logs/goldbot.log` is the full log.
- Tests: `python -m unittest discover -s tests -t .` (no network or account needed)

## Honest limits

- **This strategy has not been backtested on real gold data yet.** The build environment had no market-data access, so the tests only prove the mechanics on synthetic prices: sizing, stops, kill switch, restarts, and no double entries. Run the backtest on 2-3 years of real data, then run it on demo for at least a month, before you consider real money.
- Nothing here guarantees profit. Most retail CFD/forex accounts lose money. Gold is volatile: it moves $20-50 a day and can gap on news (NFP, CPI, FOMC). A stop can fill worse than its price.
- Spreads and swaps differ by broker and are not in the live P&L estimate. Check your broker's XAUUSD spread and set `MAX_SPREAD` to match.
- On MT5, candle times follow the broker's server clock. Set `MT5_SERVER_UTC_OFFSET` correctly, or the session filter will be off by hours.
