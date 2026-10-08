"""Run the city during market hours.

    python -m scalpcity.live --feed sim                      # synthetic market, sped up, no keys
    python -m scalpcity.live --feed alpaca                   # real 1-min bars, paper-model fills
    python -m scalpcity.live --feed alpaca --broker alpaca   # real bars, orders on your Alpaca PAPER account

Each minute it pulls the candle that just closed for every symbol, hands it to the workers and
rewrites the dashboard state. Ctrl-C flattens every open position before exiting.
"""

from __future__ import annotations

import argparse
import logging
import signal
import time
from datetime import date, datetime, timedelta

from .backtest import make_paper_broker
from .bars import ET, RTH_CLOSE, RTH_OPEN, is_trading_day
from .city import City
from .config import load_config
from .feeds import SyntheticMarket, alpaca_bars

log = logging.getLogger("scalpcity")


def warmup(city: City, symbols: list[str], now: datetime) -> None:
    """Feed the previous session so the 50 EMA is warm at the open (signals/trades from it are discarded)."""
    start = now - timedelta(days=5)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    for s in symbols:
        bars = [b for b in alpaca_bars(s, start, today)][-200:]
        for w in city.by_symbol[s]:
            for b in bars:
                w.engine.on_bar(b)


def run_alpaca(city: City, poll_delay: float = 3.0) -> None:
    syms = list(city.by_symbol)
    warmup(city, syms, datetime.now(ET))
    last: dict[str, datetime] = {}
    while True:
        now = datetime.now(ET)
        if not is_trading_day(now.date()) or now.time() >= RTH_CLOSE:
            log.info("market closed, exiting")
            return
        if now.time() < RTH_OPEN:
            time.sleep(15)
            continue
        # sleep until a few seconds after the next minute boundary so the bar is final
        nxt = now.replace(second=0, microsecond=0) + timedelta(minutes=1, seconds=poll_delay)
        time.sleep(max(0.0, (nxt - datetime.now(ET)).total_seconds()))
        for s in syms:
            try:
                bars = alpaca_bars(s, datetime.now(ET) - timedelta(minutes=10), datetime.now(ET))
            except Exception as e:  # network hiccup: try again next minute
                log.warning("bars %s: %s", s, e)
                continue
            for b in bars:
                if b.close_ts <= datetime.now(ET) and (s not in last or b.ts > last[s]):
                    city.on_bar(s, b)
                    last[s] = b.ts
        city.write_state()


def run_sim(city: City, speed: float, seed: int) -> None:
    """Replays synthetic days at `speed` bars per second, forever, so the dashboard has something to show."""
    mkt = SyntheticMarket(list(city.by_symbol), seed=seed)
    d = date.today() - timedelta(days=30)
    while True:
        d += timedelta(days=1)
        if not is_trading_day(d):
            continue
        day = mkt.day(d)
        for i in range(390):
            for s, bars in day.items():
                city.on_bar(s, bars[i])
            city.write_state()
            time.sleep(1 / speed)


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", default="config.example.toml")
    ap.add_argument("--feed", choices=["sim", "alpaca"], default="sim")
    ap.add_argument("--broker", choices=["paper", "alpaca"], help="override [city] broker")
    ap.add_argument("--speed", type=float, default=4.0, help="sim feed: bars per second")
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")

    cfg = load_config(a.config)
    kind = a.broker or cfg.broker
    if kind == "alpaca":
        if a.feed != "alpaca":
            ap.error("--broker alpaca needs --feed alpaca (orders must match real prices)")
        from .brokers.alpaca import AlpacaPaperBroker

        broker = AlpacaPaperBroker()
    else:
        broker = make_paper_broker(cfg)
    city = City(cfg, broker, mode=f"{a.feed}/{kind}")

    def stop(*_):
        log.info("stopping: flattening open positions")
        city.flatten_all("shutdown")
        city.write_state()
        raise SystemExit(0)

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    log.info("%s open: %s", cfg.name, ", ".join(f"{w.cfg.name}({w.cfg.symbol})" for w in city.workers))
    if a.feed == "sim":
        run_sim(city, a.speed, a.seed)
    else:
        run_alpaca(city)
        city.flatten_all("market close")
        city.write_state()


if __name__ == "__main__":
    main()
