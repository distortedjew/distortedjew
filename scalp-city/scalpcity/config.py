"""Config: one [city] section plus one [[workers]] table per tower. See config.example.toml."""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, field, fields

from .strategy import TRIGGERS


@dataclass
class WorkerConfig:
    name: str
    symbol: str
    district: str = "VWAP"
    triggers: list[str] = field(default_factory=lambda: list(TRIGGERS))
    # Contract
    dte: int = 1  # 1 = expires next trading day ("one day to expiration"); 0 = same-day
    otm_steps: int = 0  # 0 = at the money
    strike_step: float = 1.0
    contracts: int = 5
    max_premium: float = 0.0  # >0 caps qty so qty * ask * 100 <= this
    # Exits (not specified in the video: these are this implementation's defaults)
    take_profit_pct: float = 25.0
    stop_loss_pct: float = 15.0
    max_hold_min: int = 30
    exit_on_opposite: bool = True  # an opposite signal closes the trade...
    reverse_on_opposite: bool = True  # ...and opens the other side
    # Daily limits ("once it gets up to a set amount it stops trading for the day")
    daily_profit_target: float = 500.0
    daily_max_loss: float = 400.0
    max_trades_per_day: int = 12
    cooldown_min: int = 2  # bars to wait after a stop/target before re-entering
    # Session windows (ET)
    entry_start: str = "09:31"
    entry_end: str = "15:30"
    flatten_at: str = "15:55"
    # Signal tuning
    ema_len: int = 50
    or_minutes: int = 15
    orb_once_per_day: bool = True
    min_cross_pct: float = 0.0


@dataclass
class CityConfig:
    name: str = "Scalp City"
    broker: str = "paper"  # paper | alpaca (alpaca = Alpaca PAPER account)
    daily_profit_target: float = 0.0  # >0: every worker clocks out once the whole city made this much today
    daily_max_loss: float = 0.0
    fee_per_contract: float = 0.65
    spread_pct: float = 0.03
    min_spread: float = 0.02
    default_iv: float = 0.20
    iv: dict[str, float] = field(default_factory=lambda: {"QQQ": 0.18, "SPY": 0.14, "IWM": 0.22})
    state_path: str = "state.json"
    workers: list[WorkerConfig] = field(default_factory=list)

    @property
    def symbols(self) -> list[str]:
        return sorted({w.symbol for w in self.workers})


def _build(cls, raw: dict):
    known = {f.name for f in fields(cls)}
    unknown = set(raw) - known
    if unknown:
        raise ValueError(f"{cls.__name__}: unknown keys {sorted(unknown)}")
    return cls(**raw)


def load_config(path: str) -> CityConfig:
    with open(path, "rb") as f:
        raw = tomllib.load(f)
    city = dict(raw.get("city", {}))
    workers = [_build(WorkerConfig, w) for w in raw.get("workers", [])]
    if not workers:
        raise ValueError(f"{path}: define at least one [[workers]]")
    names = [w.name for w in workers]
    if len(set(names)) != len(names):
        raise ValueError(f"{path}: worker names must be unique")
    cfg = _build(CityConfig, city)
    cfg.workers = workers
    return cfg
