"""Alpaca REST adapter (stocks data, options chain/quotes, multi-leg orders).

Paper trading by default. The live endpoint is only used when ALPACA_LIVE is set
to the exact confirmation phrase in config.LIVE_CONFIRMATION.
"""
from __future__ import annotations

import logging
import time
from datetime import date, datetime, timedelta
from typing import Protocol

import requests

from .models import Bar, Leg, OptionQuote, OrderResult, parse_occ

log = logging.getLogger(__name__)

PAPER_URL = "https://paper-api.alpaca.markets"
LIVE_URL = "https://api.alpaca.markets"
DATA_URL = "https://data.alpaca.markets"


class Broker(Protocol):
    def clock(self) -> dict: ...
    def account(self) -> dict: ...
    def daily_bars(self, symbol: str, days: int = 450) -> list[Bar]: ...
    def last_price(self, symbol: str) -> float: ...
    def option_chain(self, underlying: str, kind: str, exp_from: date, exp_to: date) -> list[OptionQuote]: ...
    def option_quotes(self, symbols: list[str]) -> dict[str, tuple[float, float]]: ...
    def positions(self) -> list[dict]: ...
    def submit(self, legs: list[Leg], qty: int, limit_price: float, client_order_id: str, closing: bool) -> str: ...
    def order(self, order_id: str) -> dict: ...
    def cancel(self, order_id: str) -> None: ...


class AlpacaBroker:
    def __init__(self, key_id: str, secret_key: str, live: bool = False):
        if not key_id or not secret_key:
            raise SystemExit("ALPACA_KEY_ID / ALPACA_SECRET_KEY are not set (see .env.example)")
        self.base = LIVE_URL if live else PAPER_URL
        self.s = requests.Session()
        self.s.headers.update({"APCA-API-KEY-ID": key_id, "APCA-API-SECRET-KEY": secret_key})

    # -- http ---------------------------------------------------------------
    def _req(self, method: str, url: str, **kw) -> dict | list | None:
        for attempt in range(4):
            try:
                r = self.s.request(method, url, timeout=20, **kw)
            except requests.RequestException as e:
                log.warning("alpaca %s %s failed (%s), retrying", method, url, e)
                time.sleep(2 ** attempt)
                continue
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(2 ** attempt)
                continue
            if r.status_code >= 400:
                raise RuntimeError(f"alpaca {method} {url} -> {r.status_code}: {r.text[:300]}")
            return r.json() if r.content else None
        raise RuntimeError(f"alpaca {method} {url}: gave up after retries")

    def _get(self, path: str, data: bool = False, **params):
        return self._req("GET", (DATA_URL if data else self.base) + path, params=params)

    # -- account / market ---------------------------------------------------
    def clock(self) -> dict:
        return self._get("/v2/clock")

    def account(self) -> dict:
        a = self._get("/v2/account")
        return {k: float(a.get(k) or 0) for k in ("equity", "last_equity", "buying_power", "cash", "options_buying_power")}

    def daily_bars(self, symbol: str, days: int = 450) -> list[Bar]:
        start = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%dT00:00:00Z")
        bars, token = [], None
        while True:
            params = {"timeframe": "1Day", "start": start, "limit": 10000, "adjustment": "all", "feed": "iex"}
            if token:
                params["page_token"] = token
            res = self._get(f"/v2/stocks/{symbol}/bars", data=True, **params)
            for b in res.get("bars") or []:
                bars.append(Bar(date.fromisoformat(b["t"][:10]), b["o"], b["h"], b["l"], b["c"], b["v"]))
            token = res.get("next_page_token")
            if not token:
                return bars

    def last_price(self, symbol: str) -> float:
        return float(self._get(f"/v2/stocks/{symbol}/trades/latest", data=True, feed="iex")["trade"]["p"])

    def option_chain(self, underlying: str, kind: str, exp_from: date, exp_to: date) -> list[OptionQuote]:
        out, token = [], None
        while True:
            params = {"feed": "indicative", "type": kind, "limit": 1000,
                      "expiration_date_gte": exp_from.isoformat(), "expiration_date_lte": exp_to.isoformat()}
            if token:
                params["page_token"] = token
            res = self._get(f"/v1beta1/options/snapshots/{underlying}", data=True, **params)
            for sym, snap in (res.get("snapshots") or {}).items():
                q = snap.get("latestQuote") or {}
                bid, ask = float(q.get("bp") or 0), float(q.get("ap") or 0)
                if bid <= 0 or ask <= 0:
                    continue
                _, exp, k, strike = parse_occ(sym)
                greeks = snap.get("greeks") or {}
                out.append(OptionQuote(sym, k, strike, exp, bid, ask, greeks.get("delta"), snap.get("impliedVolatility")))
            token = res.get("next_page_token")
            if not token:
                return out

    def option_quotes(self, symbols: list[str]) -> dict[str, tuple[float, float]]:
        if not symbols:
            return {}
        res = self._get("/v1beta1/options/quotes/latest", data=True, symbols=",".join(symbols), feed="indicative")
        return {s: (float(q.get("bp") or 0), float(q.get("ap") or 0)) for s, q in (res.get("quotes") or {}).items()}

    def positions(self) -> list[dict]:
        return [{
            "symbol": p["symbol"], "qty": float(p["qty"]), "asset_class": p.get("asset_class", ""),
            "avg_entry_price": float(p.get("avg_entry_price") or 0),
            "current_price": float(p.get("current_price") or 0),
            "unrealized_pl": float(p.get("unrealized_pl") or 0),
        } for p in self._get("/v2/positions")]

    # -- orders -------------------------------------------------------------
    def submit(self, legs: list[Leg], qty: int, limit_price: float, client_order_id: str, closing: bool) -> str:
        """limit_price is the net per unit: positive = debit (we pay), negative = credit (we receive)."""
        def intent(side: str) -> str:
            return f"{side}_to_{'close' if closing else 'open'}"

        if len(legs) == 1:
            leg = legs[0]
            body = {"symbol": leg.symbol, "qty": str(qty * leg.ratio), "side": leg.side, "type": "limit",
                    "limit_price": f"{abs(limit_price):.2f}", "time_in_force": "day",
                    "position_intent": intent(leg.side), "client_order_id": client_order_id}
        else:
            body = {"order_class": "mleg", "qty": str(qty), "type": "limit",
                    "limit_price": f"{limit_price:.2f}", "time_in_force": "day",
                    "client_order_id": client_order_id,
                    "legs": [{"symbol": l.symbol, "ratio_qty": str(l.ratio), "side": l.side,
                              "position_intent": intent(l.side)} for l in legs]}
        return self._req("POST", self.base + "/v2/orders", json=body)["id"]

    def order(self, order_id: str) -> dict:
        o = self._get(f"/v2/orders/{order_id}")
        return {"status": o["status"], "filled_qty": float(o.get("filled_qty") or 0),
                "filled_avg_price": float(o["filled_avg_price"]) if o.get("filled_avg_price") else None}

    def cancel(self, order_id: str) -> None:
        try:
            self._req("DELETE", f"{self.base}/v2/orders/{order_id}")
        except RuntimeError as e:      # already filled/cancelled
            log.info("cancel %s: %s", order_id, e)
