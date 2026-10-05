"""Prompts for the LLM analyst: a fixed system prompt and a compact JSON market context.

The system prompt is constant (cache-friendly) and defines the role, the rules and the
exact JSON reply schema. The user message is one JSON object holding only data: price,
account limits, open position, regime, multi-timeframe view, indicator snapshots per
timeframe, the last ~30 decision-timeframe candles and the bot's recent record.
"""

from __future__ import annotations

import json
import math
from typing import Any

from ..db import iso
from .base import CONTEXT_TIMEFRAMES, MarketContext
from .levels import min_stop_pct

RECENT_CANDLES = 30

SYSTEM_PROMPT = """You are a disciplined crypto market analyst inside an automated paper-trading system. \
Each request is one JSON snapshot of one market on one decision timeframe. Decide whether to open a LONG, \
open a SHORT, or HOLD, and justify the call from the snapshot alone.

Rules:
1. Use only the numbers in the snapshot. Never invent news, order flow, on-chain data or events.
2. Prefer HOLD when the evidence conflicts, the trend is weak (ADX below ~18), price sits mid-range, or a \
sensible stop would sit inside normal noise. Missing a trade costs nothing; a bad trade costs money.
3. Trade with the higher-timeframe trend. Fade a move only in a RANGING or LOW_VOLATILITY regime with \
price at a Bollinger band extreme.
4. Levels: for LONG, stop_loss < entry < take_profit; for SHORT, take_profit < entry < stop_loss. Use the \
current price as entry unless you have a concrete reason (entry becomes the limit price when the account \
uses limit orders).
5. Stop distance: at least the larger of 1.5 x ATR(15m) and account.min_stop_pct percent of price, beyond \
the nearest swing high/low when that is reasonable, never more than 8 percent.
6. Reward-to-risk (|take_profit - entry| / |entry - stop_loss|) must be at least account.min_risk_reward. \
Do not stretch targets to manufacture it - HOLD instead.
7. Confidence (0-100) is your conviction that the trade reaches its target before its stop: 50 = coin \
flip, 60-70 = solid confluence, above 80 only when trend, momentum, volume and timeframes all agree, never \
above 90. Signals below account.min_confidence are not traded. For HOLD, confidence is how sure you are \
that standing aside is right.
8. Round-trip costs (account.round_trip_cost_pct) are paid on every trade; small expected moves are not worth it.
9. With a position already open on the symbol, a same-direction call keeps it; an opposite call closes it \
only with high confidence (at least min_confidence + 10).

Reply with ONLY one JSON object - no markdown, no code fences, no text before or after - with exactly \
these keys:
{
  "signal": "LONG" | "SHORT" | "HOLD",
  "confidence": number from 0 to 100,
  "entry": number or null,
  "stop_loss": number or null,
  "take_profit": number or null,
  "summary": "one or two plain-language sentences",
  "reasons": ["3 to 6 short evidence bullets citing values, e.g. \\"EMA 21 above EMA 50\\", \\"MACD histogram \
positive and rising\\", \\"Volume 1.8x its 20-bar average\\""],
  "risks": ["1 to 4 short bullets: counter-evidence and caveats"],
  "invalidation": "the price condition that proves the idea wrong, e.g. \\"Close below $96,240 (EMA 50)\\"", or null,
  "detailed_reasoning": "2 to 4 short paragraphs: structure, momentum, volatility and regime, the \
multi-timeframe view, then the trade plan or why you stand aside"
}
For HOLD set entry, stop_loss and take_profit to null."""


def _num(value: float | None, digits: int = 6) -> float | None:
    if value is None or not math.isfinite(value):
        return None
    if value == 0:
        return 0.0
    return round(value, max(0, digits - 1 - int(math.floor(math.log10(abs(value))))))


def _snapshot(ctx: MarketContext, tf: str) -> dict[str, Any] | None:
    snap = ctx.snapshots.get(tf)
    if snap is None:
        return None
    data = {k: _num(v) if isinstance(v, float) else v for k, v in snap.model_dump().items()}
    return {k: v for k, v in data.items() if v is not None}


def context_payload(ctx: MarketContext) -> dict[str, Any]:
    """The user-message data, as a dict (also handy for tests and debugging)."""
    s = ctx.settings
    f = ctx.decision
    payload: dict[str, Any] = {
        "symbol": ctx.symbol,
        "decision_timeframe": ctx.timeframe,
        "time": iso(ctx.ts),
        "price": _num(ctx.price, 8),
        "account": {
            "equity": round(ctx.equity, 2),
            "risk_per_trade_pct": s.risk.risk_per_trade_pct,
            "min_risk_reward": s.risk.min_risk_reward,
            "min_confidence": s.risk.min_ai_confidence,
            "allow_shorts": s.trading.allow_shorts,
            "order_type": s.execution.order_type,
            "round_trip_cost_pct": round(ctx.round_trip_cost_pct, 4),
            "min_stop_pct": round(min_stop_pct(ctx), 3),
            "max_holding_minutes": s.trading.max_holding_minutes,
        },
        "position": None,
        "regime": {
            "regime": ctx.regime.regime,
            "confidence": ctx.regime.confidence,
            **{k: _num(v, 4) for k, v in ctx.regime.metrics.items()},
        },
        "mtf": None,
        "indicators": {},
        "levels": {
            "swing_high_12": _num(f.swing_high, 8),
            "swing_low_12": _num(f.swing_low, 8),
            "atr_15m": _num(ctx.features["15m"].atr) if "15m" in ctx.features else None,
        },
        "recent_candles": {
            "timeframe": ctx.timeframe,
            "columns": ["time", "open", "high", "low", "close", "volume"],
            "rows": [
                [
                    c.time,
                    _num(c.open, 8),
                    _num(c.high, 8),
                    _num(c.low, 8),
                    _num(c.close, 8),
                    _num(c.volume, 5),
                ]
                for c in ctx.candles[-RECENT_CANDLES:]
            ],
        },
        "recent_performance": {
            "trades": ctx.performance.trades,
            "win_rate_pct": _num(ctx.performance.win_rate_pct, 3),
            "net_pnl": round(ctx.performance.net_pnl, 2),
            "consecutive_losses": ctx.performance.consecutive_losses,
            "last_results": ctx.performance.last_results,
        },
    }
    if ctx.position is not None:
        p = ctx.position
        payload["position"] = {
            "side": p.side,
            "entry": _num(p.entry_price, 8),
            "stop_loss": _num(p.stop_loss, 8),
            "take_profit": _num(p.take_profit, 8),
            "unrealized_pnl_pct": round(p.unrealized_pnl_pct, 3),
            "r_multiple": round(p.r_multiple, 2),
            "minutes_open": p.duration_sec // 60,
        }
    if ctx.mtf is not None:
        payload["mtf"] = {
            "label": ctx.mtf.alignment_label,
            "dominant": ctx.mtf.dominant,
            "timeframes": [
                {
                    "tf": t.timeframe,
                    "trend": t.trend,
                    "signal": t.signal,
                    "rsi": t.rsi,
                    "strength": t.strength,
                }
                for t in ctx.mtf.timeframes
            ],
        }
    for tf in CONTEXT_TIMEFRAMES:
        snap = _snapshot(ctx, tf)
        if snap is not None:
            payload["indicators"][tf] = snap
    return payload


def user_message(ctx: MarketContext) -> str:
    return json.dumps(context_payload(ctx), separators=(",", ":"), ensure_ascii=False)


def messages(ctx: MarketContext) -> list[dict[str, str]]:
    return [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user_message(ctx)}]
