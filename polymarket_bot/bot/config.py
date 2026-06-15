import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


@dataclass
class Config:
    private_key: str
    api_key: str
    api_secret: str
    api_passphrase: str

    chain_id: int
    clob_url: str
    gamma_url: str

    min_edge: float
    max_trade_usdc: float
    kelly_fraction: float
    min_liquidity: float
    max_spread: float

    poll_interval_seconds: int
    dry_run: bool

    @classmethod
    def from_env(cls) -> "Config":
        pk = os.environ.get("PRIVATE_KEY", "").strip()
        if not pk:
            raise ValueError("PRIVATE_KEY environment variable is required")
        return cls(
            private_key=pk,
            api_key=os.getenv("POLYMARKET_API_KEY", ""),
            api_secret=os.getenv("POLYMARKET_API_SECRET", ""),
            api_passphrase=os.getenv("POLYMARKET_API_PASSPHRASE", ""),
            chain_id=int(os.getenv("CHAIN_ID", "137")),
            clob_url=os.getenv("CLOB_URL", "https://clob.polymarket.com"),
            gamma_url=os.getenv("GAMMA_URL", "https://gamma-api.polymarket.com"),
            min_edge=float(os.getenv("MIN_EDGE", "0.05")),
            max_trade_usdc=float(os.getenv("MAX_TRADE_USDC", "50.0")),
            kelly_fraction=float(os.getenv("KELLY_FRACTION", "0.25")),
            min_liquidity=float(os.getenv("MIN_LIQUIDITY", "50.0")),
            max_spread=float(os.getenv("MAX_SPREAD", "0.08")),
            poll_interval_seconds=int(os.getenv("POLL_INTERVAL_SECONDS", "300")),
            dry_run=os.getenv("DRY_RUN", "true").lower() not in ("false", "0", "no"),
        )
