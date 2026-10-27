"""Fixtures for the API tests: a temporary database, an app wired to it, and realistic data."""

from __future__ import annotations

import importlib.util
import json
import sys
import time
import types
import warnings
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import anyio
import pytest

from tradebot.config import EnvConfig
from tradebot.db import Database, utcnow
from tradebot.schemas import AIAnalysis, AIModelOption, Position, Trade

# Starlette prefers the ``httpx2`` package for its test client and says so once per run;
# the test client works the same on ``httpx`` (a project dependency).
warnings.filterwarnings("ignore", message="Using `httpx` with `starlette.testclient` is deprecated")

from fastapi.testclient import TestClient  # noqa: E402

SECRET_ENV_VARS = (
    "OPENROUTER_API_KEY",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
    "DISCORD_WEBHOOK_URL",
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_FROM",
    "DASHBOARD_TOKEN",
)


def _install_pricing_stand_in() -> None:
    """The API imports ``tradebot.ai.pricing`` (engine-owned). Should it be absent in this
    checkout, provide the three names the API uses so the API can still be tested alone."""
    try:
        if importlib.util.find_spec("tradebot.ai.pricing") is not None:
            return
    except ModuleNotFoundError:
        pass
    module = types.ModuleType("tradebot.ai.pricing")
    module.DEFAULT_MODEL = "anthropic/claude-haiku-4.5"  # type: ignore[attr-defined]
    module.MODEL_OPTIONS = [  # type: ignore[attr-defined]
        AIModelOption(id="anthropic/claude-haiku-4.5", name="Claude Haiku 4.5", context_length=200_000),
        AIModelOption(id="openai/gpt-4o-mini", name="GPT-4o mini", context_length=128_000),
    ]
    module.estimate_cost = lambda model, prompt_tokens, completion_tokens: 0.0  # type: ignore[attr-defined]
    sys.modules["tradebot.ai.pricing"] = module


_install_pricing_stand_in()

from tradebot.api.main import create_app  # noqa: E402  (after the stand-in above)

from . import factories as f  # noqa: E402


def make_config(tmp_path: Path, **overrides: Any) -> EnvConfig:
    """Config isolated from any developer ``.env`` file."""
    values: dict[str, Any] = {
        "tradebot_db": tmp_path / "tradebot.db",
        "dashboard_dist": tmp_path / "no-dashboard-build",
        "trading_mode": "paper",
        "starting_balance": 10_000.0,
    }
    values.update(overrides)
    return EnvConfig(_env_file=None, **values)


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for var in SECRET_ENV_VARS:
        monkeypatch.delenv(var, raising=False)


@pytest.fixture
def config(tmp_path: Path) -> EnvConfig:
    return make_config(tmp_path)


@pytest.fixture
def db(config: EnvConfig) -> Iterator[Database]:
    database = Database(config.tradebot_db).init()
    yield database
    database.close()


def tune_for_tests(app: Any) -> Any:
    ctx = app.state.ctx
    ctx.hub.options.poll_interval = 0.02
    ctx.hub.options.status_interval = 0.3
    ctx.kpis.ttl = 0.0
    ctx.reports.ttl = 0.0
    ctx.stats.ttl = 0.0
    return app


@pytest.fixture
def app(config: EnvConfig, db: Database) -> Any:
    return tune_for_tests(create_app(config, db))


@pytest.fixture
def client(app: Any) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


# --------------------------------------------------------------------------
# Seeded data: a bot that has been trading for a few days
# --------------------------------------------------------------------------


@dataclass
class Seed:
    now: datetime
    trades: list[Trade] = field(default_factory=list)
    analyses: list[AIAnalysis] = field(default_factory=list)
    position: Position | None = None
    rejected: AIAnalysis | None = None
    hold: AIAnalysis | None = None


# (pnl, hours before now it closed, symbol, side, exit reason, confidence, regime)
TRADE_SPECS: tuple[tuple[float, float, str, str, str, float, str], ...] = (
    (42.0, 60.0, "BTC/USDT", "LONG", "TAKE_PROFIT", 82.0, "TRENDING_BULLISH"),
    (-18.5, 52.0, "ETH/USDT", "SHORT", "STOP_LOSS", 66.0, "RANGING"),
    (25.0, 40.0, "BTC/USDT", "LONG", "TAKE_PROFIT", 77.0, "TRENDING_BULLISH"),
    (-9.0, 30.0, "SOL/USDT", "LONG", "TIME_EXIT", 68.0, "LOW_VOLATILITY"),
    (31.0, 20.0, "BTC/USDT", "SHORT", "TAKE_PROFIT", 91.0, "TRENDING_BEARISH"),
    (-22.0, 10.0, "BTC/USDT", "LONG", "STOP_LOSS", 71.0, "HIGH_VOLATILITY"),
    (6.5, 4.0, "ETH/USDT", "LONG", "SIGNAL_REVERSAL", 74.0, "TRENDING_BULLISH"),
    (12.0, 1.5, "BTC/USDT", "LONG", "TAKE_PROFIT", 79.0, "TRENDING_BULLISH"),
)


