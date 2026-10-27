"""OpenRouter analyst against a mocked API (respx): retries, fallbacks, costs, repair, no key leaks."""

from __future__ import annotations

import json
import logging

import httpx
import pytest
import respx

from tradebot.ai import pricing
from tradebot.ai.openrouter import OpenRouterAnalyst, OpenRouterClient, extract_json, repair_reply
from tradebot.schemas import AISettings

from .conftest import context_from, walk_candles

KEY = "sk-or-v1-supersecretkey0123456789"
URL = "https://openrouter.test/api/v1/chat/completions"


@pytest.fixture(scope="module")
def ctx():
    return context_from(walk_candles(5000, vol=0.0012, seed=3))


def reply(ctx, *, signal="LONG", cost: float | None = 0.00042, content: str | None = None) -> httpx.Response:
    price = ctx.price
    body = content or json.dumps(
        {
            "signal": signal,
            "confidence": 72,
            "entry": price,
            "stop_loss": price * 0.99,
            "take_profit": price * 1.02,
            "summary": "Trend continuation after a shallow pullback.",
            "reasons": ["EMA 21 above EMA 50", "MACD histogram positive and rising"],
            "risks": ["RSI near 65"],
            "invalidation": "Close below the EMA 50",
            "detailed_reasoning": "Structure is bullish.\n\nMomentum confirms.",
        }
    )
    usage = {"prompt_tokens": 1200, "completion_tokens": 300}
    if cost is not None:
        usage["cost"] = cost
    return httpx.Response(
        200,
        json={
            "model": "anthropic/claude-haiku-4.5",
            "choices": [{"message": {"content": body}}],
            "usage": usage,
        },
    )


def analyst(**ai) -> tuple[OpenRouterAnalyst, list[float]]:
    sleeps: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    client = OpenRouterClient(
        KEY,
        base_url="https://openrouter.test/api/v1",
        app_url="https://bot.example",
        app_name="AI Trading Bot",
    )
    settings = AISettings(**{"retry_count": 2, **ai})
    return OpenRouterAnalyst(client, settings, sleep=fake_sleep), sleeps


@respx.mock
async def test_success_sends_the_documented_request_and_records_usage(ctx):
    route = respx.post(URL).mock(return_value=reply(ctx))
    a, _ = analyst()
    result = await a.aanalyze(ctx)
    request = route.calls.last.request
    assert request.headers["Authorization"] == f"Bearer {KEY}"
    assert (
        request.headers["HTTP-Referer"] == "https://bot.example"
        and request.headers["X-Title"] == "AI Trading Bot"
    )
    body = json.loads(request.content)
    assert body["response_format"] == {"type": "json_object"} and body["usage"] == {"include": True}
    assert (
        body["model"] == "anthropic/claude-haiku-4.5"
        and body["temperature"] == 0.2
        and body["max_tokens"] == 900
    )
    assert (
        body["messages"][0]["role"] == "system" and "ONLY one JSON object" in body["messages"][0]["content"]
    )
    payload = json.loads(body["messages"][1]["content"])
    assert {"price", "account", "indicators", "mtf", "regime", "recent_candles", "recent_performance"} <= set(
        payload
    )
    assert result.provider == "openrouter" and result.signal == "LONG" and not result.failed
    assert result.cost_usd == pytest.approx(0.00042) and result.prompt_tokens == 1200
    assert result.risk_reward == pytest.approx(2.0, abs=0.01)
    assert len(result.usage) == 1 and result.usage[0].success


@respx.mock
async def test_429_is_retried_with_backoff(ctx):
    respx.post(URL).mock(side_effect=[httpx.Response(429, headers={"retry-after": "3"}), reply(ctx)])
    a, sleeps = analyst()
    result = await a.aanalyze(ctx)
    assert result.provider == "openrouter" and sleeps == [3.0]
    assert [u.success for u in result.usage] == [False, True] and "HTTP 429" in result.usage[0].error


