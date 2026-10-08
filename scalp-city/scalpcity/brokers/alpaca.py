"""Alpaca PAPER options broker. The trading URL is hard-coded to paper: this code never touches a live account.

Needs an Alpaca paper account with options trading enabled (level 2+ to buy calls/puts).
"""

from __future__ import annotations

import time
import urllib.parse
from datetime import datetime

from ..feeds import ALPACA_DATA, alpaca_keys, http_json
from ..options import Contract
from ..strategy import CALL
from .base import Fill

PAPER_API = "https://paper-api.alpaca.markets"


class AlpacaPaperBroker:
    def __init__(self, fee_per_contract: float = 0.0, fill_timeout: float = 20.0):
        key, sec = alpaca_keys()
        self.h = {"APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": sec}
        self.fee = fee_per_contract  # Alpaca charges no commission on options; regulatory fees are tiny
        self.fill_timeout = fill_timeout
        self._resolved: dict[Contract, Contract] = {}

    def _api(self, method: str, path: str, body: dict | None = None):
        return http_json(method, PAPER_API + path, self.h, body)

    def resolve(self, wanted: Contract, now: datetime) -> Contract:
        """Find the listed contract with that expiry and type whose strike is closest to the one wanted."""
        if wanted in self._resolved:
            return self._resolved[wanted]
        q = urllib.parse.urlencode({
            "underlying_symbols": wanted.underlying, "expiration_date": wanted.expiry.isoformat(),
            "type": "call" if wanted.right == CALL else "put",
            "strike_price_gte": wanted.strike - 10, "strike_price_lte": wanted.strike + 10, "limit": 200,
        })
        r = self._api("GET", f"/v2/options/contracts?{q}")
        listed = [c for c in r.get("option_contracts") or [] if c.get("tradable", True)]
        if not listed:
            raise RuntimeError(f"no listed {wanted.underlying} {wanted.right}s expiring {wanted.expiry}")
        best = min(listed, key=lambda c: abs(float(c["strike_price"]) - wanted.strike))
        got = Contract(wanted.underlying, wanted.expiry, wanted.right, float(best["strike_price"]))
        if got.occ != best["symbol"]:
            raise RuntimeError(f"OCC mismatch {got.occ} vs {best['symbol']}")
        self._resolved[wanted] = got
        return got

    def _quote(self, c: Contract) -> tuple[float, float]:
        q = urllib.parse.urlencode({"symbols": c.occ, "feed": "indicative"})
        r = http_json("GET", f"{ALPACA_DATA}/v1beta1/options/quotes/latest?{q}", self.h)
        qt = (r.get("quotes") or {}).get(c.occ) or {}
        return float(qt.get("bp") or 0), float(qt.get("ap") or 0)

    def mark(self, c: Contract, spot: float, now: datetime) -> float:
        return self._quote(c)[0]

    def ask(self, c: Contract, spot: float, now: datetime) -> float:
        return self._quote(c)[1]

    def _order(self, c: Contract, qty: int, side: str) -> Fill:
        o = self._api("POST", "/v2/orders", {
            "symbol": c.occ, "qty": str(qty), "side": side, "type": "market", "time_in_force": "day",
        })
        deadline = time.time() + self.fill_timeout
        while time.time() < deadline:
            o = self._api("GET", f"/v2/orders/{o['id']}")
            if o["status"] == "filled":
                ts = datetime.fromisoformat(o["filled_at"].replace("Z", "+00:00"))
                return Fill(c, int(float(o["filled_qty"])), float(o["filled_avg_price"]), ts, self.fee * qty, o["id"])
            if o["status"] in ("canceled", "expired", "rejected"):
                raise RuntimeError(f"order {side} {c.occ} {o['status']}")
            time.sleep(0.5)
        self._api("DELETE", f"/v2/orders/{o['id']}")
        raise RuntimeError(f"order {side} {c.occ} not filled in {self.fill_timeout}s, canceled")

    def buy(self, c: Contract, qty: int, spot: float, now: datetime) -> Fill:
        return self._order(c, qty, "buy")

    def sell(self, c: Contract, qty: int, spot: float, now: datetime) -> Fill:
        return self._order(c, qty, "sell")
