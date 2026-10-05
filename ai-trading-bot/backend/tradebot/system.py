"""Process, host and database statistics and component health for ``GET /api/system``.

Component states follow ``schemas.HealthState``: ``operational`` (green), ``warning``
(amber), ``error`` (red) and ``disabled`` (grey: not configured or intentionally off).

| Component | operational | warning | error / disabled |
|---|---|---|---|
| bot | heartbeat < 10 s old, trading allowed | heartbeat 10–60 s old, or trading halted | no heartbeat for 60 s, stopped, or never started |
| api | always (it is answering) | | |
| openrouter | last request succeeded, 24 h error rate < 20 % | error rate ≥ 20 % | last request failed; *disabled* when no API key is configured (local heuristic analyst in use) |
| market_data | feed connected, last tick < 15 s old | tick 15–60 s old, or simulated feed after a Binance fallback | feed disconnected, data stale (> 60 s) or engine offline |
| database | queries answer in < 250 ms | slower | (a failing database fails the request: 500) |
| websocket | broadcaster running | | broadcaster stopped |
"""

from __future__ import annotations

import os
import platform
import threading
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import psutil

from .db import Database, utcnow
from .schemas import (
    AIUsageStats,
    BotStatus,
    ComponentHealth,
    DatabaseStats,
    HostStats,
    ProcessStats,
)

TABLES: tuple[str, ...] = (
    "settings",
    "live_state",
    "events",
    "candles",
    "ai_decisions",
    "positions",
    "trades",
    "equity_snapshots",
    "notifications",
    "ai_usage",
    "regime_history",
    "backtests",
)
TICK_DELAYED_SEC = 15.0
TICK_STALE_SEC = 60.0
OPENROUTER_ERROR_RATE_WARNING = 20.0
SLOW_QUERY_MS = 250.0
_MB = 1024 * 1024


def format_age(seconds: float) -> str:
    """Compact human duration: "8 s", "3 min", "5 h", "2 d"."""
    seconds = max(0.0, seconds)
    if seconds < 90:
        return f"{seconds:.0f} s"
    if seconds < 90 * 60:
        return f"{seconds / 60:.0f} min"
    if seconds < 36 * 3600:
        return f"{seconds / 3600:.0f} h"
    return f"{seconds / 86400:.0f} d"


class ProcessMonitor:
    """CPU, memory and uptime of this process and of the host.

    CPU percentages are measured between successive calls (psutil's non-blocking mode);
    both counters are primed at construction so the first reading is meaningful.
    """

    # Readings closer together than this are too noisy; the previous value is reported.
    MIN_SAMPLE_SEC = 0.5

    def __init__(self) -> None:
        self._process = psutil.Process()
        self.started_at = datetime.fromtimestamp(self._process.create_time(), UTC)
        self._lock = threading.Lock()
        self._process.cpu_percent(None)
        # psutil.cpu_percent() keeps its last sample per calling thread and requests run on
        # varying worker threads, so the host figure is computed from our own samples.
        self._cpu_times = psutil.cpu_times()
        self._cpu_sampled_at = time.monotonic()
        self._host_cpu = 0.0

    def process(self) -> ProcessStats:
        with self._lock:
            cpu = self._process.cpu_percent(None)
            rss = self._process.memory_info().rss
        return ProcessStats(
            pid=self._process.pid,
            cpu_pct=round(cpu, 1),
            rss_mb=round(rss / _MB, 1),
            uptime_sec=round((utcnow() - self.started_at).total_seconds(), 1),
            started_at=self.started_at,
        )

    def host(self, disk_path: Path) -> HostStats:
        memory = psutil.virtual_memory()
        return HostStats(
            cpu_pct=round(self._host_cpu_pct(), 1),
            cpu_count=psutil.cpu_count() or 1,
            ram_used_mb=round((memory.total - memory.available) / _MB, 1),
            ram_total_mb=round(memory.total / _MB, 1),
            ram_pct=round(memory.percent, 1),
            disk_pct=round(_disk_pct(disk_path), 1),
            load_avg=[round(x, 2) for x in os.getloadavg()] if hasattr(os, "getloadavg") else [],
            python=platform.python_version(),
            platform=platform.platform(terse=True),
        )

    def _host_cpu_pct(self) -> float:
        """Busy share of all CPUs since the previous reading."""
        with self._lock:
            now = time.monotonic()
            if now - self._cpu_sampled_at >= self.MIN_SAMPLE_SEC:
                sample = psutil.cpu_times()
                total = _cpu_total(sample) - _cpu_total(self._cpu_times)
                idle = _cpu_idle(sample) - _cpu_idle(self._cpu_times)
                if total > 0:
                    self._host_cpu = min(100.0, max(0.0, (total - idle) / total * 100.0))
                self._cpu_times, self._cpu_sampled_at = sample, now
            return self._host_cpu


