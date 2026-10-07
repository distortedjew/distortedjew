"""MetaTrader 5 adapter (Windows only: the MetaTrader5 Python package talks to a running
MT5 terminal). Works with any MT5 broker that offers gold; set MT5_SYMBOL to their name
for it (XAUUSD, XAUUSD.m, GOLD, ...).

Stop-loss and take-profit are sent with the order, so they sit on the broker's server.
"""
from __future__ import annotations

import os

import pandas as pd

from ..config import Config
from ..risk import round_down
from .base import Broker, Position

try:
    import MetaTrader5 as mt5
except ImportError:  # not on Windows / not installed
    mt5 = None


class MT5Broker(Broker):
    name = "mt5"

    def __init__(self, cfg: Config):
        if mt5 is None:
            raise RuntimeError("pip install MetaTrader5 (Windows only), and keep the MT5 terminal running")
        kw = {}
        if cfg.mt5_path:
            kw["path"] = cfg.mt5_path
        if cfg.mt5_login:
            kw.update(login=cfg.mt5_login, password=cfg.mt5_password, server=cfg.mt5_server)
        if not mt5.initialize(**kw):
            raise RuntimeError(f"MT5 initialize failed: {mt5.last_error()}")
        acct = mt5.account_info()
        if acct is None:
            raise RuntimeError(f"MT5 not logged in: {mt5.last_error()}")
        is_demo = acct.trade_mode == mt5.ACCOUNT_TRADE_MODE_DEMO
        if not is_demo and not cfg.live_trading:
            mt5.shutdown()
            raise RuntimeError("This MT5 account is REAL money. Use a demo account, or set LIVE_TRADING=yes.")
        self.symbol = cfg.mt5_symbol
        self.magic = cfg.mt5_magic
        if not mt5.symbol_select(self.symbol, True):
            raise RuntimeError(f"Symbol {self.symbol} not available. Check MT5_SYMBOL (e.g. XAUUSD, GOLD).")
        self.info = mt5.symbol_info(self.symbol)
        self.contract = self.info.trade_contract_size or 100.0  # ounces per lot

    def _digits(self, price: float) -> float:
        return round(price, self.info.digits)

    def candles(self, count: int) -> pd.DataFrame:
        # position 0 is the bar still forming; start at 1 for completed bars only
        rates = mt5.copy_rates_from_pos(self.symbol, mt5.TIMEFRAME_M15, 1, count)
        if rates is None or len(rates) == 0:
            raise RuntimeError(f"no candles: {mt5.last_error()}")
        df = pd.DataFrame(rates)[["time", "open", "high", "low", "close"]]
        # MT5 timestamps are in the broker's server time zone; MT5_SERVER_UTC_OFFSET fixes it
        offset = int(os.environ.get("MT5_SERVER_UTC_OFFSET", "0"))
        df["time"] = pd.to_datetime(df["time"], unit="s", utc=True) - pd.Timedelta(hours=offset)
        return df

    def equity(self) -> float:
        return float(mt5.account_info().equity)

    def quote(self) -> tuple[float, float]:
        t = mt5.symbol_info_tick(self.symbol)
        return float(t.bid), float(t.ask)

    def position(self) -> Position | None:
        for p in mt5.positions_get(symbol=self.symbol) or []:
            if p.magic != self.magic:
                continue
            return Position(
                id=str(p.ticket), side="buy" if p.type == mt5.POSITION_TYPE_BUY else "sell",
                units=p.volume * self.contract, entry=p.price_open,
                sl=p.sl or None, tp=p.tp or None,
            )
        return None

    def min_units(self) -> float:
        return self.info.volume_min * self.contract

    def normalize_units(self, units: float) -> float:
        lots = min(round_down(units / self.contract, self.info.volume_step), self.info.volume_max)
        return lots * self.contract if lots >= self.info.volume_min else 0.0

    def _send(self, req: dict):
        last = None
        for filling in (mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_FOK, mt5.ORDER_FILLING_RETURN):
            req["type_filling"] = filling
            res = mt5.order_send(req)
            if res is not None and res.retcode == mt5.TRADE_RETCODE_DONE:
                return res
            last = res
            if res is None or res.retcode != mt5.TRADE_RETCODE_INVALID_FILL:
                break
        raise RuntimeError(f"MT5 order failed: {last} {mt5.last_error()}")

    def open(self, side: str, units: float, sl: float, tp: float) -> Position:
        bid, ask = self.quote()
        lots = round(units / self.contract, 2)
        self._send({
            "action": mt5.TRADE_ACTION_DEAL, "symbol": self.symbol, "volume": lots,
            "type": mt5.ORDER_TYPE_BUY if side == "buy" else mt5.ORDER_TYPE_SELL,
            "price": ask if side == "buy" else bid,
            "sl": self._digits(sl), "tp": self._digits(tp), "deviation": 30,
            "magic": self.magic, "comment": "goldbot m15", "type_time": mt5.ORDER_TIME_GTC,
        })
        pos = self.position()
        if pos is None:
            raise RuntimeError("order filled but no position found")
        return pos

    def set_sl(self, pos: Position, sl: float) -> None:
        self._send({"action": mt5.TRADE_ACTION_SLTP, "symbol": self.symbol, "position": int(pos.id),
                    "sl": self._digits(sl), "tp": self._digits(pos.tp or 0.0), "magic": self.magic})

    def close(self, pos: Position) -> None:
        bid, ask = self.quote()
        self._send({
            "action": mt5.TRADE_ACTION_DEAL, "symbol": self.symbol, "position": int(pos.id),
            "volume": round(pos.units / self.contract, 2),
            "type": mt5.ORDER_TYPE_SELL if pos.side == "buy" else mt5.ORDER_TYPE_BUY,
            "price": bid if pos.side == "buy" else ask, "deviation": 30,
            "magic": self.magic, "comment": "goldbot close", "type_time": mt5.ORDER_TIME_GTC,
        })
