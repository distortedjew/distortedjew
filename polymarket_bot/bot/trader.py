"""Polymarket CLOB API wrapper for order placement and account management."""

import logging
from typing import Optional

logger = logging.getLogger(__name__)

try:
    from py_clob_client.client import ClobClient
    from py_clob_client.clob_types import ApiCreds, OrderArgs, OrderType
    from py_clob_client.order_builder.constants import BUY
    _HAS_CLOB = True
except ImportError:
    _HAS_CLOB = False
    logger.warning("py-clob-client not installed — order placement disabled")


class PolymarketTrader:
    def __init__(self, config) -> None:
        self.config = config
        self._client: Optional["ClobClient"] = None
        if _HAS_CLOB:
            self._init_client()

    def _init_client(self) -> None:
        try:
            self._client = ClobClient(
                host=self.config.clob_url,
                key=self.config.private_key,
                chain_id=self.config.chain_id,
            )
            if self.config.api_key:
                creds = ApiCreds(
                    api_key=self.config.api_key,
                    api_secret=self.config.api_secret,
                    api_passphrase=self.config.api_passphrase,
                )
            else:
                creds = self._client.create_or_derive_api_creds()
            self._client.set_api_creds(creds)
            logger.info("Polymarket CLOB client initialized")
        except Exception as exc:
            logger.error("Failed to initialize CLOB client: %s", exc)
            self._client = None

    # ── market data ────────────────────────────────────────────────────────────

    def get_midpoint(self, token_id: str) -> tuple[float, float, float]:
        """
        Return (best_bid, best_ask, mid) for a YES token.
        Falls back to (0, 1, 0.5) on failure.
        """
        if not self._client:
            return 0.0, 1.0, 0.5
        try:
            book = self._client.get_order_book(token_id)
            bids = book.bids if hasattr(book, "bids") else (book.get("bids") or [])
            asks = book.asks if hasattr(book, "asks") else (book.get("asks") or [])
            best_bid = float(bids[0].price if hasattr(bids[0], "price") else bids[0]["price"]) if bids else 0.0
            best_ask = float(asks[0].price if hasattr(asks[0], "price") else asks[0]["price"]) if asks else 1.0
            return best_bid, best_ask, (best_bid + best_ask) / 2
        except Exception as exc:
            logger.debug("Order book fetch failed for %s: %s", token_id, exc)
            return 0.0, 1.0, 0.5

    def get_balance(self) -> float:
        if not self._client:
            return 0.0
        try:
            bal = self._client.get_balance()
            return float(bal) if bal is not None else 0.0
        except Exception as exc:
            logger.warning("Balance fetch failed: %s", exc)
            return 0.0

    # ── order placement ────────────────────────────────────────────────────────

    def buy(self, token_id: str, price: float, usdc_size: float, label: str = "") -> bool:
        """
        Place a GTC limit buy order.
        `price` is the YES probability (0–1).
        `usdc_size` is how many USDC to spend.
        Returns True if the order was accepted (or dry-run).
        """
        shares = round(usdc_size / price, 2)
        price_rounded = round(price, 4)

        if self.config.dry_run:
            logger.info(
                "[DRY RUN] Would BUY %.2f shares of %s at %.4f (≈$%.2f) %s",
                shares, token_id[:16], price_rounded, usdc_size, label,
            )
            return True

        if not self._client:
            logger.error("CLOB client unavailable — cannot place order")
            return False

        try:
            order_args = OrderArgs(
                price=price_rounded,
                size=shares,
                side=BUY,
                token_id=token_id,
            )
            signed = self._client.create_order(order_args)
            resp = self._client.post_order(signed, OrderType.GTC)
            logger.info("Order placed for %s: %s", label or token_id[:16], resp)
            return True
        except Exception as exc:
            logger.error("Order failed for %s: %s", label or token_id[:16], exc)
            return False