def _cpu_total(times: Any) -> float:
    # guest time is already included in user / nice on Linux
    return sum(times) - getattr(times, "guest", 0.0) - getattr(times, "guest_nice", 0.0)


def _cpu_idle(times: Any) -> float:
    return times.idle + getattr(times, "iowait", 0.0)


def _disk_pct(path: Path) -> float:
    probe = path
    while not probe.exists() and probe != probe.parent:
        probe = probe.parent
    try:
        return psutil.disk_usage(str(probe)).percent
    except OSError:
        return 0.0


def database_stats(db: Database) -> DatabaseStats:
    """File size (database + WAL), row counts and the latency of a small indexed query."""
    started = time.perf_counter()
    db.read_one("SELECT id FROM events ORDER BY id DESC LIMIT 1")
    latency_ms = (time.perf_counter() - started) * 1000.0
    tables = {name: int(db.read_one(f"SELECT COUNT(*) AS n FROM {name}")["n"]) for name in TABLES}
    size = 0
    for suffix in ("", "-wal", "-shm"):
        candidate = Path(f"{db.path}{suffix}")
        if candidate.is_file():
            size += candidate.stat().st_size
    return DatabaseStats(
        path=str(db.path),
        size_mb=round(size / _MB, 2),
        tables=tables,
        query_latency_ms=round(latency_ms, 2),
    )


# --------------------------------------------------------------------------
# Component health
# --------------------------------------------------------------------------


def bot_health(status: BotStatus) -> ComponentHealth:
    engine = status.engine
    if engine is None:
        return ComponentHealth(
            key="bot",
            name="Trading engine",
            state="error",
            message="Engine has not started yet — no heartbeat received",
        )
    age = status.heartbeat_age_sec or 0.0
    details: dict[str, str | float | int | bool | None] = {
        "pid": engine.pid,
        "version": engine.version,
        "mode": engine.mode,
        "strategy": engine.strategy,
        "symbols": ", ".join(engine.symbols),
        "decision_timeframe": engine.decision_timeframe,
        "settings_version": engine.settings_version,
        "cpu_pct": engine.cpu_pct,
        "rss_mb": engine.rss_mb,
        "heartbeat_age_sec": round(age, 1),
    }
    if status.state == "offline":
        state, message = (
            "error",
            "Engine stopped"
            if not engine.running
            else f"Engine offline — last heartbeat {format_age(age)} ago",
        )
    elif status.state == "degraded":
        state, message = "warning", f"Heartbeat delayed — last one {format_age(age)} ago"
    elif not engine.trading_allowed:
        state, message = "warning", f"Running, trading halted: {engine.halt_reason or 'risk limit reached'}"
    else:
        state = "operational"
        message = f"Running — {engine.strategy} strategy on {len(engine.symbols)} symbol(s)"
    return ComponentHealth(
        key="bot",
        name="Trading engine",
        state=state,
        message=message,
        last_ok=engine.heartbeat_at,
        details=details,
    )


def api_health(
    process: ProcessStats, *, version: str, auth_enabled: bool, dashboard_served: bool
) -> ComponentHealth:
    return ComponentHealth(
        key="api",
        name="API server",
        state="operational",
        message=f"Serving v{version} — up {format_age(process.uptime_sec)}",
        last_ok=utcnow(),
        details={
            "pid": process.pid,
            "version": version,
            "auth_enabled": auth_enabled,
            "dashboard_served": dashboard_served,
        },
    )


