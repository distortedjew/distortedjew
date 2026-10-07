"""Delivery channels: Telegram ``sendMessage``, a Discord webhook and SMTP email.

Each channel formats a ``schemas.Notification`` and sends it, raising ``DeliveryError`` with a
message that is safe to log and store: the bot token and the webhook URL are secrets (they
grant posting rights), so they are scrubbed from every error text.
"""

from __future__ import annotations

import asyncio
import smtplib
import ssl
from email.message import EmailMessage
from typing import Any, Protocol

import httpx

from ..db import iso
from ..schemas import Notification

APP_NAME = "AI Trading Bot"
SEVERITY_COLORS: dict[str, int] = {
    "info": 0x3B82F6,
    "success": 0x22C55E,
    "warning": 0xF59E0B,
    "error": 0xEF4444,
}


class DeliveryError(Exception):
    """A notification could not be delivered. The message contains no secrets."""


class Channel(Protocol):
    name: str

    async def send(self, notification: Notification) -> None: ...

    async def aclose(self) -> None: ...


def format_text(n: Notification) -> str:
    """Plain-text body shared by Telegram and email."""
    return f"{n.title}\n{n.message}\n\n{APP_NAME} · paper trading · {n.ts:%Y-%m-%d %H:%M} UTC"


def _scrub(text: str, *secrets: str) -> str:
    for secret in secrets:
        if secret:
            text = text.replace(secret, "***")
    return text


class _HttpChannel:
    """Lazily created ``httpx.AsyncClient`` bound to the running event loop."""

    def __init__(self, timeout: float) -> None:
        self.timeout = timeout
        self._http: httpx.AsyncClient | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    def _client(self) -> httpx.AsyncClient:
        loop = asyncio.get_running_loop()
        if self._http is None or self._http.is_closed or self._loop is not loop:
            self._http = httpx.AsyncClient(
                timeout=httpx.Timeout(self.timeout, connect=min(5.0, self.timeout))
            )
            self._loop = loop
        return self._http

    async def aclose(self) -> None:
        if self._http is not None and not self._http.is_closed:
            await self._http.aclose()
        self._http = None


class TelegramChannel(_HttpChannel):
    name = "telegram"

    def __init__(
        self, token: str, chat_id: str, *, base_url: str = "https://api.telegram.org", timeout: float = 10.0
    ) -> None:
        super().__init__(timeout)
        self._token = token.strip()
        self.chat_id = chat_id
        self.base_url = base_url.rstrip("/")

    async def send(self, notification: Notification) -> None:
        url = f"{self.base_url}/bot{self._token}/sendMessage"
        payload = {
            "chat_id": self.chat_id,
            "text": format_text(notification),
            "disable_web_page_preview": True,
        }
        try:
            resp = await self._client().post(url, json=payload)
        except httpx.TimeoutException:
            raise DeliveryError("Telegram request timed out") from None
        except httpx.HTTPError as exc:
            raise DeliveryError(f"Telegram unreachable ({type(exc).__name__})") from None
        data: Any
        try:
            data = resp.json()
        except ValueError:
            data = None
        if resp.status_code != 200 or not (isinstance(data, dict) and data.get("ok")):
            detail = str(data.get("description", ""))[:200] if isinstance(data, dict) else ""
            message = f"Telegram HTTP {resp.status_code}" + (f": {detail}" if detail else "")
            raise DeliveryError(_scrub(message, self._token))


class DiscordChannel(_HttpChannel):
    name = "discord"

    def __init__(self, webhook_url: str, *, username: str = APP_NAME, timeout: float = 10.0) -> None:
        super().__init__(timeout)
        self._url = webhook_url.strip()
        self.username = username

    def payload(self, n: Notification) -> dict[str, Any]:
        return {
            "username": self.username,
            "embeds": [
                {
                    "title": n.title[:256],
                    "description": n.message[:4000],
                    "color": SEVERITY_COLORS.get(n.severity, SEVERITY_COLORS["info"]),
                    "timestamp": iso(n.ts),
                    "footer": {"text": f"{n.type} · paper trading"},
                }
            ],
        }

    async def send(self, notification: Notification) -> None:
        try:
            resp = await self._client().post(self._url, json=self.payload(notification))
        except httpx.TimeoutException:
            raise DeliveryError("Discord webhook timed out") from None
        except httpx.HTTPError as exc:
            raise DeliveryError(f"Discord unreachable ({type(exc).__name__})") from None
        if not 200 <= resp.status_code < 300:
            detail = ""
            try:
                body = resp.json()
                if isinstance(body, dict):
                    detail = str(body.get("message", ""))[:200]
            except ValueError:
                pass
            message = f"Discord HTTP {resp.status_code}" + (f": {detail}" if detail else "")
            raise DeliveryError(_scrub(message, self._url))


class EmailChannel:
    """SMTP (STARTTLS on 587, implicit TLS on 465) via the standard library, in a worker thread."""

    name = "email"

    def __init__(
        self,
        host: str,
        port: int,
        sender: str,
        *,
        user: str | None = None,
        password: str | None = None,
        starttls: bool = True,
        recipient: str | None = None,
        timeout: float = 15.0,
    ) -> None:
        self.host = host
        self.port = port
        self.sender = sender
        self.user = user
        self._password = password
        self.starttls = starttls
        self.recipient = recipient
        self.timeout = timeout

    def message(self, n: Notification) -> EmailMessage:
        if not self.recipient:
            raise DeliveryError("No email recipient configured (notifications.email_to)")
        msg = EmailMessage()
        msg["Subject"] = f"[{APP_NAME}] {n.title}"
        msg["From"] = self.sender
        msg["To"] = self.recipient
        msg.set_content(format_text(n))
        return msg

    def _send_sync(self, n: Notification) -> None:
        msg = self.message(n)
        context = ssl.create_default_context()
        try:
            if self.port == 465:
                smtp: smtplib.SMTP = smtplib.SMTP_SSL(
                    self.host, self.port, timeout=self.timeout, context=context
                )
            else:
                smtp = smtplib.SMTP(self.host, self.port, timeout=self.timeout)
            with smtp:
                if self.port != 465 and self.starttls:
                    smtp.starttls(context=context)
                if self.user and self._password:
                    smtp.login(self.user, self._password)
                smtp.send_message(msg)
        except smtplib.SMTPResponseException as exc:
            raise DeliveryError(f"SMTP error {exc.smtp_code} ({type(exc).__name__})") from None
        except (smtplib.SMTPException, OSError) as exc:
            raise DeliveryError(f"SMTP delivery failed ({type(exc).__name__})") from None

    async def send(self, notification: Notification) -> None:
        await asyncio.to_thread(self._send_sync, notification)

    async def aclose(self) -> None:
        return None
