"""Where 1-minute bars come from: CSV files, Alpaca's market-data API, yfinance, or a synthetic market."""

from __future__ import annotations

import json
import math
import os
import random
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta

from .bars import ET, RTH_OPEN, Bar, in_rth, is_trading_day

ALPACA_DATA = "https://data.alpaca.markets"


def alpaca_keys() -> tuple[str, str]:
    k, s = os.environ.get("ALPACA_API_KEY_ID", ""), os.environ.get("ALPACA_API_SECRET_KEY", "")
    if not (k and s):
        raise SystemExit("set ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY (paper keys are fine)")
    return k, s


def http_json(method: str, url: str, headers: dict, body: dict | None = None, timeout: float = 10.0):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={**headers, "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {url.split('?')[0]}: {e.code} {e.read()[:300].decode(errors='replace')}") from None


def alpaca_bars(symbol: str, start: datetime, end: datetime, feed: str | None = None) -> list[Bar]:
    """Historical 1-minute bars, regular hours only. feed: 'iex' (free) or 'sip' (paid); env ALPACA_DATA_FEED."""
    key, sec = alpaca_keys()
    feed = feed or os.environ.get("ALPACA_DATA_FEED", "iex")
    out, token = [], None
    while True:
        q = {"timeframe": "1Min", "start": start.isoformat(), "end": end.isoformat(), "limit": 10000,
             "adjustment": "raw", "feed": feed}
        if token:
            q["page_token"] = token
        url = f"{ALPACA_DATA}/v2/stocks/{symbol}/bars?{urllib.parse.urlencode(q)}"
        r = http_json("GET", url, {"APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": sec})
        for b in r.get("bars") or []:
            ts = datetime.fromisoformat(b["t"].replace("Z", "+00:00")).astimezone(ET)
            if in_rth(ts):
                out.append(Bar(ts, b["o"], b["h"], b["l"], b["c"], b["v"]))
        token = r.get("next_page_token")
        if not token:
            return out


def yfinance_bars(symbol: str, period: str = "7d") -> list[Bar]:
    """Last few days of 1-minute bars from Yahoo (yfinance caps 1m history at ~7-30 days)."""
    try:
        import yfinance as yf
    except ImportError:
        raise SystemExit("pip install yfinance (or use --csv / --source alpaca)") from None
    df = yf.Ticker(symbol).history(period=period, interval="1m", prepost=False, auto_adjust=False)
    out = []
    for ts, r in df.iterrows():
        ts = ts.to_pydatetime().astimezone(ET)
        if in_rth(ts):
            out.append(Bar(ts, float(r.Open), float(r.High), float(r.Low), float(r.Close), float(r.Volume)))
    return out


class SyntheticMarket:
    """Random-walk 1-minute bars with intraday trend regimes. For demos and tests, not for judging the strategy."""

    START = {"QQQ": 600.0, "SPY": 665.0, "IWM": 240.0}

    def __init__(self, symbols: list[str], seed: int = 7, daily_vol: float = 0.011):
        self.rng = random.Random(seed)
        self.symbols = symbols
        self.px = {s: self.START.get(s, 100.0) for s in symbols}
        self.minute_vol = daily_vol / math.sqrt(390)

    def day(self, d: date) -> dict[str, list[Bar]]:
        out = {s: [] for s in self.symbols}
        common = [0.0] * 390  # shared market factor so the ETFs move together
        drift = 0.0
        for i in range(390):
            if i % 45 == 0:
                drift = self.rng.gauss(0, 0.35) * self.minute_vol  # a new trend regime every ~45 min
            common[i] = drift + self.rng.gauss(0, self.minute_vol)
        for s in self.symbols:
            beta = {"QQQ": 1.2, "SPY": 1.0, "IWM": 1.3}.get(s, 1.0)
            px = self.px[s] * math.exp(self.rng.gauss(0, 0.004))  # overnight gap
            for i in range(390):
                r = beta * common[i] + self.rng.gauss(0, self.minute_vol * 0.5)
                o = px
                c = o * math.exp(r)
                wick = abs(self.rng.gauss(0, self.minute_vol * 0.6)) * o
                h, lo = max(o, c) + wick, min(o, c) - wick * self.rng.random()
                u_shape = 1 + 2.5 * ((i - 195) / 195) ** 2
                v = max(1000.0, self.rng.gauss(60000, 15000) * u_shape)
                ts = datetime.combine(d, RTH_OPEN, ET) + timedelta(minutes=i)
                out[s].append(Bar(ts, round(o, 2), round(h, 2), round(lo, 2), round(c, 2), round(v)))
                px = c
            self.px[s] = px
        return out

    def days(self, n: int, end: date | None = None) -> dict[str, list[Bar]]:
        d = end or date.today()
        ds = []
        while len(ds) < n:
            if is_trading_day(d):
                ds.append(d)
            d -= timedelta(days=1)
        out = {s: [] for s in self.symbols}
        for d in reversed(ds):
            for s, bars in self.day(d).items():
                out[s].extend(bars)
        return out
