from ..config import Config
from .base import Broker, Position


def make_broker(cfg: Config) -> Broker:
    if cfg.broker == "oanda":
        from .oanda import OandaBroker
        return OandaBroker(cfg)
    if cfg.broker == "mt5":
        from .mt5 import MT5Broker
        return MT5Broker(cfg)
    raise ValueError(f"unknown BROKER {cfg.broker}")


__all__ = ["Broker", "Position", "make_broker"]
