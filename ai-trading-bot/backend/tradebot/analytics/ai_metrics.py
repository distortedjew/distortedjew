"""AI decision analytics and LLM usage statistics served by the API.

Definitions (the dashboard's AI page tooltips come from here):

- **Analysis**: one row of ``ai_decisions`` (every decision cycle, any signal).
- **Signal**: a *directional* analysis (LONG or SHORT). HOLDs count only toward
  ``total_signals``, ``hold_signals`` and ``hold_frequency_pct`` (HOLD / all analyses).
- **AI trade**: a closed trade opened from an analysis created in the range
  (``trades.analysis_id``); its confidence is that analysis' confidence.
- **Win rate**: WIN trades / all closed trades × 100 (``metrics.classify``).
- **Shadow accuracy**: CORRECT / (CORRECT + INCORRECT) of the engine's shadow
  evaluation of every directional signal, executed or not (virtual TP before SL).
  PENDING and EXPIRED signals are left out.
- **Rejection rate**: REJECTED / (APPROVED + REJECTED) signals × 100.
- **Confidence buckets**: 50–60, 60–70, 70–80, 80–90 and 90–100 % (100 included),
  plus "<50%" only when such signals exist. High confidence means ≥ 75 %.
- **Calibration**: per bucket, the mean confidence of its closed trades (of its
  signals when none closed yet) against the trades' win rate; ``actual`` stays None
  under 3 trades.
- **Over time**: one point per UTC day. ``signals``, ``avg_confidence`` and
  ``accuracy`` belong to the day the signal was made; ``trades``, ``win_rate``,
  ``pnl`` and ``cumulative_win_rate`` to the day the trade closed.

LLM usage (``AIUsageStats``, from ``ai_usage``; heuristic answers are not requests):
``*_today`` covers the UTC day so far, ``*_total`` all time; ``error_rate_pct`` and the
latencies (successful requests, p95 by nearest rank) cover the last 24 hours, like
``hourly``; ``est_monthly_cost_usd`` is the trailing-7-day average daily cost × 30
(averaged over fewer days while the history is younger than a week).
"""

from __future__ import annotations

import json
import math
import sqlite3
from collections import Counter, defaultdict
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta

from ..db import Database, iso, parse_iso, utcnow
from ..schemas import (
    AIAnalytics,
    AIPerformancePoint,
    AIProvider,
    AIUsageHour,
    AIUsageStats,
    CalibrationPoint,
    ConfidenceBucket,
    ConfidencePoint,
    PerformanceRange,
    ProviderBreakdown,
    RejectionReasonCount,
    Side,
    Signal,
    TradeResult,
)
from .performance import DAY, HOUR, day_of, day_start, period_start, win_rate

HIGH_CONFIDENCE_THRESHOLD = 75.0
BUCKET_EDGES: tuple[float, ...] = (50.0, 60.0, 70.0, 80.0, 90.0, 100.0)
MIN_CALIBRATION_TRADES = 3
SCATTER_LIMIT = 500
TOP_REJECTION_REASONS = 15
LAST_ERROR_MAX_CHARS = 500


@dataclass(frozen=True)
class DecisionRow:
    id: str
    created_at: datetime
    signal: Signal
    confidence: float
    provider: str
    model: str
    risk_status: str
    eval_status: str
    trade_id: str | None

    @property
    def directional(self) -> bool:
        return self.signal != "HOLD"


@dataclass(frozen=True)
class AITradeRow:
    trade_id: str
    side: Side
    confidence: float
    pnl: float
    pnl_pct: float
    result: TradeResult
    closed_at: datetime
    provider: str
    model: str


# --------------------------------------------------------------------------
# Loading
# --------------------------------------------------------------------------


def load_decisions(db: Database, start: datetime, end: datetime) -> list[DecisionRow]:
    rows = db.read(
        "SELECT id, created_at, signal, confidence, provider, risk_status, eval_status, trade_id, "
        "json_extract(payload, '$.model') AS model FROM ai_decisions "
        "WHERE created_at >= ? AND created_at <= ? ORDER BY created_at",
        (iso(start), iso(end)),
    )
    return [
        DecisionRow(
            id=r["id"],
            created_at=parse_iso(r["created_at"]),
            signal=r["signal"],
            confidence=r["confidence"],
            provider=r["provider"],
            model=r["model"] or "unknown",
            risk_status=r["risk_status"],
            eval_status=r["eval_status"],
            trade_id=r["trade_id"],
        )
        for r in rows
    ]


