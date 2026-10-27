"""Process configuration from environment variables / .env, shared by engine and API.

Secrets (API keys, bot tokens, webhooks, SMTP passwords) live only here. They
are never written to the database, never part of ``BotSettings`` and never
returned by any endpoint: the API exposes only "configured: yes/no".

Dashboard-editable trading parameters are ``schemas.BotSettings`` in the
database, not environment variables.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

from .schemas import FeedSetting, TradingMode

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent
VERSION = "0.1.0"


class EnvConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(PROJECT_DIR / ".env"), str(BACKEND_DIR / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # storage
    tradebot_db: Path = Field(default=BACKEND_DIR / "data" / "tradebot.db")

    # trading mode: this build implements paper trading only; "live" makes the engine refuse to start
    trading_mode: TradingMode = "paper"
    starting_balance: float = 10_000.0

    # market data
    feed: FeedSetting = "auto"  # auto = Binance, falling back to the simulator if unreachable
    binance_rest_url: str = "https://api.binance.com"
    binance_ws_url: str = "wss://stream.binance.com:9443"
    sim_seed: int = 7
    # simulated feed only, and only on an empty database: fast-forward this many days of
    # simulated market through the real trading core so the dashboard has a track record
    sim_bootstrap_days: int = 14

    # AI (OpenRouter)
    openrouter_api_key: SecretStr | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_app_url: str = "https://github.com/distortedjew/distortedjew"
    openrouter_app_name: str = "AI Trading Bot"

    # optional notification channels
    telegram_bot_token: SecretStr | None = None
    telegram_chat_id: str | None = None
    discord_webhook_url: SecretStr | None = None
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: SecretStr | None = None
    smtp_from: str | None = None
    smtp_starttls: bool = True

    # API / dashboard
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    dashboard_token: SecretStr | None = None  # when set, REST and WS require it
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    dashboard_dist: Path = Field(default=PROJECT_DIR / "dashboard" / "dist")

    log_level: str = "INFO"

    # -- derived ---------------------------------------------------------------

    @property
    def openrouter_configured(self) -> bool:
        return bool(self.openrouter_api_key and self.openrouter_api_key.get_secret_value().strip())

    @property
    def telegram_configured(self) -> bool:
        return bool(
            self.telegram_bot_token
            and self.telegram_bot_token.get_secret_value().strip()
            and self.telegram_chat_id
        )

    @property
    def discord_configured(self) -> bool:
        return bool(self.discord_webhook_url and self.discord_webhook_url.get_secret_value().strip())

    @property
    def email_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_from)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def secret_values(self) -> list[str]:
        """Every configured secret, for leak checks in tests and log scrubbing."""
        secrets = [
            self.openrouter_api_key,
            self.telegram_bot_token,
            self.discord_webhook_url,
            self.smtp_password,
            self.dashboard_token,
        ]
        return [s.get_secret_value() for s in secrets if s is not None and s.get_secret_value()]


@lru_cache(maxsize=1)
def get_config() -> EnvConfig:
    return EnvConfig()
