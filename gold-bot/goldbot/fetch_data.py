"""Download XAU_USD M15 history from OANDA (practice key is enough) for backtesting.

    python -m goldbot.fetch_data --years 3 --out data/xauusd_m15.csv
"""
from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from .brokers.oanda import OandaBroker
from .config import Config


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=float, default=3)
    ap.add_argument("--out", default="data/xauusd_m15.csv")
    a = ap.parse_args()
    cfg = Config.from_env()
    end = pd.Timestamp.now(tz="UTC")
    start = end - pd.Timedelta(days=int(a.years * 365))
    df = OandaBroker(cfg).history(start, end)
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(a.out, index=False)
    print(f"{len(df)} candles -> {a.out}")


if __name__ == "__main__":
    main()
