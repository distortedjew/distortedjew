#!/usr/bin/env python3
"""Run one bot forever:  python run_bot.py atlas   (or nova, ranger, orchard, volt).

`python run_bot.py all` runs the five bots as threads in one process (handy with BROKER=sim,
where they must share one simulated account).
"""
from __future__ import annotations

import argparse
import logging
import sys
import threading

from optionbots.bots import BOTS
from optionbots.broker import AlpacaBroker
from optionbots.config import load_settings
from optionbots.simbroker import SimBroker
from optionbots.store import Store


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("bot", choices=sorted(BOTS) + ["all"])
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, stream=sys.stdout,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    settings = load_settings()
    if settings.broker == "sim":
        broker = SimBroker()
    else:
        broker = AlpacaBroker(settings.key_id, settings.secret_key, live=settings.live)
        logging.info("Alpaca %s trading", "LIVE (real money)" if settings.live else "PAPER")
    names = list(BOTS) if args.bot == "all" else [args.bot]
    bots = [BOTS[n](broker, Store(settings.db_path), settings) for n in names]
    if settings.broker == "sim":   # the simulator's market never closes
        for b in bots:
            b.entry_start, b.entry_end, b.entry_check_min = (0, 0), (23, 59), 2
    if len(bots) == 1:
        bots[0].run_forever()
        return
    threads = [threading.Thread(target=b.run_forever, name=b.name, daemon=True) for b in bots]
    for t in threads:
        t.start()
    for t in threads:
        t.join()


if __name__ == "__main__":
    main()
