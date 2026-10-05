"""Backtest jobs: lifecycle, progress, cancellation, failures, restart recovery and validation.

``tradebot.backtest.run_backtest`` is replaced by fakes the test controls; most tests run
them on a thread pool, two use the real spawned process pool.
"""

from __future__ import annotations

import os
import threading
import time
from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import date, timedelta
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tradebot.api import backtests as jobs_module
from tradebot.api.backtests import INTERRUPTED_BY_RESTART, MAX_RESULT_CANDLES, BacktestJobs
from tradebot.api.main import create_app
from tradebot.db import Database, iso, utcnow
from tradebot.schemas import (
    BacktestMetrics,
    BacktestRequest,
    BacktestResult,
    BacktestRun,
    BacktestSummary,
    BacktestTrade,
    Candle,
    EquityPoint,
)

from .conftest import tune_for_tests

STRATEGIES = ("ai", "hybrid", "baseline")
TODAY = utcnow().date()


def body(**overrides: Any) -> dict[str, Any]:
    data = {
        "symbol": "BTC/USDT",
        "timeframe": "1h",
        "start": (TODAY - timedelta(days=60)).isoformat(),
        "end": (TODAY - timedelta(days=1)).isoformat(),
        "strategy": "hybrid",
    }
    data.update(overrides)
    return data


def make_run(strategy: str, offset: float) -> BacktestRun:
    curve = [
        EquityPoint(time=1_700_000_000 + i * 3_600, equity=10_000.0 + i, drawdown_pct=0.0)
        for i in range(3_000)
    ]
    trade = BacktestTrade(
        entry_time=1_700_000_000,
        exit_time=1_700_003_600,
        side="LONG",
        entry_price=100.0,
        exit_price=101.0,
        size=1.0,
        pnl=1.0,
        pnl_pct=1.0,
        exit_reason="TAKE_PROFIT",
        confidence=80.0,
    )
    return BacktestRun(
        strategy=strategy,
        metrics=BacktestMetrics(
            total_return_pct=5.0 + offset,
            net_profit=500.0 + offset,
            win_rate=55.0 + offset,
            profit_factor=1.4,
            max_drawdown_pct=-3.0 - offset,
            sharpe=1.1 + offset,
            trades=40 + int(offset),
        ),
        equity_curve=curve,
        trades=[trade],
        monthly=[],
        distribution=[],
    )


def fake_outcome(request: BacktestRequest) -> SimpleNamespace:
    """Shaped like ``tradebot.backtest.BacktestOutcome``; runs deliberately in a scrambled order."""
    strategies = STRATEGIES if request.compare else (request.strategy,)
    runs = [make_run(s, float(i)) for i, s in enumerate(strategies)]
    candles = [
        Candle(
            time=1_700_000_000 + i * 3_600,
            open=100 + i,
            high=101 + i,
            low=99 + i,
            close=100.5 + i,
            volume=2.0,
        )
        for i in range(5_000)
    ]
    return SimpleNamespace(runs=runs, candles=candles, data_source="simulated")


@dataclass
class FakeBacktest:
    """Stands in for ``run_backtest``: reports progress, then waits until released."""

    release: threading.Event = field(default_factory=threading.Event)
    started: threading.Event = field(default_factory=threading.Event)
    cancelled: threading.Event = field(default_factory=threading.Event)
    error: Exception | None = None
    calls: list[BacktestRequest] = field(default_factory=list)

    def __call__(
        self,
        request: BacktestRequest,
        progress: Callable[[float], None] | None = None,
        cancel: threading.Event | None = None,
    ) -> SimpleNamespace:
        assert progress is not None and cancel is not None
        self.calls.append(request)
        progress(0.25)
        self.started.set()
        while not self.release.wait(0.01):
            progress(0.5)
            if cancel.is_set():
                self.cancelled.set()
                return fake_outcome(request)  # whatever it returns is discarded
        if self.error is not None:
            raise self.error
        progress(1.0)
        return fake_outcome(request)


