"""Bot settings as the API serves and accepts them.

Read-only fields are owned by the server environment, never by a client:
``trading.paper_trading`` / ``trading.live_trading`` follow ``TRADING_MODE``, and
``notifications.*_configured`` say whether that channel's credentials are present.
``PUT /api/settings`` merges the fields the client sent onto the current settings
(fields it left out keep their values), normalizes symbols, checks the cross-field
rules below, and saves a new version only when something actually changed.

Validation on top of the model's own bounds: symbols are ``BASE/QUOTE``
(``^[A-Z0-9]{2,12}/[A-Z0-9]{2,8}$``, case-insensitive on input) and unique; the primary
symbol is one of them; model ids look like OpenRouter's ``provider/model``; fallback
models are unique and differ from the main model; ``email_to`` looks like an address.
"""

from __future__ import annotations

import re
from typing import Any

from fastapi.exceptions import RequestValidationError

from ..config import EnvConfig
from ..schemas import BotSettings, EngineStatus, SettingsResponse
from .validation import error_item, is_symbol, normalize_symbol

SECTIONS: tuple[str, ...] = ("trading", "risk", "execution", "ai", "notifications")
READ_ONLY_FIELDS = frozenset(
    {
        "trading.paper_trading",
        "trading.live_trading",
        "notifications.telegram_configured",
        "notifications.discord_configured",
        "notifications.email_configured",
    }
)
# The engine resubscribes its market feed and rebuilds per-symbol state on its own when
# these change, but positions already open on a removed symbol stay managed until they
# close; every other field applies on the engine's next settings check (~2 s).
_MODEL_ID = re.compile(r"^[A-Za-z0-9][\w.\-]*/[\w.\-:]+$")
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def with_server_fields(settings: BotSettings, config: EnvConfig) -> BotSettings:
    """Overwrite the read-only fields with what the server environment says."""
    live = config.trading_mode == "live"
    trading = settings.trading.model_copy(update={"paper_trading": not live, "live_trading": live})
    notifications = settings.notifications.model_copy(
        update={
            "telegram_configured": config.telegram_configured,
            "discord_configured": config.discord_configured,
            "email_configured": config.email_configured,
        }
    )
    return settings.model_copy(update={"trading": trading, "notifications": notifications})


def merge(current: BotSettings, update: BotSettings) -> BotSettings:
    """Apply the fields the client actually sent (``model_fields_set``) onto ``current``."""
    sections: dict[str, Any] = {}
    for name in SECTIONS:
        if name not in update.model_fields_set:
            continue
        sent = getattr(update, name)
        changes = {field: getattr(sent, field) for field in sent.model_fields_set}
        sections[name] = getattr(current, name).model_copy(update=changes)
    return current.model_copy(update=sections)


def normalize(settings: BotSettings) -> BotSettings:
    """Normalize free-form values and enforce the cross-field rules (422 on failure)."""
    errors: list[dict[str, Any]] = []
    trading, ai, notifications = settings.trading, settings.ai, settings.notifications

    symbols: list[str] = []
    for i, raw in enumerate(trading.symbols):
        symbol = normalize_symbol(raw)
        if not is_symbol(symbol):
            errors.append(
                error_item(
                    ("body", "trading", "symbols", i),
                    "Symbol must look like BASE/QUOTE, e.g. BTC/USDT",
                    raw,
                )
            )
        elif symbol in symbols:
            errors.append(error_item(("body", "trading", "symbols", i), f"Duplicate symbol {symbol}", raw))
        else:
            symbols.append(symbol)
    primary = normalize_symbol(trading.primary_symbol)
    if symbols and primary not in symbols:
        errors.append(
            error_item(
                ("body", "trading", "primary_symbol"),
                "Primary symbol must be one of the traded symbols",
                trading.primary_symbol,
            )
        )

    model = ai.model.strip()
    if not _MODEL_ID.fullmatch(model):
        errors.append(
            error_item(("body", "ai", "model"), "Model id must look like provider/model", ai.model)
        )
    fallbacks: list[str] = []
    for i, raw in enumerate(ai.fallback_models):
        candidate = raw.strip()
        if not _MODEL_ID.fullmatch(candidate):
            errors.append(
                error_item(
                    ("body", "ai", "fallback_models", i), "Model id must look like provider/model", raw
                )
            )
        elif candidate == model or candidate in fallbacks:
            errors.append(
                error_item(
                    ("body", "ai", "fallback_models", i),
                    "Fallback models must be unique and differ from the main model",
                    raw,
                )
            )
        else:
            fallbacks.append(candidate)

    email_to = (notifications.email_to or "").strip() or None
    if email_to is not None and not _EMAIL.fullmatch(email_to):
        errors.append(
            error_item(("body", "notifications", "email_to"), "Not a valid email address", notifications.email_to)
        )
    if errors:
        raise RequestValidationError(errors)

    return settings.model_copy(
        update={
            "trading": trading.model_copy(update={"symbols": symbols, "primary_symbol": primary}),
            "ai": ai.model_copy(update={"model": model, "fallback_models": fallbacks}),
            "notifications": notifications.model_copy(
                update={"email_to": email_to, "events": list(dict.fromkeys(notifications.events))}
            ),
        }
    )


def changed_paths(before: BotSettings, after: BotSettings) -> list[str]:
    """Dotted paths of the editable fields that differ, e.g. ``risk.max_positions``."""
    paths: list[str] = []
    for name in SECTIONS:
        old = getattr(before, name).model_dump()
        new = getattr(after, name).model_dump()
        for field, value in new.items():
            path = f"{name}.{field}"
            if path not in READ_ONLY_FIELDS and old.get(field) != value:
                paths.append(path)
    return paths


def settings_response(
    settings: BotSettings, config: EnvConfig, engine: EngineStatus | None, engine_online: bool
) -> SettingsResponse:
    return SettingsResponse(
        settings=with_server_fields(settings, config),
        applied_version=engine.settings_version if engine is not None and engine_online else None,
        restart_required=[],
    )
