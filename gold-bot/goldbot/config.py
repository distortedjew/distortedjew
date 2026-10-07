"""Settings, read from environment variables (and a .env file if present)."""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path


def load_dotenv(path: str | Path = ".env") -> None:
    """Minimal .env loader: KEY=VALUE lines; real environment variables win."""
    p = Path(path)
    if not p.exists():
        return
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = re.split(r"\s+#", value, maxsplit=1)[0]  # allow "KEY=value  # comment"
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _f(name: str, default: float) -> float:
    return float(os.environ.get(name) or default)  # empty counts as unset


def _i(name: str, default: int) -> int:
    return int(os.environ.get(name) or default)


def _s(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


@dataclass
class StrategyParams:
    ema_fast: int = 20
    ema_slow: int = 50
    ema_trend: int = 200
    rsi_len: int = 14
    atr_len: int = 14
    rsi_pullback_long: float = 40.0   # RSI must have dipped below this (in an uptrend)...
    rsi_pullback_short: float = 60.0  # ...or risen above this (in a downtrend)
    pullback_lookback: int = 6        # bars to look back for the pullback
    sl_atr: float = 1.5               # stop-loss distance in ATRs
    tp_atr: float = 3.0               # take-profit distance in ATRs (2R)
    breakeven_r: float = 1.0          # move stop to entry once price is this many R in profit
    max_bars_in_trade: int = 64       # 16 hours on M15
    session_start_utc: int = 7        # London open
    session_end_utc: int = 20         # New York afternoon
    atr_floor_ratio: float = 0.6      # skip when ATR < 60% of its ~5-day median (dead market)
    friday_close_utc: int = 20        # flatten on Friday from this hour (weekend gap risk)

    @classmethod
    def from_env(cls) -> "StrategyParams":
        p = cls()
        for name, value in vars(p).items():
            env = os.environ.get("STRAT_" + name.upper())
            if env is not None:
                setattr(p, name, type(value)(env))
        return p


@dataclass
class Config:
    broker: str = "oanda"              # oanda | mt5
    live_trading: bool = False         # must be explicitly "yes" to use a real-money account
    risk_per_trade: float = 0.005      # 0.5% of equity lost if the stop is hit
    max_daily_loss: float = 0.02       # 2%: flatten and stop for the rest of the UTC day
    max_trades_per_day: int = 4
    max_spread: float = 0.60           # USD per ounce; skip entries when wider
    max_leverage: float = 10.0         # notional cap: units * price <= equity * this
    cooldown_bars: int = 2             # bars to wait after a trade closes
    candles: int = 600                 # history fetched each bar (enough for EMA200 + ATR median)
    state_file: str = "data/state.json"
    log_dir: str = "logs"
    dashboard_host: str = "127.0.0.1"   # 0.0.0.0 exposes it; then DASHBOARD_TOKEN is required
    dashboard_port: int = 8050           # 0 turns the dashboard off
    dashboard_token: str = ""
    telegram_token: str = ""
    telegram_chat_id: str = ""
    # OANDA
    oanda_token: str = ""
    oanda_account: str = ""
    oanda_env: str = "practice"        # practice | live
    oanda_instrument: str = "XAU_USD"
    # MetaTrader 5
    mt5_login: int = 0
    mt5_password: str = ""
    mt5_server: str = ""
    mt5_path: str = ""
    mt5_symbol: str = "XAUUSD"
    mt5_magic: int = 15_0815
    strategy: StrategyParams = field(default_factory=StrategyParams)

    @classmethod
    def from_env(cls) -> "Config":
        load_dotenv()
        return cls(
            broker=_s("BROKER", "oanda").lower(),
            live_trading=_s("LIVE_TRADING", "no").lower() == "yes",
            risk_per_trade=_f("RISK_PER_TRADE", 0.005),
            max_daily_loss=_f("MAX_DAILY_LOSS", 0.02),
            max_trades_per_day=_i("MAX_TRADES_PER_DAY", 4),
            max_spread=_f("MAX_SPREAD", 0.60),
            max_leverage=_f("MAX_LEVERAGE", 10.0),
            cooldown_bars=_i("COOLDOWN_BARS", 2),
            candles=_i("CANDLES", 600),
            state_file=_s("STATE_FILE", "data/state.json"),
            log_dir=_s("LOG_DIR", "logs"),
            dashboard_host=_s("DASHBOARD_HOST", "127.0.0.1"),
            dashboard_port=_i("DASHBOARD_PORT", 8050),
            dashboard_token=_s("DASHBOARD_TOKEN"),
            telegram_token=_s("TELEGRAM_BOT_TOKEN"),
            telegram_chat_id=_s("TELEGRAM_CHAT_ID"),
            oanda_token=_s("OANDA_TOKEN"),
            oanda_account=_s("OANDA_ACCOUNT_ID"),
            oanda_env=_s("OANDA_ENV", "practice").lower(),
            oanda_instrument=_s("OANDA_INSTRUMENT", "XAU_USD"),
            mt5_login=_i("MT5_LOGIN", 0),
            mt5_password=_s("MT5_PASSWORD"),
            mt5_server=_s("MT5_SERVER"),
            mt5_path=_s("MT5_PATH"),
            mt5_symbol=_s("MT5_SYMBOL", "XAUUSD"),
            mt5_magic=_i("MT5_MAGIC", 15_0815),
            strategy=StrategyParams.from_env(),
        )

    def validate(self) -> None:
        if not 0 < self.risk_per_trade <= 0.02:
            raise ValueError("RISK_PER_TRADE must be between 0 and 0.02 (2%)")
        if not 0 < self.max_daily_loss <= 0.10:
            raise ValueError("MAX_DAILY_LOSS must be between 0 and 0.10 (10%)")
        if self.broker not in ("oanda", "mt5"):
            raise ValueError("BROKER must be oanda or mt5")
        if self.dashboard_port and self.dashboard_host not in ("127.0.0.1", "localhost", "::1") \
                and len(self.dashboard_token) < 16:
            raise ValueError("DASHBOARD_HOST is public: set DASHBOARD_TOKEN (16+ random characters)")
        if self.broker == "oanda" and self.oanda_env == "live" and not self.live_trading:
            raise ValueError("OANDA_ENV=live needs LIVE_TRADING=yes (real money). Use practice first.")
