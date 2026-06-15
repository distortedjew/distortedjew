"""Probability estimation and position-sizing logic."""

import math
from typing import Optional

from .markets import WeatherMarket
from .weather import DailyForecast

# Assumed standard deviation of our temperature forecast vs. reality (°F).
# Open-Meteo day-ahead forecasts are typically within ±4–6 °F.
_TEMP_SIGMA_F = 5.0

# Rain: minimum precipitation considered "rain" (mm)
_RAIN_THRESHOLD_MM = 1.0


def _normal_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _prob_exceeds(forecast_value: float, threshold: float, sigma: float) -> float:
    """P(actual > threshold) given forecast_value and Gaussian uncertainty."""
    z = (threshold - forecast_value) / sigma
    return 1.0 - _normal_cdf(z)


def estimate_probability(market: WeatherMarket, forecast: DailyForecast) -> Optional[float]:
    """Return P(YES resolves) for a weather market given a forecast."""
    ctype = market.condition_type

    if ctype == "temp_high" and market.threshold_f is not None:
        return _prob_exceeds(forecast.max_temp_f, market.threshold_f, _TEMP_SIGMA_F)

    if ctype == "temp_low" and market.threshold_f is not None:
        # "Will low temp fall below X?" → YES if min_temp < X
        return 1.0 - _prob_exceeds(forecast.min_temp_f, market.threshold_f, _TEMP_SIGMA_F)

    if ctype == "rain":
        # Use the model's precipitation probability directly, but bias slightly
        # downward to account for the model's tendency to over-forecast rain.
        raw = forecast.precipitation_prob_pct / 100.0
        return max(0.01, min(0.99, raw * 0.92))

    if ctype == "snow":
        # Snow requires both precipitation and sub-freezing temps.
        precip_prob = forecast.precipitation_prob_pct / 100.0
        freeze_prob = _prob_exceeds(32.0, forecast.min_temp_f, _TEMP_SIGMA_F)
        return max(0.01, min(0.99, precip_prob * freeze_prob))

    return None


def kelly_size(
    our_prob: float,
    market_prob: float,
    bankroll: float,
    fraction: float,
    max_usdc: float,
) -> float:
    """
    Fractional Kelly criterion for a binary bet.
    Buying YES at price `market_prob` per share.
    Returns the USDC amount to spend (0 if no edge).
    """
    if our_prob <= market_prob or market_prob <= 0 or market_prob >= 1:
        return 0.0
    # Net odds: win (1/market_prob - 1) per dollar risked
    b = (1.0 - market_prob) / market_prob
    f_star = (our_prob * b - (1.0 - our_prob)) / b
    if f_star <= 0:
        return 0.0
    usdc = f_star * fraction * bankroll
    return min(usdc, max_usdc)
