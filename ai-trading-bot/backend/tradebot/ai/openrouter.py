"""OpenRouter LLM analyst: chat completions with JSON replies, retries and fallbacks.

Request: ``POST {base}/chat/completions`` with the configured model, temperature and
max tokens, ``response_format: {"type": "json_object"}`` and ``usage: {"include": true}``
(so OpenRouter returns the exact cost), plus the ``Authorization``, ``HTTP-Referer`` and
``X-Title`` headers from the environment configuration.

Failure handling, in order:

1. Retry the same model ``ai.retry_count`` times with exponential backoff and jitter on
   HTTP 429 (honouring ``Retry-After``), 408/5xx, timeouts, network errors, empty replies
   and replies that are not a JSON object.
2. Then each of ``ai.fallback_models`` the same way. Non-retryable errors (400/403/404)
   move on to the next model at once; 401/402 (bad key / no credits) stop all models.
3. Then, if ``ai.heuristic_fallback``, the local heuristic answers with ``fallback_reason``
   set; otherwise the result is a HOLD that explains the outage.

Every HTTP request becomes a ``UsageRecord`` (→ one ``ai_usage`` row) with latency, tokens,
cost (``usage.cost`` when present, else the pricing-table estimate) and a sanitized error.
The API key is only ever placed in the ``Authorization`` header: error texts are scrubbed of
it and nothing here logs request headers.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import random
import re
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import httpx

from ..db import utcnow
from ..schemas import AISettings, Side, Signal
from . import levels, prompts
from .base import AnalystResult, MarketContext, UsageRecord
from .heuristic import HeuristicAnalyst
from .pricing import estimate_cost

log = logging.getLogger(__name__)

BACKOFF_BASE = 1.0
BACKOFF_CAP = 10.0
RETRY_AFTER_CAP = 15.0
MAX_TEXT = {"summary": 600, "reason": 200, "invalidation": 200, "detailed_reasoning": 4000}
MAX_ENTRY_DRIFT_PCT = 3.0
_SIGNALS: dict[str, Signal] = {
    "LONG": "LONG",
    "BUY": "LONG",
    "BULLISH": "LONG",
    "SHORT": "SHORT",
    "SELL": "SHORT",
    "BEARISH": "SHORT",
    "HOLD": "HOLD",
    "NEUTRAL": "HOLD",
    "WAIT": "HOLD",
    "FLAT": "HOLD",
    "NONE": "HOLD",
}


class OpenRouterError(Exception):
    """One failed request. ``message`` is safe to persist and show (no secrets)."""

    def __init__(
        self,
        kind: str,
        message: str,
        *,
        status: int | None = None,
        retryable: bool = False,
        fatal: bool = False,
        retry_after: float | None = None,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        cost: float | None = None,
    ) -> None:
        super().__init__(message)
        self.kind = kind
        self.message = message
        self.status = status
        self.retryable = retryable
        self.fatal = fatal  # no point trying other models (bad key, no credits)
        self.retry_after = retry_after
        self.prompt_tokens = prompt_tokens
        self.completion_tokens = completion_tokens
        self.cost = cost


@dataclass(slots=True)
class Completion:
    content: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    cost: float | None


class OpenRouterClient:
    """Thin async client for OpenRouter chat completions."""

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = "https://openrouter.ai/api/v1",
        app_url: str = "",
        app_name: str = "AI Trading Bot",
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._key = api_key.strip()
        self.base_url = base_url.rstrip("/")
        self.app_url = app_url
        self.app_name = app_name
        self._transport = transport
        self._http: httpx.AsyncClient | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    def clone(self) -> OpenRouterClient:
        return OpenRouterClient(
            self._key,
            base_url=self.base_url,
            app_url=self.app_url,
            app_name=self.app_name,
            transport=self._transport,
        )

    def scrub(self, text: str) -> str:
        """Remove the key (and anything that looks like a bearer token) from a message."""
        if self._key:
            text = text.replace(self._key, "***")
        return re.sub(r"(?i)bearer\s+\S+", "Bearer ***", text)

    def _client(self) -> httpx.AsyncClient:
        loop = asyncio.get_running_loop()
        if self._http is None or self._loop is not loop or self._http.is_closed:
            self._http = httpx.AsyncClient(transport=self._transport)
            self._loop = loop
        return self._http

    async def aclose(self) -> None:
        if self._http is not None and not self._http.is_closed:
            await self._http.aclose()
        self._http = None

    def _headers(self) -> dict[str, str]:
        headers = {"Authorization": f"Bearer {self._key}", "Content-Type": "application/json"}
        if self.app_url:
            headers["HTTP-Referer"] = self.app_url
        if self.app_name:
            headers["X-Title"] = self.app_name
        return headers

    async def complete(
        self,
        *,
        model: str,
        messages: list[dict[str, str]],
        temperature: float,
        max_tokens: int,
        timeout: float,
    ) -> Completion:
        body = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "response_format": {"type": "json_object"},
            "usage": {"include": True},
        }
        try:
            resp = await self._client().post(
                f"{self.base_url}/chat/completions",
                json=body,
                headers=self._headers(),
                timeout=httpx.Timeout(timeout, connect=min(10.0, timeout)),
            )
        except httpx.TimeoutException as exc:
            raise OpenRouterError(
                "timeout", f"request timed out after {timeout:.0f} s", retryable=True
            ) from exc
        except httpx.HTTPError as exc:
            raise OpenRouterError(
                "network", self.scrub(f"network error ({type(exc).__name__})"), retryable=True
            ) from exc

        try:
            data = resp.json()
        except ValueError:
            data = None
        if resp.status_code != 200:
            raise self._http_error(resp, data)
        if not isinstance(data, dict):
            raise OpenRouterError("bad_response", "response body is not JSON", retryable=True)
        usage = data.get("usage") or {}
        prompt_tokens = int(usage.get("prompt_tokens") or 0)
        completion_tokens = int(usage.get("completion_tokens") or 0)
        cost = usage.get("cost")
        cost_f = float(cost) if isinstance(cost, int | float) else None
        if data.get("error"):
            err = data["error"] if isinstance(data["error"], dict) else {"message": str(data["error"])}
            code = int(err.get("code") or 0) if str(err.get("code") or "").isdigit() else 0
            raise OpenRouterError(
                "provider_error",
                self.scrub(f"provider error {code or ''}: {str(err.get('message', ''))[:200]}".strip()),
                status=code or None,
                retryable=code in (0, 408, 429) or code >= 500,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                cost=cost_f,
            )
        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError):
            content = None
        if not content or not str(content).strip():
            raise OpenRouterError(
                "empty",
                "empty reply",
                retryable=True,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                cost=cost_f,
            )
        return Completion(
            content=str(content),
            model=str(data.get("model") or model),
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cost=cost_f,
        )

    def _http_error(self, resp: httpx.Response, data: Any) -> OpenRouterError:
        status = resp.status_code
        detail = ""
        if isinstance(data, dict) and isinstance(data.get("error"), dict):
            detail = str(data["error"].get("message", ""))[:200]
        message = self.scrub(f"HTTP {status}" + (f": {detail}" if detail else ""))
        retry_after = None
        if status == 429:
            try:
                retry_after = float(resp.headers.get("retry-after", ""))
            except ValueError:
                retry_after = None
        return OpenRouterError(
            "http",
            message,
            status=status,
            retryable=status in (408, 409, 425, 429) or status >= 500,
            fatal=status in (401, 402),
            retry_after=retry_after,
        )


# --------------------------------------------------------------------------
# Reply parsing and repair
# --------------------------------------------------------------------------


def extract_json(text: str) -> dict[str, Any]:
    """The JSON object in a reply (tolerates code fences and stray prose around it)."""
    s = text.strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z]*\s*", "", s)
        s = re.sub(r"\s*```$", "", s)
    try:
        obj = json.loads(s)
    except ValueError:
        start, end = s.find("{"), s.rfind("}")
        if start < 0 or end <= start:
            raise ValueError("no JSON object in the reply") from None
        obj = json.loads(s[start : end + 1])
    if not isinstance(obj, dict):
        raise ValueError("the reply is not a JSON object")
    return obj


def _float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value) if math.isfinite(value) else None
    if isinstance(value, str):
        cleaned = value.replace(",", "").replace("$", "").replace("%", "").strip()
        try:
            v = float(cleaned)
        except ValueError:
            return None
        return v if math.isfinite(v) else None
    return None


def _text(value: Any, limit: int) -> str:
    if value is None:
        return ""
    s = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    s = " ".join(s.split()) if limit <= 600 else s.strip()
    return s if len(s) <= limit else s[: limit - 1].rstrip() + "…"


def _bullets(value: Any, limit: int = 6) -> list[str]:
    if isinstance(value, str):
        value = [v for v in re.split(r"\n+|;\s+", value) if v.strip()]
    if not isinstance(value, list):
        return []
    out = []
    for item in value:
        t = _text(item, MAX_TEXT["reason"]).lstrip("-•* ").strip()
        if t:
            out.append(t)
    return out[:limit]


def repair_reply(data: dict[str, Any], ctx: MarketContext) -> tuple[dict[str, Any], list[str]]:
    """Validate an LLM reply into AnalystResult fields; returns (fields, repair notes).

    The signal is normalised, confidence clamped to 0-100 (fractions are scaled), the entry
    pulled back to the market when it drifts more than 3 %, and invalid or missing levels
    (wrong side of the entry) replaced by the system's ATR-based plan.
    """
    notes: list[str] = []
    raw_signal = str(data.get("signal", "HOLD")).strip().upper()
    signal = _SIGNALS.get(raw_signal)
    if signal is None:
        notes.append(f"Unrecognised signal {raw_signal[:20]!r} treated as HOLD")
        signal = "HOLD"
    confidence = _float(data.get("confidence"))
    if confidence is None:
        notes.append("Missing confidence; assumed 50")
        confidence = 50.0
    elif 0.0 < confidence <= 1.0 and not float(confidence).is_integer():
        confidence *= 100.0
    confidence = round(min(100.0, max(0.0, confidence)), 1)

    entry = stop = target = None
    invalidation = _text(data.get("invalidation"), MAX_TEXT["invalidation"]) or None
    if signal != "HOLD":
        side: Side = signal  # type: ignore[assignment]
        entry = _float(data.get("entry"))
        if entry is None or entry <= 0 or abs(entry / ctx.price - 1.0) * 100.0 > MAX_ENTRY_DRIFT_PCT:
            if entry is not None:
                notes.append("Entry far from the market price; reset to the current price")
            entry = ctx.price
        stop, target = _float(data.get("stop_loss")), _float(data.get("take_profit"))
        if not levels.levels_valid(side, entry, stop, target):
            plan = levels.plan(ctx, side)
            entry, stop, target = plan.entry, plan.stop_loss, plan.take_profit
            notes.append(
                "Model levels were missing or on the wrong side; the risk engine set ATR-based levels"
            )
            invalidation = invalidation or levels.invalidation(ctx, side, stop)
    fields = {
        "signal": signal,
        "confidence": confidence,
        "entry": entry,
        "stop_loss": stop,
        "take_profit": target,
        "summary": _text(data.get("summary"), MAX_TEXT["summary"]) or f"{signal} call on {ctx.symbol}.",
        "reasons": _bullets(data.get("reasons")) or ["The model gave no supporting evidence"],
        "risks": _bullets(data.get("risks"), 4),
        "invalidation": invalidation,
        "detailed_reasoning": _text(data.get("detailed_reasoning"), MAX_TEXT["detailed_reasoning"])
        or _text(data.get("summary"), MAX_TEXT["summary"]),
    }
    if notes:
        fields["risks"] = [*fields["risks"], *notes][:6]
    return fields, notes


# --------------------------------------------------------------------------
# The analyst
# --------------------------------------------------------------------------


class OpenRouterAnalyst:
    """LLM analyst with retries, fallback models and the heuristic as the last resort."""

    provider = "openrouter"
    is_remote = True

    def __init__(
        self,
        client: OpenRouterClient,
        settings: AISettings,
        fallback: HeuristicAnalyst | None = None,
        *,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        now: Callable[[], datetime] = utcnow,
        max_total_sec: float = 150.0,
    ) -> None:
        self.client = client
        self.settings = settings
        self.fallback = fallback or HeuristicAnalyst()
        self._sleep = sleep
        self._now = now
        self.max_total_sec = max_total_sec

    @property
    def model(self) -> str:
        return self.settings.model

    def update_settings(self, settings: AISettings) -> None:
        self.settings = settings

    def analyze(self, ctx: MarketContext) -> AnalystResult:
        """Synchronous call (backtests): runs on a private event loop with a private client."""

        async def run() -> AnalystResult:
            client = self.client.clone()
            try:
                return await self._analyze(client, ctx)
            finally:
                await client.aclose()

        return asyncio.run(run())

    async def aanalyze(self, ctx: MarketContext) -> AnalystResult:
        return await self._analyze(self.client, ctx)

    def _backoff(self, attempt: int, retry_after: float | None) -> float:
        if retry_after is not None and retry_after > 0:
            return min(RETRY_AFTER_CAP, retry_after)
        return min(BACKOFF_CAP, BACKOFF_BASE * 2**attempt) + random.uniform(0.0, 0.5)

    async def _analyze(self, client: OpenRouterClient, ctx: MarketContext) -> AnalystResult:
        s = self.settings
        msgs = prompts.messages(ctx)
        usage: list[UsageRecord] = []
        errors: list[str] = []
        started = time.monotonic()
        models = list(dict.fromkeys([s.model, *s.fallback_models]))
        fatal = False
        for model in models:
            for attempt in range(1 + s.retry_count):
                t0 = time.monotonic()
                ts = self._now()
                try:
                    completion = await client.complete(
                        model=model,
                        messages=msgs,
                        temperature=s.temperature,
                        max_tokens=s.max_tokens,
                        timeout=float(s.request_timeout_sec),
                    )
                except OpenRouterError as exc:
                    latency = (time.monotonic() - t0) * 1000.0
                    cost = (
                        exc.cost
                        if exc.cost is not None
                        else (estimate_cost(model, exc.prompt_tokens, exc.completion_tokens) or 0.0)
                    )
                    usage.append(
                        UsageRecord(
                            ts,
                            "openrouter",
                            model,
                            False,
                            latency,
                            exc.prompt_tokens,
                            exc.completion_tokens,
                            cost,
                            exc.message,
                        )
                    )
                    errors.append(f"{model}: {exc.message}")
                    log.warning("OpenRouter %s failed (attempt %d): %s", model, attempt + 1, exc.message)
                    if exc.fatal:
                        fatal = True
                        break
                    if not exc.retryable or attempt >= s.retry_count:
                        break
                    if time.monotonic() - started > self.max_total_sec:
                        break
                    await self._sleep(self._backoff(attempt, exc.retry_after))
                    continue
                latency = (time.monotonic() - t0) * 1000.0
                cost = (
                    completion.cost
                    if completion.cost is not None
                    else (estimate_cost(model, completion.prompt_tokens, completion.completion_tokens) or 0.0)
                )
                try:
                    data = extract_json(completion.content)
                except ValueError as exc:
                    message = f"unparseable reply ({exc})"
                    usage.append(
                        UsageRecord(
                            ts,
                            "openrouter",
                            model,
                            False,
                            latency,
                            completion.prompt_tokens,
                            completion.completion_tokens,
                            cost,
                            message,
                        )
                    )
                    errors.append(f"{model}: {message}")
                    log.warning(
                        "OpenRouter %s returned an unparseable reply (attempt %d)", model, attempt + 1
                    )
                    if attempt >= s.retry_count or time.monotonic() - started > self.max_total_sec:
                        break
                    await self._sleep(self._backoff(attempt, None))
                    continue
                usage.append(
                    UsageRecord(
                        ts,
                        "openrouter",
                        model,
                        True,
                        latency,
                        completion.prompt_tokens,
                        completion.completion_tokens,
                        cost,
                        None,
                    )
                )
                fields, _notes = repair_reply(data, ctx)
                total_cost = sum(u.cost_usd for u in usage)
                return AnalystResult(
                    **fields,
                    provider="openrouter",
                    model=model,
                    latency_ms=int((time.monotonic() - started) * 1000),
                    prompt_tokens=sum(u.prompt_tokens for u in usage),
                    completion_tokens=sum(u.completion_tokens for u in usage),
                    cost_usd=round(total_cost, 8),
                    usage=usage,
                    errors=errors,
                )
            if fatal:
                break
        return self._failed(ctx, usage, errors, time.monotonic() - started)

    def _failed(
        self, ctx: MarketContext, usage: list[UsageRecord], errors: list[str], elapsed: float
    ) -> AnalystResult:
        last = errors[-1] if errors else "no reply"
        reason = f"OpenRouter unavailable after {len(usage)} request(s): {last}"
        if self.settings.heuristic_fallback:
            result = self.fallback.analyze(ctx)
            result.fallback_reason = reason[:300]
            result.usage = usage
            result.errors = errors
            result.latency_ms = int(elapsed * 1000)
            result.prompt_tokens = sum(u.prompt_tokens for u in usage)
            result.completion_tokens = sum(u.completion_tokens for u in usage)
            result.cost_usd = round(sum(u.cost_usd for u in usage), 8)
            result.failed = True
            return result
        return AnalystResult(
            signal="HOLD",
            confidence=0.0,
            entry=None,
            stop_loss=None,
            take_profit=None,
            summary=f"AI analysis unavailable for {ctx.symbol}; holding until OpenRouter answers again.",
            reasons=[reason[:200]],
            risks=["The heuristic fallback is disabled in the AI settings"],
            invalidation=None,
            detailed_reasoning=reason,
            provider="openrouter",
            model=self.settings.model,
            latency_ms=int(elapsed * 1000),
            prompt_tokens=sum(u.prompt_tokens for u in usage),
            completion_tokens=sum(u.completion_tokens for u in usage),
            cost_usd=round(sum(u.cost_usd for u in usage), 8),
            usage=usage,
            errors=errors,
            failed=True,
        )
