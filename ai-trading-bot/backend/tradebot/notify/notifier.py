"""Routes notifications to the enabled, configured channels without blocking the caller."""

from __future__ import annotations

import asyncio
import logging
import time
from collections import Counter
from collections.abc import Callable, Iterable, Mapping

from ..config import EnvConfig
from ..schemas import Notification, NotificationSettings
from .channels import Channel, DeliveryError, DiscordChannel, EmailChannel, TelegramChannel

log = logging.getLogger(__name__)

FAILURE_WARNING_EVERY = 30 * 60.0  # seconds between failure reports per channel
SEND_TIMEOUT = 20.0


def build_channels(cfg: EnvConfig) -> dict[str, Channel]:
    """The channels whose credentials are present in the environment."""
    channels: dict[str, Channel] = {}
    if cfg.telegram_configured and cfg.telegram_bot_token is not None and cfg.telegram_chat_id:
        channels["telegram"] = TelegramChannel(
            cfg.telegram_bot_token.get_secret_value(), cfg.telegram_chat_id
        )
    if cfg.discord_configured and cfg.discord_webhook_url is not None:
        channels["discord"] = DiscordChannel(cfg.discord_webhook_url.get_secret_value())
    if cfg.email_configured and cfg.smtp_host and cfg.smtp_from:
        channels["email"] = EmailChannel(
            cfg.smtp_host,
            cfg.smtp_port,
            cfg.smtp_from,
            user=cfg.smtp_user,
            password=cfg.smtp_password.get_secret_value() if cfg.smtp_password else None,
            starttls=cfg.smtp_starttls,
        )
    return channels


class Notifier:
    """Fire-and-forget delivery; ``on_failure(channel, error)`` is rate-limited per channel."""

    def __init__(
        self,
        settings: NotificationSettings,
        channels: Mapping[str, Channel],
        *,
        on_failure: Callable[[str, str], None] | None = None,
        timeout: float = SEND_TIMEOUT,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.settings = settings
        self.channels = dict(channels)
        self.on_failure = on_failure
        self.timeout = timeout
        self.clock = clock
        self.sent: Counter[str] = Counter()
        self.failed: Counter[str] = Counter()
        self._last_warning: dict[str, float] = {}
        self._tasks: set[asyncio.Task[None]] = set()

    @classmethod
    def from_config(
        cls,
        cfg: EnvConfig,
        settings: NotificationSettings,
        *,
        on_failure: Callable[[str, str], None] | None = None,
    ) -> Notifier:
        return cls(settings, build_channels(cfg), on_failure=on_failure)

    def update_settings(self, settings: NotificationSettings) -> None:
        self.settings = settings

    def active(self) -> list[str]:
        """Channels that are both enabled in the settings and configured in the environment."""
        s = self.settings
        names: list[str] = []
        if s.telegram_enabled and "telegram" in self.channels:
            names.append("telegram")
        if s.discord_enabled and "discord" in self.channels:
            names.append("discord")
        if s.email_enabled and s.email_to and "email" in self.channels:
            names.append("email")
        return names

    def dispatch(self, notifications: Iterable[Notification]) -> int:
        """Schedule delivery of each wanted notification on every active channel; returns the count.

        Must be called from the event loop thread; it never waits for the network.
        """
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return 0
        wanted = set(self.settings.events)
        active = self.active()
        scheduled = 0
        for n in notifications:
            if n.read or n.type not in wanted:
                continue
            for name in active:
                task = loop.create_task(self._deliver(name, n))
                self._tasks.add(task)
                task.add_done_callback(self._tasks.discard)
                scheduled += 1
        return scheduled

    async def _deliver(self, name: str, n: Notification) -> None:
        channel = self.channels[name]
        if isinstance(channel, EmailChannel):
            channel.recipient = self.settings.email_to
        try:
            await asyncio.wait_for(channel.send(n), timeout=self.timeout)
        except TimeoutError:
            self._failed(name, f"no answer within {self.timeout:.0f} s")
        except DeliveryError as exc:
            self._failed(name, str(exc))
        except Exception as exc:  # noqa: BLE001 - a channel must never take the engine down
            self._failed(name, f"unexpected {type(exc).__name__}")
        else:
            self.sent[name] += 1

    def _failed(self, name: str, error: str) -> None:
        self.failed[name] += 1
        log.warning("Notification delivery via %s failed: %s", name, error)
        now = self.clock()
        last = self._last_warning.get(name)
        if last is not None and now - last < FAILURE_WARNING_EVERY:
            return
        self._last_warning[name] = now
        if self.on_failure is not None:
            self.on_failure(name, error)

    async def drain(self, timeout: float = 5.0) -> None:
        """Wait (bounded) for deliveries in flight, e.g. on shutdown."""
        pending = list(self._tasks)
        if pending:
            await asyncio.wait(pending, timeout=timeout)

    async def aclose(self) -> None:
        await self.drain()
        for task in list(self._tasks):
            task.cancel()
        for channel in self.channels.values():
            await channel.aclose()
