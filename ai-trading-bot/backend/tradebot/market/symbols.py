"""Symbol naming, exchange mapping, price precision and display formatting.

Everything outside the exchange adapters uses the slash form ``BTC/USDT``; Binance uses
``BTCUSDT``. Formatting helpers produce the short human strings used in event titles,
notification messages, risk-check display values and analyst reasons.
"""

from __future__ import annotations

import math

# Longest first so "FDUSD" wins over "USD"-like suffixes.
KNOWN_QUOTES: tuple[str, ...] = ("FDUSD", "USDT", "USDC", "TUSD", "BUSD", "EUR", "TRY", "BTC", "ETH", "BNB")


def normalize(symbol: str) -> str:
    """``btc/usdt``, ``BTC-USDT``, ``BTC_USDT`` and ``BTCUSDT`` all become ``BTC/USDT``."""
    s = symbol.strip().upper().replace("-", "/").replace("_", "/")
    if "/" in s:
        base, _, quote = s.partition("/")
        return f"{base}/{quote}"
    return from_exchange(s)


def to_exchange(symbol: str) -> str:
    """``BTC/USDT`` → ``BTCUSDT`` (Binance spot naming)."""
    return normalize(symbol).replace("/", "")


def from_exchange(exchange_symbol: str) -> str:
    """``BTCUSDT`` → ``BTC/USDT``; unknown quote suffixes are left unsplit."""
    s = exchange_symbol.strip().upper()
    for quote in KNOWN_QUOTES:
        if s.endswith(quote) and len(s) > len(quote):
            return f"{s[: -len(quote)]}/{quote}"
    return s


def base_asset(symbol: str) -> str:
    return normalize(symbol).partition("/")[0]


def quote_asset(symbol: str) -> str:
    return normalize(symbol).partition("/")[2] or "USDT"


def tick_size(price: float) -> float:
    """Exchange-like price increment: 0.01 above $10, four significant decimals below."""
    if not math.isfinite(price) or price <= 0:
        return 1e-8
    if price >= 10:
        return 0.01
    return 10.0 ** (math.floor(math.log10(price)) - 4)


def round_to_tick(price: float, tick: float) -> float:
    decimals = max(0, -int(math.floor(math.log10(tick)))) if tick < 1 else 0
    return round(round(price / tick) * tick, decimals)


def qty_decimals(price: float) -> int:
    """Quantity precision for an asset at ``price`` (one step is worth at most ~$1)."""
    if price >= 10_000:
        return 5
    if price >= 100:
        return 4
    if price >= 1:
        return 2
    return 0


# --------------------------------------------------------------------------
# Display formatting (event titles, notification messages, reasons, checks)
# --------------------------------------------------------------------------


def _price_decimals(value: float, compact: bool) -> int:
    a = abs(value)
    if a >= 1000:
        return 0 if compact else 2
    if a >= 1:
        return 2
    if a == 0:
        return 2
    return min(8, max(4, 3 - int(math.floor(math.log10(a)))))


def fmt_price(value: float | None, *, compact: bool = False) -> str:
    """``$97,412.50``; ``compact`` drops the cents above $1,000 (``$96,240``) for levels."""
    if value is None or not math.isfinite(value):
        return "—"
    return f"${value:,.{_price_decimals(value, compact)}f}"


def fmt_usd(value: float | None, *, signed: bool = False) -> str:
    """Money in USDT: ``$4,101.20``; ``signed`` gives ``+$45.20`` / ``-$101.32``."""
    if value is None or not math.isfinite(value):
        return "—"
    sign = "-" if value < 0 else ("+" if signed and value > 0 else "")
    return f"{sign}${abs(value):,.2f}"


def fmt_pct(value: float | None, *, signed: bool = False, decimals: int = 2) -> str:
    """Percent units in, ``1.04%`` out (``+1.04%`` when signed)."""
    if value is None or not math.isfinite(value):
        return "—"
    sign = "-" if value < 0 else ("+" if signed and value > 0 else "")
    return f"{sign}{abs(value):.{decimals}f}%"


def fmt_qty(qty: float, symbol: str, price: float | None = None) -> str:
    """``0.0421 BTC`` with precision suited to the asset's price."""
    decimals = qty_decimals(price) if price else 4
    text = f"{qty:,.{decimals}f}"
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return f"{text} {base_asset(symbol)}"


def fmt_num(value: float | None, decimals: int = 2) -> str:
    if value is None or not math.isfinite(value):
        return "—"
    return f"{value:,.{decimals}f}"
