"""Fetch and parse Polymarket weather markets via the Gamma API."""

import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ── date patterns ──────────────────────────────────────────────────────────────
_MONTH_NAMES = (
    "January|February|March|April|May|June|"
    "July|August|September|October|November|December"
)
_DATE_RE = re.compile(
    rf"({_MONTH_NAMES})\s+(\d{{1,2}})(?:,?\s+(\d{{4}}))?",
    re.IGNORECASE,
)
_MONTH_MAP = {m.lower(): i + 1 for i, m in enumerate(
    ["january","february","march","april","may","june",
     "july","august","september","october","november","december"]
)}

# ── market condition patterns ──────────────────────────────────────────────────
_TEMP_HIGH_RE = re.compile(
    r"(?:high(?:est)?|max(?:imum)?)\s+temp(?:erature)?"
    r"(?:\s+in\s+|\s+at\s+|\s+for\s+)(.+?)"
    r"(?:\s+exceed|\s+reach|\s+go\s+above|\s+be\s+above|\s+top)\s+(\d+)°?F",
    re.IGNORECASE,
)
_TEMP_LOW_RE = re.compile(
    r"(?:low(?:est)?|min(?:imum)?)\s+temp(?:erature)?"
    r"(?:\s+in\s+|\s+at\s+|\s+for\s+)(.+?)"
    r"(?:\s+fall\s+below|\s+drop\s+below|\s+be\s+below|\s+go\s+below)\s+(\d+)°?F",
    re.IGNORECASE,
)
# "Will it rain in New York City on June 15?"
_RAIN_RE = re.compile(
    r"(?:rain|rainfall|precipitation)"
    r"(?:\s+in\s+|\s+at\s+|\s+for\s+)(.+?)(?:\s+on\s+|\s*\?)",
    re.IGNORECASE,
)
_SNOW_RE = re.compile(
    r"(?:snow(?:fall)?)"
    r"(?:\s+in\s+|\s+at\s+|\s+for\s+)(.+?)(?:\s+on\s+|\s*\?)",
    re.IGNORECASE,
)
# "Will the temperature in Phoenix exceed 110°F on July 4?"
_TEMP_GENERIC_RE = re.compile(
    r"temp(?:erature)?"
    r"(?:\s+in\s+|\s+at\s+|\s+for\s+)(.+?)"
    r"(?:\s+exceed|\s+reach|\s+go\s+above|\s+be\s+above|\s+surpass)\s+(\d+)°?F",
    re.IGNORECASE,
)


@dataclass
class WeatherMarket:
    condition_id: str
    question: str
    yes_token_id: str
    no_token_id: str
    end_date: datetime

    city: Optional[str] = None
    condition_type: Optional[str] = None   # "temp_high" | "temp_low" | "rain" | "snow"
    threshold_f: Optional[float] = None
    target_date: Optional[date] = None

    yes_price: float = 0.5
    volume: float = 0.0


def _parse_date(text: str) -> Optional[date]:
    m = _DATE_RE.search(text)
    if not m:
        return None
    month = _MONTH_MAP[m.group(1).lower()]
    day = int(m.group(2))
    year = int(m.group(3)) if m.group(3) else datetime.utcnow().year
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _strip_city(raw: str) -> str:
    """Remove trailing date fragments and punctuation from a city string."""
    raw = re.sub(r"\s+on\s+.*$", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\s+(January|February|March|April|May|June|July|August|"
                 r"September|October|November|December).*$", "", raw, flags=re.IGNORECASE)
    return raw.strip().strip("?,.")


def _parse_question(question: str) -> tuple[Optional[str], Optional[str], Optional[float]]:
    """Returns (city, condition_type, threshold_f)."""
    for pattern, ctype in [
        (_TEMP_HIGH_RE, "temp_high"),
        (_TEMP_GENERIC_RE, "temp_high"),
        (_TEMP_LOW_RE, "temp_low"),
    ]:
        m = pattern.search(question)
        if m:
            return _strip_city(m.group(1)), ctype, float(m.group(2))

    m = _RAIN_RE.search(question)
    if m:
        return _strip_city(m.group(1)), "rain", None

    m = _SNOW_RE.search(question)
    if m:
        return _strip_city(m.group(1)), "snow", None

    return None, None, None


def parse_market(raw: dict) -> Optional[WeatherMarket]:
    question = raw.get("question") or raw.get("title") or ""
    condition_id = raw.get("conditionId") or raw.get("condition_id") or ""
    if not condition_id or not question:
        return None

    token_ids: list = raw.get("clobTokenIds") or []
    if len(token_ids) < 2:
        return None

    end_str = raw.get("endDate") or raw.get("end_date") or ""
    try:
        end_dt = datetime.fromisoformat(end_str.replace("Z", "+00:00"))
    except Exception:
        end_dt = datetime.utcnow()

    city, ctype, threshold = _parse_question(question)
    if not city or not ctype:
        return None

    target = _parse_date(question)
    if not target:
        target = end_dt.date()

    outcome_prices = raw.get("outcomePrices") or ["0.5", "0.5"]
    try:
        yes_price = float(outcome_prices[0])
    except (ValueError, IndexError):
        yes_price = 0.5

    volume = 0.0
    try:
        volume = float(raw.get("volume") or raw.get("volumeNum") or 0)
    except (ValueError, TypeError):
        pass

    return WeatherMarket(
        condition_id=condition_id,
        question=question,
        yes_token_id=str(token_ids[0]),
        no_token_id=str(token_ids[1]),
        end_date=end_dt,
        city=city,
        condition_type=ctype,
        threshold_f=threshold,
        target_date=target,
        yes_price=yes_price,
        volume=volume,
    )


def fetch_weather_markets(gamma_url: str) -> list[WeatherMarket]:
    markets: list[WeatherMarket] = []
    try:
        resp = httpx.get(
            f"{gamma_url}/markets",
            params={
                "tag_slug": "weather",
                "active": "true",
                "closed": "false",
                "limit": 100,
            },
            timeout=15,
        )
        resp.raise_for_status()
        raw_list = resp.json()
        if isinstance(raw_list, dict):
            raw_list = raw_list.get("data") or raw_list.get("markets") or []
    except Exception as exc:
        logger.error("Failed to fetch weather markets: %s", exc)
        return markets

    for raw in raw_list:
        m = parse_market(raw)
        if m:
            markets.append(m)

    logger.info("Parsed %d/%d weather markets", len(markets), len(raw_list))
    return markets