def openrouter_health(
    *,
    configured: bool,
    usage: AIUsageStats,
    last_success_at: datetime | None,
    heuristic_fallback: bool,
) -> ComponentHealth:
    if not configured:
        return ComponentHealth(
            key="openrouter",
            name="OpenRouter (AI)",
            state="disabled",
            message="Not configured — local heuristic analyst in use",
        )
    details: dict[str, str | float | int | bool | None] = {
        "model": usage.model,
        "requests_today": usage.requests_today,
        "errors_today": usage.errors_today,
        "error_rate_pct": usage.error_rate_pct,
        "p95_latency_ms": usage.p95_latency_ms,
    }
    last_failed = usage.last_error_at is not None and (
        last_success_at is None or usage.last_error_at > last_success_at
    )
    if usage.requests_total == 0:
        state, message = "operational", f"Configured ({usage.model}) — no requests yet"
    elif last_failed:
        fallback = " — heuristic analyst answering" if heuristic_fallback else ""
        state, message = "error", f"Last request failed: {usage.last_error or 'unknown error'}{fallback}"
    elif usage.error_rate_pct >= OPENROUTER_ERROR_RATE_WARNING:
        state, message = "warning", f"High error rate: {usage.error_rate_pct:.0f}% over the last 24 h"
    else:
        latency = f", avg latency {usage.avg_latency_ms:.0f} ms" if usage.avg_latency_ms is not None else ""
        state, message = "operational", f"{usage.model}{latency}"
    return ComponentHealth(
        key="openrouter",
        name="OpenRouter (AI)",
        state=state,
        message=message,
        last_ok=last_success_at,
        latency_ms=usage.avg_latency_ms,
        details=details,
    )


def market_data_health(status: BotStatus, newest_tick: datetime | None, now: datetime) -> ComponentHealth:
    engine = status.engine
    name = "Market data"
    if engine is None:
        return ComponentHealth(
            key="market_data", name=name, state="error", message="No market data — engine not started"
        )
    feed = "Binance" if engine.feed == "binance" else "Simulated"
    tick_age = (now - newest_tick).total_seconds() if newest_tick else None
    details: dict[str, str | float | int | bool | None] = {
        "feed": engine.feed,
        "connected": engine.feed_connected,
        "last_tick_age_sec": round(tick_age, 1) if tick_age is not None else None,
        "symbols": ", ".join(engine.symbols),
    }
    if status.state == "offline":
        state, message = "error", "No live market data — engine offline"
    elif not engine.feed_connected:
        state = "error"
        message = f"{feed} feed disconnected" + (f": {engine.feed_message}" if engine.feed_message else "")
    elif tick_age is None or tick_age > TICK_STALE_SEC:
        last = f"last tick {format_age(tick_age)} ago" if tick_age is not None else "no ticks received"
        state, message = "error", f"Market data stale — {last}"
    elif engine.feed == "simulated" and engine.feed_message:
        state, message = "warning", engine.feed_message
    elif tick_age > TICK_DELAYED_SEC:
        state, message = "warning", f"Market data delayed — last tick {format_age(tick_age)} ago"
    elif engine.feed == "binance":
        state, message = "operational", "Binance live stream connected"
    else:
        state, message = "operational", "Simulated market feed"
    return ComponentHealth(
        key="market_data", name=name, state=state, message=message, last_ok=newest_tick, details=details
    )


def database_health(stats: DatabaseStats) -> ComponentHealth:
    slow = stats.query_latency_ms >= SLOW_QUERY_MS
    return ComponentHealth(
        key="database",
        name="Database",
        state="warning" if slow else "operational",
        message=(
            f"Slow queries ({stats.query_latency_ms:.0f} ms)"
            if slow
            else f"SQLite (WAL) — {stats.size_mb:.1f} MB"
        ),
        last_ok=utcnow(),
        latency_ms=stats.query_latency_ms,
        details={"size_mb": stats.size_mb, "events": stats.tables.get("events", 0)},
    )


def websocket_health(*, running: bool, clients: int, messages_sent: int, dropped: int) -> ComponentHealth:
    details: dict[str, str | float | int | bool | None] = {
        "clients": clients,
        "messages_sent": messages_sent,
        "frames_dropped": dropped,
    }
    if not running:
        return ComponentHealth(
            key="websocket",
            name="Live updates",
            state="error",
            message="Broadcaster stopped — dashboards receive no live updates",
            details=details,
        )
    return ComponentHealth(
        key="websocket",
        name="Live updates",
        state="operational",
        message=f"{clients} dashboard connection(s)",
        last_ok=utcnow(),
        details=details,
    )