def load_ai_trades(db: Database, start: datetime, end: datetime) -> list[AITradeRow]:
    rows = db.read(
        "SELECT t.id, t.side, t.pnl, t.pnl_pct, t.result, t.closed_at, d.confidence, d.provider, "
        "json_extract(d.payload, '$.model') AS model FROM trades t "
        "JOIN ai_decisions d ON d.id = t.analysis_id "
        "WHERE d.created_at >= ? AND d.created_at <= ? ORDER BY t.closed_at",
        (iso(start), iso(end)),
    )
    return [
        AITradeRow(
            trade_id=r["id"],
            side=r["side"],
            confidence=r["confidence"],
            pnl=r["pnl"],
            pnl_pct=r["pnl_pct"],
            result=r["result"],
            closed_at=parse_iso(r["closed_at"]),
            provider=r["provider"],
            model=r["model"] or "unknown",
        )
        for r in rows
    ]


def load_rejection_reasons(db: Database, start: datetime, end: datetime) -> list[str]:
    reasons: list[str] = []
    for r in db.read(
        "SELECT json_extract(payload, '$.risk.reasons') AS reasons FROM ai_decisions "
        "WHERE risk_status = 'REJECTED' AND created_at >= ? AND created_at <= ?",
        (iso(start), iso(end)),
    ):
        if r["reasons"]:
            reasons.extend(str(x) for x in json.loads(r["reasons"]) if x)
    return reasons


# --------------------------------------------------------------------------
# Pure computation
# --------------------------------------------------------------------------


def _mean(values: Sequence[float]) -> float | None:
    return sum(values) / len(values) if values else None


def _accuracy(decisions: Sequence[DecisionRow]) -> float | None:
    correct = sum(1 for d in decisions if d.eval_status == "CORRECT")
    incorrect = sum(1 for d in decisions if d.eval_status == "INCORRECT")
    return correct / (correct + incorrect) * 100.0 if correct + incorrect else None


def _round(value: float | None, digits: int = 2) -> float | None:
    return None if value is None else round(value, digits)