@respx.mock
async def test_timeout_moves_to_the_fallback_model(ctx):
    def handler(request: httpx.Request) -> httpx.Response:
        if json.loads(request.content)["model"] == "anthropic/claude-haiku-4.5":
            raise httpx.ReadTimeout("slow", request=request)
        return reply(ctx)

    respx.post(URL).mock(side_effect=handler)
    a, _ = analyst(retry_count=0, fallback_models=["openai/gpt-4o-mini"])
    result = await a.aanalyze(ctx)
    assert result.model == "openai/gpt-4o-mini" and result.provider == "openrouter"
    assert result.errors and "timed out" in result.errors[0]


@respx.mock
async def test_invalid_json_is_retried(ctx):
    respx.post(URL).mock(side_effect=[reply(ctx, content="Sure! Here is my analysis: buy."), reply(ctx)])
    a, sleeps = analyst()
    result = await a.aanalyze(ctx)
    assert result.signal == "LONG" and len(sleeps) == 1
    assert "unparseable" in result.usage[0].error


@respx.mock
async def test_total_failure_falls_back_to_the_heuristic(ctx, caplog):
    respx.post(URL).mock(return_value=httpx.Response(503, json={"error": {"message": "overloaded"}}))
    a, sleeps = analyst(retry_count=1, fallback_models=["openai/gpt-4o-mini"])
    with caplog.at_level(logging.DEBUG):
        result = await a.aanalyze(ctx)
    assert result.provider == "heuristic" and result.failed
    assert result.fallback_reason and "OpenRouter unavailable after 4 request(s)" in result.fallback_reason
    assert len(result.usage) == 4 and not any(u.success for u in result.usage) and len(sleeps) == 2
    assert KEY not in caplog.text


@respx.mock
async def test_no_fallback_holds_and_bad_key_stops_at_once(ctx):
    respx.post(URL).mock(return_value=httpx.Response(401, json={"error": {"message": f"Invalid key {KEY}"}}))
    a, sleeps = analyst(heuristic_fallback=False, fallback_models=["openai/gpt-4o-mini"])
    result = await a.aanalyze(ctx)
    assert result.signal == "HOLD" and result.failed and result.provider == "openrouter"
    assert len(result.usage) == 1 and sleeps == []  # 401 is fatal: no retries, no other models
    text = json.dumps([u.error for u in result.usage]) + " ".join(result.errors) + result.detailed_reasoning
    assert KEY not in text and "***" in result.usage[0].error


@respx.mock
async def test_cost_is_estimated_when_usage_has_none(ctx):
    respx.post(URL).mock(return_value=reply(ctx, cost=None))
    a, _ = analyst()
    result = await a.aanalyze(ctx)
    assert result.cost_usd == pytest.approx(pricing.estimate_cost("anthropic/claude-haiku-4.5", 1200, 300))


def test_pricing_table():
    assert pricing.DEFAULT_MODEL == "anthropic/claude-haiku-4.5"
    assert pricing.MODEL_OPTIONS[0].id == pricing.DEFAULT_MODEL and pricing.MODEL_OPTIONS[0].recommended
    assert sum(m.recommended for m in pricing.MODEL_OPTIONS) == 1
    assert pricing.estimate_cost("anthropic/claude-haiku-4.5", 1_000_000, 0) == pytest.approx(1.0)
    assert pricing.estimate_cost("unknown/model", 10, 10) is None


def test_reply_repair(ctx):
    assert extract_json('```json\n{"signal": "HOLD"}\n```') == {"signal": "HOLD"}
    price = ctx.price
    fields, notes = repair_reply(
        {
            "signal": "buy",
            "confidence": 0.8,
            "entry": price,
            "stop_loss": price * 1.01,
            "take_profit": price * 1.03,
        },
        ctx,
    )
    assert fields["signal"] == "LONG" and fields["confidence"] == 80.0
    assert fields["stop_loss"] < fields["entry"] < fields["take_profit"]  # wrong-side stop replaced
    assert notes
    fields, _ = repair_reply({"signal": "SHORT", "confidence": 250}, ctx)
    assert fields["confidence"] == 100.0 and fields["take_profit"] < fields["entry"] < fields["stop_loss"]
