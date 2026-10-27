"""Optional delivery of notifications to Telegram, Discord and email.

Every notification lives in the database (the dashboard's notification center); this package
only forwards copies. A channel is used when it is enabled in ``BotSettings.notifications``
*and* configured in the environment (token / webhook / SMTP server), and only for the
notification types listed in ``settings.notifications.events``.

Delivery is fire-and-forget: ``Notifier.dispatch`` schedules one task per message and returns
at once, every request has a timeout, and SMTP runs in a worker thread, so a slow or broken
channel never blocks the trading loop. Failures are reported through ``on_failure`` at most
once per channel every 30 minutes (the engine turns that into a ``SYSTEM_WARNING`` event).
Secrets (bot token, webhook URL, SMTP password) never appear in error texts or logs.
"""

from __future__ import annotations

from .channels import (
    Channel,
    DeliveryError,
    DiscordChannel,
    EmailChannel,
    TelegramChannel,
    format_text,
)
from .notifier import FAILURE_WARNING_EVERY, Notifier

__all__ = [
    "FAILURE_WARNING_EVERY",
    "Channel",
    "DeliveryError",
    "DiscordChannel",
    "EmailChannel",
    "Notifier",
    "TelegramChannel",
    "format_text",
]