def seed_database(db: Database) -> Seed:
    now = utcnow()
    seed = Seed(now=now)
    f.publish_live_state(db)

    step5, step1h, step1m = 300, 3_600, 60
    nows = f.ts(now)
    f.insert_candles(db, "BTC/USDT", "5m", f.candle_series(nows - nows % step5, step5, 1_400))
    f.insert_candles(db, "BTC/USDT", "1h", f.candle_series(nows - nows % step1h, step1h, 1_100))
    f.insert_candles(db, "BTC/USDT", "1m", f.candle_series(nows - nows % step1m, step1m, 300))
    f.insert_candles(db, "ETH/USDT", "5m", f.candle_series(nows - nows % step5, step5, 1_100, 3_450.0))

    for pnl, hours, symbol, side, reason, confidence, regime in TRADE_SPECS:
        closed = now - timedelta(hours=hours)
        duration = timedelta(minutes=55)
        decision = f.analysis(
            symbol=symbol,
            signal=side,
            confidence=confidence,
            regime=regime,
            created_at=closed - duration - timedelta(minutes=1),
            eval_status="CORRECT" if pnl > 0 else "INCORRECT",
        )
        trade = f.trade(
            pnl=pnl,
            closed_at=closed,
            duration=duration,
            symbol=symbol,
            side=side,
            exit_reason=reason,
            ai_confidence=confidence,
            regime=regime,
            analysis_id=decision.id,
        )
        f.insert_analysis(db, decision.model_copy(update={"trade_id": trade.id}))
        f.insert_trade(db, trade)
        seed.trades.append(trade)
        seed.analyses.append(decision)

    seed.rejected = f.insert_analysis(
        db,
        f.analysis(
            signal="SHORT",
            confidence=58.0,
            created_at=now - timedelta(hours=3),
            risk_status="REJECTED",
            risk_reasons=["Confidence below minimum", "Risk / reward below minimum"],
            eval_status="INCORRECT",
        ),
    )
    seed.hold = f.insert_analysis(
        db, f.analysis(signal="HOLD", confidence=45.0, created_at=now - timedelta(minutes=10))
    )
    opening = f.insert_analysis(
        db, f.analysis(signal="LONG", confidence=74.0, created_at=now - timedelta(minutes=51))
    )
    position = f.position(analysis_id=opening.id, opened_at=now - timedelta(minutes=50))
    f.insert_position(db, position)
    db.put_live("positions", [position])
    seed.position = position
    seed.analyses += [opening]

    # equity every 5 min for 3 days: a gentle climb with a dip
    start = nows - 3 * 86_400
    f.insert_equity(
        db,
        [
            (t, 10_000 + 250 * (t - start) / (3 * 86_400) - (60 if 40 <= (t - start) // 3_600 <= 44 else 0))
            for t in range(start, nows, 300)
        ],
    )

    db.append_event(
        "MARKET_UPDATE", "BTC/USDT 5m close", "Close 97,412", symbol="BTC/USDT", ts=now - timedelta(minutes=6)
    )
    db.append_event(
        "AI_ANALYSIS",
        "HOLD BTC/USDT",
        "No edge",
        symbol="BTC/USDT",
        data={"analysis_id": seed.hold.id, "signal": "HOLD", "confidence": 45.0},
        ts=now - timedelta(minutes=10),
    )
    db.append_event(
        "TRADE_REJECTED",
        "SHORT BTC/USDT rejected",
        "Confidence below minimum",
        severity="warning",
        symbol="BTC/USDT",
        data={"analysis_id": seed.rejected.id, "reasons": seed.rejected.risk.reasons},
        ts=now - timedelta(hours=3),
    )
    db.append_event("SYSTEM_WARNING", "Feed reconnected", "Binance stream reconnected", severity="warning")
    db.append_event("API_ERROR", "OpenRouter timeout", "Request timed out after 30 s", severity="error")

    db.add_notification("TRADE_OPENED", "Opened LONG BTC/USDT", "0.03 BTC at 97,000", severity="info")
    db.add_notification("STOP_LOSS_HIT", "Stop loss BTC/USDT", "-22.00 USDT", severity="warning")
    read_id = db.add_notification("SYSTEM", "Bot started", "Paper trading", severity="info")
    with db.tx() as conn:
        conn.execute("UPDATE notifications SET read = 1 WHERE id = ?", (read_id,))

    for minutes in (5, 25, 65, 300):
        f.insert_usage(db, now - timedelta(minutes=minutes))
    f.insert_usage(
        db, now - timedelta(minutes=15), success=False, latency_ms=30_000, error="Request timed out"
    )
    f.insert_usage(db, now - timedelta(days=3), cost_usd=0.01)

    f.insert_regime_segment(db, "BTC/USDT", "RANGING", now - timedelta(days=40), now - timedelta(days=20))
    f.insert_regime_segment(
        db, "BTC/USDT", "LOW_VOLATILITY", now - timedelta(days=20), now - timedelta(hours=6)
    )
    f.insert_regime_segment(db, "BTC/USDT", "TRENDING_BULLISH", now - timedelta(hours=6), None)
    return seed


@pytest.fixture
def seeded(db: Database) -> Seed:
    return seed_database(db)


# --------------------------------------------------------------------------
# WebSocket helpers
# --------------------------------------------------------------------------


def ws_receive(ws: Any, timeout: float = 5.0) -> dict[str, Any]:
    """``receive_json`` with a timeout, so a missing frame fails the test instead of hanging it."""

    async def receive() -> Any:
        with anyio.fail_after(timeout):
            return await ws._send_rx.receive()

    message = ws.portal.call(receive)
    ws._raise_on_close(message)
    return json.loads(message["text"])


def ws_receive_until(
    ws: Any, predicate: Callable[[dict[str, Any]], bool], timeout: float = 5.0
) -> dict[str, Any]:
    """Receive frames until one matches ``predicate``; the others are skipped."""
    deadline = time.monotonic() + timeout
    while (remaining := deadline - time.monotonic()) > 0:
        frame = ws_receive(ws, remaining)
        if predicate(frame):
            return frame
    raise AssertionError(f"no matching frame within {timeout} s")
