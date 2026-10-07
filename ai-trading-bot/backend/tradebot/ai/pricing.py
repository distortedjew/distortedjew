"""OpenRouter model suggestions and token pricing (for cost estimates).

``MODEL_OPTIONS`` is a short curated list of well-known OpenRouter model ids for the
settings page (the default first, marked recommended). Prices are USD per million tokens
at the providers' list rates. OpenRouter reports the exact cost of each request in
``usage.cost`` when asked (``usage: {include: true}``); ``estimate_cost`` is only the
fallback when a reply carries no cost. When OpenRouter is reachable the engine refreshes
prices from its ``/models`` endpoint (``refresh_live_prices``), cached for 12 hours.
"""

from __future__ import annotations

import logging
import time

import httpx

from ..schemas import AIModelOption

log = logging.getLogger(__name__)

DEFAULT_MODEL = "anthropic/claude-haiku-4.5"
LIVE_TTL_SEC = 12 * 3600

MODEL_OPTIONS: list[AIModelOption] = [
    AIModelOption(
        id=DEFAULT_MODEL,
        name="Claude Haiku 4.5",
        context_length=200_000,
        prompt_price_per_mtok=1.0,
        completion_price_per_mtok=5.0,
        recommended=True,
    ),
    AIModelOption(
        id="anthropic/claude-sonnet-4.5",
        name="Claude Sonnet 4.5",
        context_length=1_000_000,
        prompt_price_per_mtok=3.0,
        completion_price_per_mtok=15.0,
    ),
    AIModelOption(
        id="openai/gpt-5-mini",
        name="GPT-5 Mini",
        context_length=400_000,
        prompt_price_per_mtok=0.25,
        completion_price_per_mtok=2.0,
    ),
    AIModelOption(
        id="openai/gpt-4.1-mini",
        name="GPT-4.1 Mini",
        context_length=1_047_576,
        prompt_price_per_mtok=0.4,
        completion_price_per_mtok=1.6,
    ),
    AIModelOption(
        id="openai/gpt-4o-mini",
        name="GPT-4o Mini",
        context_length=128_000,
        prompt_price_per_mtok=0.15,
        completion_price_per_mtok=0.6,
    ),
    AIModelOption(
        id="google/gemini-2.5-flash",
        name="Gemini 2.5 Flash",
        context_length=1_048_576,
        prompt_price_per_mtok=0.3,
        completion_price_per_mtok=2.5,
    ),
    AIModelOption(
        id="google/gemini-2.5-pro",
        name="Gemini 2.5 Pro",
        context_length=1_048_576,
        prompt_price_per_mtok=1.25,
        completion_price_per_mtok=10.0,
    ),
]

_CURATED: dict[str, AIModelOption] = {m.id: m for m in MODEL_OPTIONS}
_live: dict[str, AIModelOption] = {}
_live_at: float = 0.0


def _price(model: str) -> AIModelOption | None:
    if _live and time.time() - _live_at < LIVE_TTL_SEC and model in _live:
        return _live[model]
    return _CURATED.get(model)


def estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float | None:
    """USD cost of one request from per-token prices; None for an unknown model."""
    option = _price(model)
    if option is None or option.prompt_price_per_mtok is None or option.completion_price_per_mtok is None:
        return None
    return (
        prompt_tokens * option.prompt_price_per_mtok + completion_tokens * option.completion_price_per_mtok
    ) / 1e6


def model_options() -> list[AIModelOption]:
    """The curated list, with live prices / context lengths when they have been fetched."""
    out: list[AIModelOption] = []
    for m in MODEL_OPTIONS:
        live = _live.get(m.id)
        if live is not None:
            out.append(
                m.model_copy(
                    update={
                        "context_length": live.context_length or m.context_length,
                        "prompt_price_per_mtok": live.prompt_price_per_mtok,
                        "completion_price_per_mtok": live.completion_price_per_mtok,
                    }
                )
            )
        else:
            out.append(m)
    return out


def parse_models(payload: dict) -> dict[str, AIModelOption]:
    """Parse OpenRouter ``GET /models`` (prices are USD per token, as strings)."""
    out: dict[str, AIModelOption] = {}
    for item in payload.get("data", []):
        try:
            pricing = item.get("pricing") or {}
            prompt = float(pricing.get("prompt", "nan")) * 1e6
            completion = float(pricing.get("completion", "nan")) * 1e6
            if not (prompt >= 0 and completion >= 0):
                continue
            out[str(item["id"])] = AIModelOption(
                id=str(item["id"]),
                name=str(item.get("name") or item["id"]),
                context_length=int(item["context_length"]) if item.get("context_length") else None,
                prompt_price_per_mtok=round(prompt, 6),
                completion_price_per_mtok=round(completion, 6),
            )
        except (KeyError, TypeError, ValueError):
            continue
    return out


async def refresh_live_prices(base_url: str, *, timeout: float = 8.0, force: bool = False) -> int:
    """Fetch ``/models`` (public, no key needed) into the price cache; returns models cached."""
    global _live, _live_at
    if not force and _live and time.time() - _live_at < LIVE_TTL_SEC:
        return len(_live)
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=min(timeout, 4.0))) as client:
            resp = await client.get(f"{base_url.rstrip('/')}/models")
        resp.raise_for_status()
        parsed = parse_models(resp.json())
    except (httpx.HTTPError, ValueError) as exc:
        log.info("OpenRouter model prices unavailable (%s); using the built-in table", type(exc).__name__)
        return 0
    if parsed:
        _live, _live_at = parsed, time.time()
    return len(parsed)
