"""LLM usage and model information, shared by the AI routes and the system health page.

Key material never leaves the server: ``AIModelInfo.api_key_hint`` is the fixed mask
``API_KEY_MASK`` when a key is configured and None otherwise.
"""

from __future__ import annotations

from ..ai.pricing import DEFAULT_MODEL, MODEL_OPTIONS
from ..analytics.ai_metrics import build_usage_stats
from ..schemas import HEURISTIC_MODEL_ID, AIModelInfo, AIModelOption, AIProvider, AIUsageStats, EngineStatus
from . import queries
from .context import ApiContext

API_KEY_MASK = "••••••••••••••••"


def openrouter_configured(ctx: ApiContext, engine: EngineStatus | None) -> bool:
    """What the engine reports (it is the process that calls OpenRouter), else our own env."""
    return engine.openrouter_configured if engine is not None else ctx.config.openrouter_configured


def usage_stats(ctx: ApiContext, engine: EngineStatus | None = None) -> AIUsageStats:
    engine = engine if engine is not None else queries.engine_status(ctx.db)
    configured = openrouter_configured(ctx, engine)
    model = queries.stored_settings(ctx.db).ai.model if configured else HEURISTIC_MODEL_ID
    provider = "openrouter" if configured else "heuristic"
    return ctx.stats.get(
        ("ai_usage", provider, model),
        lambda: build_usage_stats(ctx.db, provider=provider, model=model, configured=configured),
    )


def model_options(current_model: str) -> list[AIModelOption]:
    """The curated OpenRouter models, plus the configured one if it is a custom choice."""
    options = [AIModelOption.model_validate(o, from_attributes=True) for o in MODEL_OPTIONS]
    if not any(o.recommended for o in options):
        options = [o.model_copy(update={"recommended": o.id == DEFAULT_MODEL}) for o in options]
    if current_model and all(o.id != current_model for o in options):
        options.append(AIModelOption(id=current_model, name=current_model))
    return options


def _active_provider(engine: EngineStatus | None, configured: bool) -> AIProvider:
    """Who answered the latest analysis, or who would answer the next one."""
    if engine is not None:
        return engine.ai_provider
    return "openrouter" if configured else "heuristic"


def model_info(ctx: ApiContext) -> AIModelInfo:
    engine = queries.engine_status(ctx.db)
    configured = openrouter_configured(ctx, engine)
    current_model = queries.stored_settings(ctx.db).ai.model
    return AIModelInfo(
        configured=configured,
        api_key_hint=API_KEY_MASK if configured else None,
        current_model=current_model,
        active_provider=_active_provider(engine, configured),
        options=model_options(current_model),
        usage=usage_stats(ctx, engine),
    )
