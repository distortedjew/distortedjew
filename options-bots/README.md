# Options bots: ATLAS · NOVA · RANGER · VOLT · ORCHARD

Five Python bots that trade US stock options on **Alpaca**, each on one underlying with
its own strategy, plus a live web dashboard. They run as systemd services on a VPS.
That means they're always running, restart on a crash or reboot, and trade only while
the options market is open (9:30–16:00 ET, Mon–Fri). The rest of the time they sleep.

| | Bot | Ticker | Strategy |
|---|---|---|---|
| <img src="dashboard/static/avatars/atlas.svg" width="48"> | **ATLAS** | SPY | Bull put credit spreads on dips in an uptrend |
| <img src="dashboard/static/avatars/nova.svg" width="48"> | **NOVA** | QQQ | Trend-following call/put debit spreads |
| <img src="dashboard/static/avatars/ranger.svg" width="48"> | **RANGER** | IWM | Iron condors in trendless markets |
| <img src="dashboard/static/avatars/volt.svg" width="48"> | **VOLT** | NVDA | Volume-confirmed breakout debit spreads |
| <img src="dashboard/static/avatars/orchard.svg" width="48"> | **ORCHARD** | AAPL | The wheel: cash-secured puts → covered calls |

Full rules: [STRATEGIES.md](STRATEGIES.md).

> **Paper trading by default.** Real money needs live keys *and*
> `ALPACA_LIVE=I-UNDERSTAND-THIS-IS-REAL-MONEY`. Options can lose money fast. Nothing
> here is financial advice, and none of these strategies is guaranteed to make money.
> Run it on paper for at least a few months first.

## What you need
1. An **Alpaca** account (free) at alpaca.markets. In the dashboard, switch to **Paper
   Trading** and generate API keys. Options are enabled on paper accounts. For live
   trading you need options approval **level 3** (spreads).
2. A VPS running Ubuntu 22.04+ or Debian 12 with Python 3.10+. 1 vCPU / 1 GB RAM is plenty.
3. Optional: a free Alpha Vantage key, for earnings dates (used by VOLT and ORCHARD).

## Install on the VPS
```bash
sudo apt update && sudo apt install -y git python3 python3-venv
git clone https://github.com/distortedjew/distortedjew.git
cd distortedjew/options-bots
sudo bash deploy/install.sh                 # -> /opt/options-bots + 6 systemd services
sudo nano /opt/options-bots/.env            # paste ALPACA_KEY_ID / ALPACA_SECRET_KEY
sudo systemctl restart 'optionbot@*' optionbots-dashboard
systemctl status 'optionbot@*'              # all five should be "active (running)"
journalctl -u optionbot@atlas -f            # watch one bot's log
```
To update later: `git pull && sudo bash deploy/install.sh && sudo systemctl restart 'optionbot@*' optionbots-dashboard`.
Your `.env` and trade history (`/opt/options-bots/data`) are kept.

## The dashboard
![Dashboard (simulator demo data)](docs/dashboard.png)

The dashboard shows account equity, realized P&L per bot, and a card per bot. Each
card has the bot's status, today's signal and indicator values, open positions with
live P&L, recent closed trades, win rate, and an activity feed. It refreshes every 15
seconds, works on a phone, and has dark and light themes. It is **read-only** and
holds no broker keys.

- **Private (default):** it listens on `127.0.0.1:8080`. From your computer, run
  `ssh -L 8080:localhost:8080 you@your-vps`, then open http://localhost:8080.
- **Public:** set `DASHBOARD_PASSWORD` in `.env`, restart it, and open
  `http://your-vps-ip:8080`. You'll be asked to log in. Open the port with
  `sudo ufw allow 8080`. For HTTPS, put Caddy or nginx in front.

## Control
- Pause one bot: `sudo -u optionbots touch /opt/options-bots/data/PAUSE_volt`. Pause
  all bots with `.../data/PAUSE`. A paused bot opens nothing new but still manages and
  exits open positions. Delete the file to resume.
- Stop a bot completely: `sudo systemctl stop optionbot@volt`. Its open positions are
  then **not** managed.
- Risk dials are in `.env`:
  - `BOT_ALLOCATION_PCT`: share of the account each bot may tie up (default 20%).
  - `RISK_PER_TRADE_PCT`: max loss of one spread (default 2%).
  - `MAX_CONTRACTS`: contract cap per trade.
  - `DAILY_MAX_LOSS_PCT`: when the account is down this much today, all bots stop
    opening trades.
- Strategy parameters (deltas, DTE, profit target, stop) are the class attributes at
  the top of each `optionbots/bots/<name>.py`.

## Try it with no keys
```bash
pip install -r requirements.txt
BROKER=sim python run_bot.py all            # five bots on a simulated market
python dashboard/server.py                  # http://127.0.0.1:8080
python -m unittest discover -s tests        # tests
```
The simulator only tests the plumbing. Its prices are random and its fills are generous.

## How it works
- `optionbots/base.py` is the shared engine. It handles the schedule, the risk checks
  (pause, daily loss limit, max open, spacing between trades), position sizing,
  choosing contracts by delta, DTE and liquidity, and exits (take profit, stop, time,
  plus each strategy's own exit). It also reconciles expired or assigned positions.
- `optionbots/execution.py` places multi-leg limit orders. It starts at the mid price
  and steps toward the market price if there's no fill; stop-outs step all the way to
  the market price.
- `optionbots/broker.py` is the Alpaca REST adapter: stock bars, the option chain with
  greeks, and multi-leg orders. `optionbots/simbroker.py` is the offline simulator.
- `optionbots/store.py` is the SQLite store: trades, events, heartbeats, equity. The
  bots write to it and the dashboard reads it.

## Before going live
- Leave it on paper long enough to see each bot through several trades. RANGER and
  ATLAS may trade only a few times a month.
- Check in Alpaca's paper dashboard that the first multi-leg orders filled as credit
  or debit the way the bot logged them.
- All five bots share one account. The allocation settings keep them from crowding
  each other out, but the worst case is still all five losing at once.
