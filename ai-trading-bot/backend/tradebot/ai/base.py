"""Analyst interface: the market context an analyst reads and the result it returns.

Every analyst — the OpenRouter LLM, the local heuristic and the technical baseline — maps a
``MarketContext`` to an ``AnalystResult`` with the same fields as the persisted
``schemas.AIAnalysis`` call (signal, confidence, levels, plain-language reasoning), plus
the bookkeeping the engine needs (token usage per HTTP request, sanitized errors).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol, runtime_checkable

from ..indicators import Features
from ..schemas import (
    AIProvider,
    BotSettings,
    Candle,
    IndicatorSnapshot,
    MTFReport,
    Position,
    RegimeState,
    Signal,
    Timeframe,
)

CONTEXT_TIMEFRAMES: tuple[str, ...] = ("1m", "5m", "15m", "1h", "4h")


@dataclass(frozen=True, slots=True)
class RecentPerformance:
    """The bot's own recent record, shown to the analyst (and in the prompt)."""

    trades: int = 0
    wins: int = 0
    net_pnl: float = 0.0
    consecutive_losses: int = 0
    last_results: str = ""  # most recent last, e.g. "WLLW"

    @property
    def win_rate_pct(self) -> float | None:
        return self.wins / self.trades * 100.0 if self.trades else None


@dataclass(slots=True)
class MarketContext:
    """Everything an analyst may use for one decision on one symbol."""

    symbol: str
    timeframe: Timeframe  # decision timeframe
    ts: datetime  # decision time (close of the decision candle)
    price: float
    features: dict[str, Features]  # per available timeframe; the decision timeframe is always present
    snapshots: dict[str, IndicatorSnapshot]
    mtf: MTFReport | None
    regime: RegimeState
    candles: list[Candle]  # recent closed decision-timeframe candles, oldest first
    position: Position | None
    equity: float
    settings: BotSettings
    performance: RecentPerformance = field(default_factory=RecentPerformance)
    narrate: bool = True  # full prose (False in fast backtests: short texts only)

    @property
    def decision(self) -> Features:
        return self.features[self.timeframe]

    @property
    def round_trip_cost_pct(self) -> float:
        """Fees + slippage for entering and exiting, in percent of notional."""
        ex = self.settings.execution
        return 2.0 * (ex.fee_bps + ex.slippage_bps) / 100.0


@dataclass(slots=True)
class UsageRecord:
    """One LLM HTTP request (successful or not) → one ``ai_usage`` row."""

    ts: datetime
    provider: AIProvider
    model: str
    success: bool
    latency_ms: float
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost_usd: float = 0.0
    error: str | None = None


@dataclass(slots=True)
class AnalystResult:
    signal: Signal
    confidence: float
    entry: float | None
    stop_loss: float | None
    take_profit: float | None
    summary: str
    reasons: list[str]
    risks: list[str]
    invalidation: str | None
    detailed_reasoning: str
    provider: AIProvider
    model: str
    latency_ms: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost_usd: float = 0.0
    fallback_reason: str | None = None
    usage: list[UsageRecord] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)  # sanitized API errors met while answering

    @property
    def risk_reward(self) -> float | None:
        """Reward / risk from the levels (never taken from a model's own claim)."""
        if self.signal == "HOLD" or None in (self.entry, self.stop_loss, self.take_profit):
            return None
        assert self.entry is not None and self.stop_loss is not None and self.take_profit is not None
        risk = abs(self.entry - self.stop_loss)
        if risk <= 0:
            return None
        return round(abs(self.take_profit - self.entry) / risk, 2)


@runtime_checkable
class Analyst(Protocol):
    """Maps a market context to a trading call."""

    provider: AIProvider
    #: True when ``aanalyze`` does network I/O (the live engine awaits it off the tick path)
    is_remote: bool

    @property
    def model(self) -> str: ...

    def analyze(self, ctx: MarketContext) -> AnalystResult: ...

    async def aanalyze(self, ctx: MarketContext) -> AnalystResult: ...
