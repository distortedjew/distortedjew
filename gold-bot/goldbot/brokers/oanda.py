"""OANDA v20 REST adapter. Free practice account: https://www.oanda.com (Demo account).

XAU_USD units are ounces. Stop-loss and take-profit are attached to the order on fill, so
they live on OANDA's servers and protect the trade even if this bot or the VPS goes down.
"""
from __future__ import annotations

import time

import pandas as pd
import requests

from ..config import Config
from ..risk import round_down
from .base import Broker, Position

HOSTS = {"practice": "https://api-fxpractice.oanda.com", "live": "https://api-fxtrade.oanda.com"}


class OandaBroker(Broker):
    name = "oanda"

    def __init__(self, cfg: Config):
        if not cfg.oanda_token or not cfg.oanda_account:
            raise ValueError("Set OANDA_TOKEN and OANDA_ACCOUNT_ID in .env")
        if cfg.oanda_env not in HOSTS:
            raise ValueError("OANDA_ENV must be practice or live")
        self.base = HOSTS[cfg.oanda_env]
        self.account = cfg.oanda_account
        self.instrument = cfg.oanda_instrument
        self.s = requests.Session()
        self.s.headers.update({
            "Authorization": f"Bearer {cfg.oanda_token}",
            "Content-Type": "application/json",
            "Accept-Datetime-Format": "RFC3339",
        })

    def _req(self, method: str, path: str, **kw) -> dict:
        for attempt in range(4):
            try:
                r = self.s.request(method, self.base + path, timeout=20, **kw)
            except requests.RequestException:
                if attempt == 3:
                    raise
                time.sleep(2 ** attempt)
                continue
            if r.status_code in (429, 500, 502, 503, 504) and attempt < 3:
                time.sleep(2 ** attempt)
                continue
            if r.status_code >= 400:
                raise RuntimeError(f"OANDA {method} {path} -> {r.status_code}: {r.text[:500]}")
            return r.json()
        raise RuntimeError("unreachable")

    def candles(self, count: int) -> pd.DataFrame:
        data = self._req("GET", f"/v3/instruments/{self.instrument}/candles",
                         params={"granularity": "M15", "count": min(count + 1, 5000), "price": "M"})
        rows = [
            {"time": c["time"], "open": float(c["mid"]["o"]), "high": float(c["mid"]["h"]),
             "low": float(c["mid"]["l"]), "close": float(c["mid"]["c"])}
            for c in data["candles"] if c["complete"]
        ]
        df = pd.DataFrame(rows)
        df["time"] = pd.to_datetime(df["time"], utc=True)
        return df.tail(count).reset_index(drop=True)

    def equity(self) -> float:
        return float(self._req("GET", f"/v3/accounts/{self.account}/summary")["account"]["NAV"])

    def quote(self) -> tuple[float, float]:
        p = self._req("GET", f"/v3/accounts/{self.account}/pricing",
                      params={"instruments": self.instrument})["prices"][0]
        return float(p["bids"][0]["price"]), float(p["asks"][0]["price"])

    def position(self) -> Position | None:
        trades = self._req("GET", f"/v3/accounts/{self.account}/openTrades")["trades"]
        for t in trades:
            if t["instrument"] != self.instrument:
                continue
            u = float(t["currentUnits"])
            return Position(
                id=t["id"], side="buy" if u > 0 else "sell", units=abs(u), entry=float(t["price"]),
                sl=float(t["stopLossOrder"]["price"]) if t.get("stopLossOrder") else None,
                tp=float(t["takeProfitOrder"]["price"]) if t.get("takeProfitOrder") else None,
            )
        return None

    def min_units(self) -> float:
        return 1.0

    def normalize_units(self, units: float) -> float:
        u = round_down(units, 1.0)
        return u if u >= self.min_units() else 0.0

    def open(self, side: str, units: float, sl: float, tp: float) -> Position:
        signed = int(units) if side == "buy" else -int(units)
        body = {"order": {
            "type": "MARKET", "instrument": self.instrument, "units": str(signed),
            "timeInForce": "FOK", "positionFill": "DEFAULT",
            "stopLossOnFill": {"price": f"{sl:.2f}", "timeInForce": "GTC"},
            "takeProfitOnFill": {"price": f"{tp:.2f}", "timeInForce": "GTC"},
        }}
        res = self._req("POST", f"/v3/accounts/{self.account}/orders", json=body)
        if "orderFillTransaction" not in res:
            raise RuntimeError(f"order not filled: {res.get('orderCancelTransaction', res)}")
        pos = self.position()
        if pos is None:
            raise RuntimeError("order filled but no open trade found")
        return pos

    def set_sl(self, pos: Position, sl: float) -> None:
        self._req("PUT", f"/v3/accounts/{self.account}/trades/{pos.id}/orders",
                  json={"stopLoss": {"price": f"{sl:.2f}", "timeInForce": "GTC"}})

    def close(self, pos: Position) -> None:
        self._req("PUT", f"/v3/accounts/{self.account}/trades/{pos.id}/close", json={"units": "ALL"})

    def history(self, start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
        """Download M15 history between two UTC timestamps (for backtesting)."""
        frames, cursor = [], start
        while cursor < end:
            data = self._req("GET", f"/v3/instruments/{self.instrument}/candles", params={
                "granularity": "M15", "price": "M", "count": 5000,
                "from": cursor.strftime("%Y-%m-%dT%H:%M:%SZ")})
            rows = [{"time": c["time"], "open": float(c["mid"]["o"]), "high": float(c["mid"]["h"]),
                     "low": float(c["mid"]["l"]), "close": float(c["mid"]["c"])}
                    for c in data["candles"] if c["complete"]]
            if not rows:
                break
            df = pd.DataFrame(rows)
            df["time"] = pd.to_datetime(df["time"], utc=True)
            frames.append(df)
            nxt = df["time"].iloc[-1] + pd.Timedelta(minutes=15)
            if nxt <= cursor:
                break
            cursor = nxt
        if not frames:
            return pd.DataFrame(columns=["time", "open", "high", "low", "close"])
        out = pd.concat(frames).drop_duplicates("time")
        return out[out["time"] < end].reset_index(drop=True)
