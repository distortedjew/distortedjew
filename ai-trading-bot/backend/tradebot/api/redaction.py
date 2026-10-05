"""Keep configured secrets out of every response, WebSocket frame and log line.

The API never serializes a secret on purpose: settings and model info expose only
``configured`` flags and a fixed mask. Free text written by the engine is another
matter: an upstream error quoting a request URL (a Telegram bot token is part of the
URL, a Discord webhook URL *is* the secret) could reach an event, a notification or
``ai_usage.error``. As a last line of defence every configured secret value is
replaced with ``[redacted]`` in textual HTTP responses, in WebSocket frames and in
the access / error log lines (which would otherwise show ``/ws?token=...``).
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Iterable
from urllib.parse import quote

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

MASK = "[redacted]"
# Shorter values would match ordinary words; nothing that short is a real credential.
MIN_SECRET_LENGTH = 6
_TOKEN_QUERY = re.compile(r"([?&]token=)[^&\s\"']+")
_TEXTUAL_TYPES = ("application/json", "text/")


class Redactor:
    """Replaces every configured secret (raw, JSON-escaped and URL-encoded forms)."""

    def __init__(self, secrets: Iterable[str]):
        needles: set[str] = set()
        for secret in secrets:
            value = secret.strip()
            if len(value) < MIN_SECRET_LENGTH:
                continue
            needles.add(value)
            needles.add(json.dumps(value, ensure_ascii=False)[1:-1])
            needles.add(quote(value, safe=""))
        self._needles = sorted(needles, key=len, reverse=True)
        self._byte_needles = [n.encode() for n in self._needles]

    def __bool__(self) -> bool:
        return bool(self._needles)

    def text(self, value: str) -> str:
        for needle in self._needles:
            if needle in value:
                value = value.replace(needle, MASK)
        return value

    def data(self, value: bytes) -> bytes:
        mask = MASK.encode()
        for needle in self._byte_needles:
            if needle in value:
                value = value.replace(needle, mask)
        return value


class RedactionMiddleware:
    """Pure ASGI middleware that redacts secrets from textual HTTP response bodies.

    Textual bodies (JSON, CSV, plain text) are buffered, redacted and re-sent with a
    corrected ``content-length``; files and other binary responses stream through.
    """

    def __init__(self, app: ASGIApp, redactor: Redactor):
        self.app = app
        self.redactor = redactor

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not self.redactor:
            await self.app(scope, receive, send)
            return

        start: Message | None = None
        chunks: list[bytes] = []

        async def redacting_send(message: Message) -> None:
            nonlocal start
            if message["type"] == "http.response.start":
                headers = Headers(raw=message["headers"])
                textual = headers.get("content-type", "").startswith(_TEXTUAL_TYPES)
                if textual and "content-encoding" not in headers:
                    start = message
                    return
            elif message["type"] == "http.response.body" and start is not None:
                chunks.append(message.get("body", b""))
                if message.get("more_body", False):
                    return
                body = self.redactor.data(b"".join(chunks))
                headers = MutableHeaders(raw=list(start["headers"]))
                headers["content-length"] = str(len(body))
                await send({**start, "headers": headers.raw})
                await send({"type": "http.response.body", "body": body, "more_body": False})
                return
            await send(message)

        await self.app(scope, receive, redacting_send)


class RedactingLogFilter(logging.Filter):
    """Masks secrets and ``token=`` query values in a record's message and arguments.

    Arguments are cleaned one by one (not pre-formatted) because uvicorn's access
    formatter unpacks ``record.args``.
    """

    def __init__(self, redactor: Redactor):
        super().__init__()
        self.redactor = redactor

    def _clean(self, value: object) -> object:
        if not isinstance(value, str):
            return value
        return self.redactor.text(_TOKEN_QUERY.sub(rf"\g<1>{MASK}", value))

    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = self._clean(record.msg)
        if isinstance(record.args, tuple):
            record.args = tuple(self._clean(arg) for arg in record.args)
        elif isinstance(record.args, dict):
            record.args = {key: self._clean(arg) for key, arg in record.args.items()}
        return True


LOGGERS_WITH_URLS = ("uvicorn.access", "uvicorn.error")


def install_log_redaction(redactor: Redactor) -> None:
    """Attach (or replace) the redacting filter on the loggers that print request URLs."""
    for name in LOGGERS_WITH_URLS:
        logger = logging.getLogger(name)
        for existing in [f for f in logger.filters if isinstance(f, RedactingLogFilter)]:
            logger.removeFilter(existing)
        logger.addFilter(RedactingLogFilter(redactor))
