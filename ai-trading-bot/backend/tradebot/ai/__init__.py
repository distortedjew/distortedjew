"""Analysts: the OpenRouter LLM, the local heuristic, prompts and model pricing."""

from __future__ import annotations

from ..config import EnvConfig
from ..schemas import AISettings
from .base import Analyst, AnalystResult, MarketContext, RecentPerformance, UsageRecord
from .heuristic import HeuristicAnalyst
from .openrouter import OpenRouterAnalyst, OpenRouterClient


def build_analyst(cfg: EnvConfig, ai: AISettings) -> Analyst:
    """OpenRouter when an API key is configured, else the heuristic."""
    if cfg.openrouter_configured and cfg.openrouter_api_key is not None:
        client = OpenRouterClient(
            cfg.openrouter_api_key.get_secret_value(),
            base_url=cfg.openrouter_base_url,
            app_url=cfg.openrouter_app_url,
            app_name=cfg.openrouter_app_name,
        )
        return OpenRouterAnalyst(client, ai, HeuristicAnalyst())
    return HeuristicAnalyst()


__all__ = [
    "Analyst",
    "AnalystResult",
    "HeuristicAnalyst",
    "MarketContext",
    "OpenRouterAnalyst",
    "OpenRouterClient",
    "RecentPerformance",
    "UsageRecord",
    "build_analyst",
]