def bucket_index(confidence: float) -> int:
    """0..4 for the 50–100 % buckets, -1 below 50 %."""
    if confidence < BUCKET_EDGES[0]:
        return -1
    return min(int((confidence - BUCKET_EDGES[0]) // 10), len(BUCKET_EDGES) - 2)


def _bucket_bounds(index: int) -> tuple[str, float, float]:
    if index < 0:
        return "<50%", 0.0, BUCKET_EDGES[0]
    lo, hi = BUCKET_EDGES[index], BUCKET_EDGES[index + 1]
    return f"{lo:g}–{hi:g}%", lo, hi


def compute_ai_analytics(
    decisions: Sequence[DecisionRow],
    trades: Sequence[AITradeRow],
    rejection_reasons: Sequence[str],
    usage: AIUsageStats,
    *,
    first_day: date,
    now: datetime,
) -> AIAnalytics:
    """Everything on the AI page from already-loaded rows (see the module docstring)."""
    signals = [d for d in decisions if d.directional]
    longs = [d for d in signals if d.signal == "LONG"]
    shorts = [d for d in signals if d.signal == "SHORT"]
    holds = len(decisions) - len(signals)
    approved = sum(1 for d in signals if d.risk_status == "APPROVED")
    rejected = sum(1 for d in signals if d.risk_status == "REJECTED")

    signals_by_bucket: dict[int, list[DecisionRow]] = defaultdict(list)
    for d in signals:
        signals_by_bucket[bucket_index(d.confidence)].append(d)
    trades_by_bucket: dict[int, list[AITradeRow]] = defaultdict(list)
    for t in trades:
        trades_by_bucket[bucket_index(t.confidence)].append(t)

    indexes = ([-1] if signals_by_bucket.get(-1) or trades_by_bucket.get(-1) else []) + list(
        range(len(BUCKET_EDGES) - 1)
    )
    buckets: list[ConfidenceBucket] = []
    calibration: list[CalibrationPoint] = []
    for i in indexes:
        label, lo, hi = _bucket_bounds(i)
        bucket_signals = signals_by_bucket.get(i, [])
        bucket_trades = trades_by_bucket.get(i, [])
        rate = win_rate([t.pnl for t in bucket_trades])
        buckets.append(
            ConfidenceBucket(
                label=label,
                min=lo,
                max=hi,
                signals=len(bucket_signals),
                trades=len(bucket_trades),
                wins=sum(1 for t in bucket_trades if t.result == "WIN"),
                win_rate=_round(rate),
                avg_return_pct=_round(_mean([t.pnl_pct for t in bucket_trades]), 4),
                shadow_accuracy=_round(_accuracy(bucket_signals)),
            )
        )
        if bucket_signals or bucket_trades:
            sample = [t.confidence for t in bucket_trades] or [d.confidence for d in bucket_signals]
            calibration.append(
                CalibrationPoint(
                    predicted=round(sum(sample) / len(sample), 2),
                    actual=_round(rate) if len(bucket_trades) >= MIN_CALIBRATION_TRADES else None,
                    count=len(bucket_trades),
                )
            )

    high = [t.pnl for t in trades if t.confidence >= HIGH_CONFIDENCE_THRESHOLD]
    low = [t.pnl for t in trades if t.confidence < HIGH_CONFIDENCE_THRESHOLD]
    reasons = Counter(rejection_reasons)
    scatter = sorted(trades, key=lambda t: t.closed_at)[-SCATTER_LIMIT:]

    return AIAnalytics(
        total_signals=len(decisions),
        long_signals=len(longs),
        short_signals=len(shorts),
        hold_signals=holds,
        hold_frequency_pct=round(holds / len(decisions) * 100.0, 2) if decisions else 0.0,
        executed_trades=sum(1 for d in signals if d.trade_id),
        ai_win_rate=_round(win_rate([t.pnl for t in trades])),
        ai_avg_return_pct=_round(_mean([t.pnl_pct for t in trades]), 4),
        avg_confidence=_round(_mean([d.confidence for d in signals])),
        high_confidence_threshold=HIGH_CONFIDENCE_THRESHOLD,
        high_confidence_win_rate=_round(win_rate(high)),
        low_confidence_win_rate=_round(win_rate(low)),
        long_accuracy=_round(_accuracy(longs)),
        short_accuracy=_round(_accuracy(shorts)),
        signals_rejected=rejected,
        rejection_rate_pct=round(rejected / (approved + rejected) * 100.0, 2) if approved + rejected else 0.0,
        rejection_reasons=[
            RejectionReasonCount(reason=reason, count=count)
            for reason, count in sorted(reasons.items(), key=lambda kv: (-kv[1], kv[0]))[
                :TOP_REJECTION_REASONS
            ]
        ],
        buckets=buckets,
        scatter=[
            ConfidencePoint(
                trade_id=t.trade_id,
                confidence=t.confidence,
                pnl_pct=t.pnl_pct,
                pnl=t.pnl,
                result=t.result,
                side=t.side,
                closed_at=t.closed_at,
            )
            for t in scatter
        ],
        calibration=calibration,
        over_time=_over_time(signals, trades, first_day, day_of(int(now.timestamp()))),
        by_provider=_by_provider(decisions, trades),
        usage=usage,
        updated_at=now,
    )


def _over_time(
    signals: Sequence[DecisionRow], trades: Sequence[AITradeRow], first_day: date, today: date
) -> list[AIPerformancePoint]:
    signals_by_day: dict[date, list[DecisionRow]] = defaultdict(list)
    for d in signals:
        signals_by_day[d.created_at.astimezone(UTC).date()].append(d)
    trades_by_day: dict[date, list[AITradeRow]] = defaultdict(list)
    for t in trades:
        trades_by_day[t.closed_at.astimezone(UTC).date()].append(t)

    points: list[AIPerformancePoint] = []
    total_trades = total_wins = 0
    day = first_day
    while day <= today:
        day_signals = signals_by_day.get(day, [])
        day_trades = trades_by_day.get(day, [])
        wins = sum(1 for t in day_trades if t.result == "WIN")
        total_trades += len(day_trades)
        total_wins += wins
        points.append(
            AIPerformancePoint(
                date=day,
                signals=len(day_signals),
                trades=len(day_trades),
                win_rate=round(wins / len(day_trades) * 100.0, 2) if day_trades else None,
                cumulative_win_rate=round(total_wins / total_trades * 100.0, 2) if total_trades else None,
                accuracy=_round(_accuracy(day_signals)),
                avg_confidence=_round(_mean([d.confidence for d in day_signals])),
                pnl=round(sum(t.pnl for t in day_trades), 2),
            )
        )
        day += timedelta(days=1)
    return points


def _by_provider(decisions: Sequence[DecisionRow], trades: Sequence[AITradeRow]) -> list[ProviderBreakdown]:
    signals: Counter[tuple[str, str]] = Counter()
    for d in decisions:
        signals[(d.provider, d.model)] += 1 if d.directional else 0
    pnls: dict[tuple[str, str], list[float]] = defaultdict(list)
    for t in trades:
        pnls[(t.provider, t.model)].append(t.pnl)
    keys = sorted(set(signals) | set(pnls), key=lambda k: (-signals[k], k))
    return [
        ProviderBreakdown(
            provider=provider,
            model=model,
            signals=signals[(provider, model)],
            trades=len(pnls[(provider, model)]),
            win_rate=_round(win_rate(pnls[(provider, model)])),
        )
        for provider, model in keys
    ]


def build_ai_analytics(
    db: Database, range_: PerformanceRange, usage: AIUsageStats, *, now: datetime | None = None
) -> AIAnalytics:
    now = now or utcnow()
    now_t = int(now.timestamp())
    if range_ == "all":
        row = db.read_one("SELECT MIN(created_at) AS t FROM ai_decisions")
        start = parse_iso(row["t"]) if row and row["t"] else now
    else:
        start = datetime.fromtimestamp(period_start(db, range_, now_t), UTC)
    return compute_ai_analytics(
        load_decisions(db, start, now),
        load_ai_trades(db, start, now),
        load_rejection_reasons(db, start, now),
        usage,
        first_day=min(start.astimezone(UTC).date(), day_of(now_t)),
        now=now,
    )


# --------------------------------------------------------------------------
# LLM usage
# --------------------------------------------------------------------------


@dataclass
class _HourBucket:
    requests: int = 0
    errors: int = 0
    tokens: int = 0
    latencies: list[float] = field(default_factory=list)

    def add(self, row: sqlite3.Row) -> None:
        self.requests += 1
        self.tokens += row["prompt_tokens"] + row["completion_tokens"]
        if row["success"]:
            self.latencies.append(row["latency_ms"])
        else:
            self.errors += 1


def percentile(values: Sequence[float], q: float) -> float | None:
    """Nearest-rank percentile (q in 0..100)."""
    if not values:
        return None
    ordered = sorted(values)
    rank = max(1, math.ceil(q / 100.0 * len(ordered)))
    return ordered[rank - 1]


def build_usage_stats(
    db: Database,
    *,
    provider: AIProvider,
    model: str,
    configured: bool,
    now: datetime | None = None,
) -> AIUsageStats:
    now = now or utcnow()
    now_t = int(now.timestamp())
    today_start = day_start(day_of(now_t))
    day_ago = now_t - DAY
    week_ago = now_t - 7 * DAY

    totals = db.read_one(
        "SELECT COUNT(*) AS n, COALESCE(SUM(cost_usd), 0) AS cost, MIN(ts) AS first, MAX(ts) AS last "
        "FROM ai_usage"
    )
    rows = [
        (int(parse_iso(r["ts"]).timestamp()), r)
        for r in db.read(
            "SELECT ts, success, latency_ms, prompt_tokens, completion_tokens, cost_usd FROM ai_usage "
            "WHERE ts >= ? ORDER BY ts",
            (iso(datetime.fromtimestamp(week_ago, UTC)),),
        )
    ]
    last_error = db.read_one("SELECT ts, error FROM ai_usage WHERE success = 0 ORDER BY id DESC LIMIT 1")

    today = [r for t, r in rows if t >= today_start]
    last_24h = [(t, r) for t, r in rows if t > day_ago]
    latencies = [r["latency_ms"] for _, r in last_24h if r["success"]]
    errors_24h = sum(1 for _, r in last_24h if not r["success"])
    prompt_today = sum(r["prompt_tokens"] for r in today)
    completion_today = sum(r["completion_tokens"] for r in today)

    observed_days = 7.0
    if totals["first"]:
        observed_days = min(7.0, max(1.0, (now_t - parse_iso(totals["first"]).timestamp()) / DAY))
    cost_week = sum(r["cost_usd"] for _, r in rows)

    first_hour = (now_t // HOUR - 23) * HOUR
    hourly = [_HourBucket() for _ in range(24)]
    for t, r in last_24h:
        index = (t - first_hour) // HOUR
        if 0 <= index < 24:
            hourly[index].add(r)

    error_text = (last_error["error"] or "Request failed") if last_error else None
    return AIUsageStats(
        provider=provider,
        model=model,
        configured=configured,
        requests_today=len(today),
        requests_total=totals["n"],
        errors_today=sum(1 for r in today if not r["success"]),
        error_rate_pct=round(errors_24h / len(last_24h) * 100.0, 2) if last_24h else 0.0,
        avg_latency_ms=_round(_mean(latencies), 1),
        p95_latency_ms=_round(percentile(latencies, 95), 1),
        prompt_tokens_today=prompt_today,
        completion_tokens_today=completion_today,
        total_tokens_today=prompt_today + completion_today,
        cost_today_usd=round(sum(r["cost_usd"] for r in today), 6),
        cost_total_usd=round(totals["cost"], 6),
        est_monthly_cost_usd=round(cost_week / observed_days * 30.0, 4),
        last_request_at=parse_iso(totals["last"]) if totals["last"] else None,
        last_error=error_text[:LAST_ERROR_MAX_CHARS] if error_text else None,
        last_error_at=parse_iso(last_error["ts"]) if last_error else None,
        hourly=[
            AIUsageHour(
                hour=datetime.fromtimestamp(first_hour + i * HOUR, UTC),
                requests=b.requests,
                errors=b.errors,
                tokens=b.tokens,
                avg_latency_ms=_round(_mean(b.latencies), 1),
            )
            for i, b in enumerate(hourly)
        ],
    )
