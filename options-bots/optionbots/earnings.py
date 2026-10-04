"""Optional earnings-date lookup (Alpha Vantage), cached once a day in the store."""
from __future__ import annotations

import csv
import io
import logging
from datetime import date

import requests

log = logging.getLogger(__name__)


def next_earnings(symbol: str, api_key: str, store, bot: str) -> date | None:
    if not api_key:
        return None
    cache = store.get(bot, "earnings_cache")
    if cache and cache.get("fetched") == date.today().isoformat():
        return date.fromisoformat(cache["date"]) if cache.get("date") else None
    try:
        r = requests.get("https://www.alphavantage.co/query", timeout=20, params={
            "function": "EARNINGS_CALENDAR", "symbol": symbol, "horizon": "3month", "apikey": api_key})
        rows = list(csv.DictReader(io.StringIO(r.text)))
        dates = sorted(date.fromisoformat(x["reportDate"]) for x in rows if x.get("reportDate"))
        nxt = next((d for d in dates if d >= date.today()), None)
    except Exception as e:  # network or format problem: don't block trading on it, just log
        log.warning("earnings lookup for %s failed: %s", symbol, e)
        return None
    store.put(bot, "earnings_cache", {"fetched": date.today().isoformat(), "date": nxt.isoformat() if nxt else None})
    return nxt
