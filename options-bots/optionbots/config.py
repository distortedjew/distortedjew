"""Settings from the environment (and an optional .env file next to the project)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_dotenv(path: Path = ROOT / ".env") -> None:
    if not path.exists():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key.strip(), value)


def _f(name: str, default: float) -> float:
    return float(os.environ.get(name, default))


def _i(name: str, default: int) -> int:
    return int(os.environ.get(name, default))


LIVE_CONFIRMATION = "I-UNDERSTAND-THIS-IS-REAL-MONEY"


@dataclass
class Settings:
    broker: str              # "alpaca" or "sim"
    key_id: str
    secret_key: str
    live: bool               # True only with the explicit confirmation phrase
    data_dir: Path
    bot_allocation_pct: float
    risk_per_trade_pct: float
    max_contracts: int
    daily_max_loss_pct: float
    exec_wait_sec: int
    manage_every_sec: int
    alphavantage_key: str

    @property
    def db_path(self) -> Path:
        return self.data_dir / "bots.sqlite3"

    def allocation_for(self, bot: str) -> float:
        """Share of account equity a bot may tie up; override with e.g. ORCHARD_ALLOCATION_PCT."""
        return _f(f"{bot.upper()}_ALLOCATION_PCT", self.bot_allocation_pct)


def load_settings() -> Settings:
    load_dotenv()
    live = os.environ.get("ALPACA_LIVE", "") == LIVE_CONFIRMATION
    data_dir = Path(os.environ.get("DATA_DIR", ROOT / "data"))
    data_dir.mkdir(parents=True, exist_ok=True)
    return Settings(
        broker=os.environ.get("BROKER", "alpaca").lower(),
        key_id=os.environ.get("ALPACA_KEY_ID", ""),
        secret_key=os.environ.get("ALPACA_SECRET_KEY", ""),
        live=live,
        data_dir=data_dir,
        bot_allocation_pct=_f("BOT_ALLOCATION_PCT", 0.20),
        risk_per_trade_pct=_f("RISK_PER_TRADE_PCT", 0.02),
        max_contracts=_i("MAX_CONTRACTS", 5),
        daily_max_loss_pct=_f("DAILY_MAX_LOSS_PCT", 0.05),
        exec_wait_sec=_i("EXEC_WAIT_SEC", 45),
        manage_every_sec=_i("MANAGE_EVERY_SEC", 120),
        alphavantage_key=os.environ.get("ALPHAVANTAGE_API_KEY", ""),
    )
