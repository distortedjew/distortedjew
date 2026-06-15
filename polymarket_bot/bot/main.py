"""Main bot loop — scans Polymarket weather markets and trades edges."""

import logging
import time
from datetime import date

from .config import Config
from .markets import WeatherMarket, fetch_weather_markets
from .strategy import estimate_probability, kelly_size
from .trader import PolymarketTrader
from .weather import DailyForecast, Location, geocode, get_forecast

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


# Simple in-process cache to avoid hammering the geocoding API.
_geo_cache: dict[str, Location | None] = {}
_forecast_cache: dict[tuple[str, date], DailyForecast | None] = {}


def _get_location(city: str) -> Location | None:
    if city not in _geo_cache:
        _geo_cache[city] = geocode(city)
    return _geo_cache[city]


def _get_forecast(location: Location, target: date) -> DailyForecast | None:
    key = (location.name, target)
    if key not in _forecast_cache:
        _forecast_cache[key] = get_forecast(location, target)
    return _forecast_cache[key]


def evaluate_market(
    market: WeatherMarket,
    trader: PolymarketTrader,
    config: Config,
    bankroll: float,
) -> None:
    """Evaluate one market and place a trade if there is sufficient edge."""
    if not market.city or not market.condition_type or not market.target_date:
        return

    today = date.today()
    if market.target_date < today:
        return  # already resolved

    location = _get_location(market.city)
    if not location:
        logger.debug("Skipping — could not geocode '%s'", market.city)
        return

    forecast = _get_forecast(location, market.target_date)
    if not forecast:
        logger.debug("Skipping — no forecast for %s on %s", market.city, market.target_date)
        return

    our_prob = estimate_probability(market, forecast)
    if our_prob is None:
        return

    best_bid, best_ask, mid = trader.get_midpoint(market.yes_token_id)
    spread = best_ask - best_bid

    if spread > config.max_spread:
        logger.debug("Skipping %s — spread %.3f too wide", market.question[:50], spread)
        return

    if market.volume < config.min_liquidity:
        logger.debug("Skipping %s — low volume $%.0f", market.question[:50], market.volume)
        return

    edge_yes = our_prob - mid
    edge_no = (1.0 - our_prob) - (1.0 - mid)

    logger.info(
        "%-65s | our=%.3f mkt=%.3f edge_YES=%+.3f edge_NO=%+.3f",
        market.question[:65],
        our_prob, mid, edge_yes, edge_no,
    )

    if edge_yes >= config.min_edge:
        size = kelly_size(our_prob, mid, bankroll, config.kelly_fraction, config.max_trade_usdc)
        if size >= 1.0:
            label = f"YES {market.city} {market.condition_type}"
            trader.buy(market.yes_token_id, best_ask, size, label=label)

    elif edge_no >= config.min_edge:
        # Buy NO at its ask price (= 1 - best_bid of YES)
        no_price = 1.0 - best_bid
        size = kelly_size(1.0 - our_prob, 1.0 - mid, bankroll, config.kelly_fraction, config.max_trade_usdc)
        if size >= 1.0:
            label = f"NO  {market.city} {market.condition_type}"
            trader.buy(market.no_token_id, no_price, size, label=label)


def run_cycle(config: Config, trader: PolymarketTrader) -> None:
    logger.info("─── Starting trading cycle ───")
    bankroll = trader.get_balance()
    logger.info("Balance: $%.2f USDC", bankroll)

    if bankroll < 1.0 and not config.dry_run:
        logger.warning("Insufficient balance — skipping cycle")
        return

    if config.dry_run:
        bankroll = max(bankroll, config.max_trade_usdc * 4)  # virtual bankroll for sizing

    markets = fetch_weather_markets(config.gamma_url)
    if not markets:
        logger.warning("No weather markets found")
        return

    for market in markets:
        try:
            evaluate_market(market, trader, config, bankroll)
        except Exception as exc:
            logger.exception("Unhandled error evaluating market: %s", exc)

    logger.info("─── Cycle complete ───")


def main() -> None:
    config = Config.from_env()

    logger.info("Polymarket Weather Bot starting up")
    logger.info("DRY_RUN=%s  MIN_EDGE=%.2f  MAX_TRADE=$%.0f  INTERVAL=%ds",
                config.dry_run, config.min_edge, config.max_trade_usdc, config.poll_interval_seconds)

    trader = PolymarketTrader(config)

    while True:
        try:
            run_cycle(config, trader)
        except KeyboardInterrupt:
            logger.info("Shutting down")
            break
        except Exception as exc:
            logger.error("Cycle error: %s", exc, exc_info=True)

        logger.info("Sleeping %ds…", config.poll_interval_seconds)
        try:
            time.sleep(config.poll_interval_seconds)
        except KeyboardInterrupt:
            logger.info("Shutting down")
            break


if __name__ == "__main__":
    main()
