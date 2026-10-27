"""Notification channels (respx / fake SMTP) and the fire-and-forget notifier."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime

import httpx
import pytest
import respx

from tradebot.notify import DeliveryError, DiscordChannel, EmailChannel, Notifier, TelegramChannel
from tradebot.notify import channels as channels_module
from tradebot.schemas import Notification, NotificationSettings

TOKEN = "123456:telegram-secret-token"
WEBHOOK = "https://discord.test/api/webhooks/1/discord-secret"


def note(type_: str = "TRADE_OPENED", **kw) -> Notification:
    return Notification(
        id=1,
        ts=datetime(2026, 3, 2, 12, 0, tzinfo=UTC),
        type=type_,  # type: ignore[arg-type]
        severity=kw.get("severity", "success"),
        title=kw.get("title", "LONG BTC/USDT opened"),
        message="0.0421 BTC @ $97,412.50 · SL $96,240 · TP $100,100",
    )


@respx.mock
async def test_telegram_send_message_and_scrubbed_failure():
    route = respx.post(f"https://api.telegram.org/bot{TOKEN}/sendMessage").mock(
        return_value=httpx.Response(200, json={"ok": True})
    )
    channel = TelegramChannel(TOKEN, "42")
    await channel.send(note())
    body = json.loads(route.calls.last.request.content)
    assert (
        body["chat_id"] == "42" and "LONG BTC/USDT opened" in body["text"] and "paper trading" in body["text"]
    )
    route.mock(
        return_value=httpx.Response(401, json={"ok": False, "description": f"Unauthorized bot{TOKEN}"})
    )
    with pytest.raises(DeliveryError) as err:
        await channel.send(note())
    assert TOKEN not in str(err.value) and "HTTP 401" in str(err.value)
    await channel.aclose()


@respx.mock
async def test_discord_webhook_embed_and_scrubbed_failure():
    route = respx.post(WEBHOOK).mock(return_value=httpx.Response(204))
    channel = DiscordChannel(WEBHOOK)
    await channel.send(note(severity="warning"))
    embed = json.loads(route.calls.last.request.content)["embeds"][0]
    assert embed["title"] == "LONG BTC/USDT opened" and embed["color"] == 0xF59E0B
    route.mock(side_effect=httpx.ConnectError(f"cannot reach {WEBHOOK}"))
    with pytest.raises(DeliveryError) as err:
        await channel.send(note())
    assert "discord-secret" not in str(err.value)
    await channel.aclose()


async def test_email_uses_starttls_login_and_send(monkeypatch):
    sent = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            sent["server"] = (host, port)

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def starttls(self, context=None):
            sent["tls"] = True

        def login(self, user, password):
            sent["login"] = (user, password)

        def send_message(self, msg):
            sent["msg"] = msg

    monkeypatch.setattr(channels_module.smtplib, "SMTP", FakeSMTP)
    channel = EmailChannel("smtp.test", 587, "bot@test", user="u", password="p", recipient="me@test")
    await channel.send(note())
    assert sent["server"] == ("smtp.test", 587) and sent["tls"] and sent["login"] == ("u", "p")
    assert sent["msg"]["To"] == "me@test" and "LONG BTC/USDT opened" in sent["msg"]["Subject"]
    with pytest.raises(DeliveryError):
        EmailChannel("smtp.test", 587, "bot@test").message(note())  # no recipient


class Recorder:
    name = "recorder"

    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.sent: list[Notification] = []

    async def send(self, notification: Notification) -> None:
        await asyncio.sleep(0)
        if self.fail:
            raise DeliveryError("boom")
        self.sent.append(notification)

    async def aclose(self) -> None:
        return None


async def test_notifier_routes_only_enabled_configured_channels_and_wanted_types():
    telegram, discord = Recorder(), Recorder()
    settings = NotificationSettings(telegram_enabled=True, discord_enabled=False, events=["TRADE_OPENED"])
    notifier = Notifier(settings, {"telegram": telegram, "discord": discord})
    assert notifier.active() == ["telegram"]
    assert notifier.dispatch([note(), note("SYSTEM"), note().model_copy(update={"read": True})]) == 1
    await notifier.drain()
    assert len(telegram.sent) == 1 and discord.sent == []
    assert (
        Notifier(NotificationSettings(email_enabled=True), {"email": Recorder()}).active() == []
    )  # no email_to


async def test_failures_are_reported_at_most_every_30_minutes():
    now = [0.0]
    failures: list[tuple[str, str]] = []
    notifier = Notifier(
        NotificationSettings(telegram_enabled=True),
        {"telegram": Recorder(fail=True)},
        on_failure=lambda ch, err: failures.append((ch, err)),
        clock=lambda: now[0],
    )
    for t in (0.0, 60.0, 1801.0):
        now[0] = t
        notifier.dispatch([note()])
        await notifier.drain()
    assert failures == [("telegram", "boom"), ("telegram", "boom")]
    assert notifier.failed["telegram"] == 3


async def test_dispatch_does_not_wait_for_slow_channels():
    class Slow(Recorder):
        async def send(self, notification: Notification) -> None:
            await asyncio.sleep(10)

    notifier = Notifier(NotificationSettings(telegram_enabled=True), {"telegram": Slow()}, timeout=0.05)
    loop = asyncio.get_running_loop()
    t0 = loop.time()
    notifier.dispatch([note()])
    assert loop.time() - t0 < 0.01
    await notifier.drain(timeout=1)
    assert notifier.failed["telegram"] == 1