@pytest.fixture
def fake() -> Iterator[FakeBacktest]:
    runner = FakeBacktest()
    yield runner
    runner.release.set()


@pytest.fixture
def client(
    app: Any, db: Database, fake: FakeBacktest, monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    monkeypatch.setattr(jobs_module, "PROGRESS_INTERVAL_SEC", 0.02)
    app.state.ctx.jobs = BacktestJobs(db, executor_factory=lambda: ThreadPoolExecutor(2), runner=fake)
    with TestClient(app) as test_client:
        yield test_client


def poll(
    client: TestClient, job_id: str, until: Callable[[BacktestResult], bool], timeout: float = 5.0
) -> BacktestResult:
    deadline = time.monotonic() + timeout
    while True:
        response = client.get(f"/api/backtests/{job_id}")
        assert response.status_code == 200, response.json()
        result = BacktestResult.model_validate(response.json())
        if until(result):
            return result
        assert time.monotonic() < deadline, f"backtest stuck at {result.status} {result.progress}"
        time.sleep(0.02)


# --------------------------------------------------------------------------
# Lifecycle
# --------------------------------------------------------------------------


def test_queued_running_completed(client: TestClient, fake: FakeBacktest) -> None:
    response = client.post("/api/backtests", json=body())
    assert response.status_code == 202
    queued = BacktestSummary.model_validate(response.json())
    assert queued.id.startswith("bt_") and len(queued.id) == 15
    assert (queued.status, queued.progress, queued.trades, queued.finished_at) == ("queued", 0.0, None, None)

    assert fake.started.wait(5)
    running = poll(client, queued.id, lambda r: r.status == "running" and r.progress >= 25.0)
    assert running.runs == [] and running.request.strategy == "hybrid"

    fake.release.set()
    done = poll(client, queued.id, lambda r: r.status == "completed")
    assert done.progress == 100.0 and done.finished_at is not None and done.error is None
    assert done.duration_ms is not None and done.duration_ms >= 0 and done.data_source == "simulated"
    # the requested strategy comes first and fills the summary
    assert [r.strategy for r in done.runs] == ["hybrid", "ai", "baseline"]
    hybrid = done.runs[0].metrics
    assert (done.total_return_pct, done.win_rate, done.max_drawdown_pct, done.sharpe, done.trades) == (
        hybrid.total_return_pct,
        hybrid.win_rate,
        hybrid.max_drawdown_pct,
        hybrid.sharpe,
        hybrid.trades,
    )
    # heavy series are compacted for the browser
    assert all(len(r.equity_curve) == 2_000 for r in done.runs)
    assert done.runs[0].equity_curve[-1].time == 1_700_000_000 + 2_999 * 3_600
    assert len(done.candles) <= MAX_RESULT_CANDLES
    first = done.candles[0]
    assert (first.time, first.open, first.close, first.volume) == (1_700_000_000, 100.0, 102.5, 6.0)
    assert first.high == 103.0 and first.low == 99.0

    listing = [BacktestSummary.model_validate(s) for s in client.get("/api/backtests").json()]
    assert [(s.id, s.status, s.trades) for s in listing] == [(queued.id, "completed", hybrid.trades)]

    assert client.delete(f"/api/backtests/{queued.id}").status_code == 204
    assert client.get(f"/api/backtests/{queued.id}").status_code == 404
    assert client.delete(f"/api/backtests/{queued.id}").status_code == 404


def test_a_single_strategy_run(client: TestClient, fake: FakeBacktest) -> None:
    fake.release.set()
    job = client.post("/api/backtests", json=body(strategy="baseline", compare=False)).json()
    done = poll(client, job["id"], lambda r: r.status == "completed")
    assert [r.strategy for r in done.runs] == ["baseline"]


def test_the_list_is_newest_first(client: TestClient, fake: FakeBacktest) -> None:
    fake.release.set()
    ids = [client.post("/api/backtests", json=body()).json()["id"] for _ in range(3)]
    for job_id in ids:
        poll(client, job_id, lambda r: r.status == "completed")
    assert [s["id"] for s in client.get("/api/backtests").json()] == ids[::-1]


def test_a_failing_run_is_recorded(client: TestClient, fake: FakeBacktest) -> None:
    fake.error = ValueError("No market data for BTC/USDT before 2017-08-17")
    fake.release.set()
    job = client.post("/api/backtests", json=body()).json()
    failed = poll(client, job["id"], lambda r: r.status == "failed")
    assert failed.error == "ValueError: No market data for BTC/USDT before 2017-08-17"
    assert failed.finished_at is not None and failed.runs == []


def test_deleting_a_running_job_cancels_it(client: TestClient, db: Database, fake: FakeBacktest) -> None:
    job = client.post("/api/backtests", json=body()).json()
    assert fake.started.wait(5)
    poll(client, job["id"], lambda r: r.status == "running")
    assert client.delete(f"/api/backtests/{job['id']}").status_code == 204
    assert fake.cancelled.wait(5), "the worker never noticed the deletion"
    time.sleep(0.1)
    assert db.read_one("SELECT COUNT(*) AS n FROM backtests")["n"] == 0  # nothing written back


def test_too_many_active_jobs(client: TestClient, fake: FakeBacktest) -> None:
    for _ in range(jobs_module.MAX_ACTIVE_JOBS):
        assert client.post("/api/backtests", json=body()).status_code == 202
    refused = client.post("/api/backtests", json=body())
    assert refused.status_code == 429 and "already queued or running" in refused.json()["detail"]
    fake.release.set()


def test_symbol_is_normalized_before_running(client: TestClient, fake: FakeBacktest) -> None:
    fake.release.set()
    job = client.post("/api/backtests", json=body(symbol=" eth/usdt ")).json()
    assert job["symbol"] == "ETH/USDT"
    poll(client, job["id"], lambda r: r.status == "completed")
    assert fake.calls[0].symbol == "ETH/USDT"


def test_unknown_jobs_are_404(client: TestClient) -> None:
    assert client.get("/api/backtests/bt_000000000000").status_code == 404
    assert client.delete("/api/backtests/bt_000000000000").status_code == 404


@pytest.mark.parametrize(
    ("overrides", "loc"),
    [
        ({"end": (TODAY + timedelta(days=1)).isoformat()}, "end"),
        (
            {
                "start": (TODAY - timedelta(days=5)).isoformat(),
                "end": (TODAY - timedelta(days=5)).isoformat(),
            },
            "end",
        ),
        ({"start": (TODAY - timedelta(days=4 * 365)).isoformat()}, "start"),
        ({"timeframe": "1m", "start": (TODAY - timedelta(days=200)).isoformat()}, "timeframe"),
        ({"symbol": "BTCUSDT"}, "symbol"),
        ({"timeframe": "2h"}, "timeframe"),
        ({"strategy": "momentum"}, "strategy"),
        ({"risk_pct": 10}, "risk_pct"),
        ({"starting_balance": 0}, "starting_balance"),
        ({"min_risk_reward": 0.1}, "min_risk_reward"),
        ({"start": None}, "start"),
    ],
)
def test_invalid_requests_are_rejected(
    client: TestClient, fake: FakeBacktest, overrides: dict, loc: str
) -> None:
    response = client.post("/api/backtests", json=body(**overrides))
    assert response.status_code == 422
    assert loc in [error["loc"][-1] for error in response.json()["detail"]]
    assert fake.calls == [] and client.get("/api/backtests").json() == []


# --------------------------------------------------------------------------
# Restart recovery
# --------------------------------------------------------------------------


def insert_job(db: Database, job_id: str, status: str) -> None:
    request = BacktestRequest(start=date(2026, 1, 1), end=date(2026, 2, 1))
    summary = BacktestSummary(
        id=job_id,
        created_at=utcnow(),
        status=status,
        progress=40.0 if status == "running" else 0.0,
        symbol=request.symbol,
        timeframe=request.timeframe,
        start=request.start,
        end=request.end,
        strategy=request.strategy,
    )
    result = BacktestResult(**summary.model_dump(), request=request)
    with db.tx() as conn:
        conn.execute(
            "INSERT INTO backtests(id, created_at, status, progress, summary, result) VALUES (?, ?, ?, ?, ?, ?)",
            (
                job_id,
                iso(summary.created_at),
                status,
                summary.progress,
                summary.model_dump_json(),
                result.model_dump_json(),
            ),
        )


def test_jobs_interrupted_by_a_restart_are_failed_on_startup(config: Any, db: Database) -> None:
    insert_job(db, "bt_00000000000a", "queued")
    insert_job(db, "bt_00000000000b", "running")
    insert_job(db, "bt_00000000000c", "failed")
    with TestClient(tune_for_tests(create_app(config, db))) as client:
        jobs = {s["id"]: s for s in client.get("/api/backtests").json()}
    assert {k: (v["status"], v["error"]) for k, v in jobs.items()} == {
        "bt_00000000000a": ("failed", INTERRUPTED_BY_RESTART),
        "bt_00000000000b": ("failed", INTERRUPTED_BY_RESTART),
        "bt_00000000000c": ("failed", None),
    }
    assert jobs["bt_00000000000b"]["progress"] == 40.0 and jobs["bt_00000000000b"]["finished_at"] is not None


# --------------------------------------------------------------------------
# The real process pool
# --------------------------------------------------------------------------


def process_runner(
    request: BacktestRequest, progress: Callable[[float], None] | None = None, cancel: Any = None
) -> SimpleNamespace:
    """Picklable stand-in for run_backtest, executed in a spawned worker process."""
    assert progress is not None
    progress(0.5)
    return fake_outcome(request)


def crashing_runner(request: BacktestRequest, progress: Any = None, cancel: Any = None) -> None:
    os._exit(3)  # the worker process dies without a word


def wait_job(jobs: BacktestJobs, job_id: str, status: str, timeout: float = 60.0) -> BacktestResult:
    deadline = time.monotonic() + timeout
    while (result := jobs.get(job_id)) is not None and result.status != status:
        assert time.monotonic() < deadline, f"{job_id} stuck at {result.status}"
        time.sleep(0.05)
    assert result is not None
    return result


def test_jobs_run_in_spawned_worker_processes(db: Database) -> None:
    jobs = BacktestJobs(db, max_workers=1, runner=process_runner)
    try:
        request = BacktestRequest.model_validate(body())
        done = wait_job(jobs, jobs.submit(request).id, "completed")
        assert [r.strategy for r in done.runs] == [
            "hybrid",
            "ai",
            "baseline",
        ] and done.data_source == "simulated"
    finally:
        jobs.shutdown()


def test_a_crashed_worker_fails_its_job_and_the_pool_recovers(db: Database) -> None:
    crashing = BacktestJobs(db, max_workers=1, runner=crashing_runner)
    try:
        failed = wait_job(crashing, crashing.submit(BacktestRequest.model_validate(body())).id, "failed")
        assert failed.error is not None and failed.error.startswith("Backtest worker crashed")
        crashing._runner = process_runner  # same job manager, next job, fresh pool
        done = wait_job(crashing, crashing.submit(BacktestRequest.model_validate(body())).id, "completed")
        assert done.runs
    finally:
        crashing.shutdown()


def test_a_missing_backtester_fails_the_job_with_a_clear_reason(
    db: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    def unavailable() -> None:
        raise ImportError("cannot import name 'run_backtest' from 'tradebot.backtest'")

    monkeypatch.setattr(jobs_module, "_default_runner", unavailable)
    insert_job(db, "bt_0000000000ff", "queued")
    jobs_module.run_backtest_job(str(db.path), "bt_0000000000ff")
    failed = BacktestJobs(db).get("bt_0000000000ff")
    assert failed is not None and failed.status == "failed"
    assert (
        failed.error == "Backtester unavailable: cannot import name 'run_backtest' from 'tradebot.backtest'"
    )
