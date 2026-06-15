import logging
from dataclasses import dataclass
from datetime import date
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"


@dataclass
class Location:
    name: str
    lat: float
    lon: float
    country: str = ""


@dataclass
class DailyForecast:
    date: date
    max_temp_c: float
    min_temp_c: float
    precipitation_sum_mm: float
    precipitation_prob_pct: float  # 0–100

    @property
    def max_temp_f(self) -> float:
        return self.max_temp_c * 9 / 5 + 32

    @property
    def min_temp_f(self) -> float:
        return self.min_temp_c * 9 / 5 + 32


def geocode(city: str) -> Optional[Location]:
    try:
        resp = httpx.get(
            _GEOCODING_URL,
            params={"name": city, "count": 1, "language": "en", "format": "json"},
            timeout=10,
        )
        resp.raise_for_status()
        results = resp.json().get("results") or []
        if not results:
            logger.debug("No geocoding result for %s", city)
            return None
        r = results[0]
        return Location(
            name=r["name"],
            lat=r["latitude"],
            lon=r["longitude"],
            country=r.get("country_code", ""),
        )
    except Exception as exc:
        logger.warning("Geocoding failed for '%s': %s", city, exc)
        return None


def get_forecast(location: Location, target_date: date) -> Optional[DailyForecast]:
    try:
        params = {
            "latitude": location.lat,
            "longitude": location.lon,
            "daily": ",".join([
                "temperature_2m_max",
                "temperature_2m_min",
                "precipitation_sum",
                "precipitation_probability_max",
            ]),
            "temperature_unit": "celsius",
            "precipitation_unit": "mm",
            "timezone": "auto",
            "start_date": target_date.isoformat(),
            "end_date": target_date.isoformat(),
        }
        resp = httpx.get(_FORECAST_URL, params=params, timeout=10)
        resp.raise_for_status()
        daily = resp.json().get("daily") or {}
        if not daily.get("time"):
            return None
        return DailyForecast(
            date=date.fromisoformat(daily["time"][0]),
            max_temp_c=daily["temperature_2m_max"][0] or 0.0,
            min_temp_c=daily["temperature_2m_min"][0] or 0.0,
            precipitation_sum_mm=daily["precipitation_sum"][0] or 0.0,
            precipitation_prob_pct=daily["precipitation_probability_max"][0] or 0.0,
        )
    except Exception as exc:
        logger.warning("Forecast failed for %s: %s", location.name, exc)
        return None
