"""Backtest jobs behind ``/api/backtests``.

A job is a row in ``backtests`` (owned by the API). ``POST`` inserts it as ``queued`` and
hands it to a process pool of spawned workers, so a CPU-bound backtest never stalls the
API's event loop or the trading engine. The worker opens its own database connection,
claims the row (``running``), runs :func:`tradebot.backtest.run_backtest` with a throttled
progress callback, and stores the summary and full result (``completed``) or the error
(``failed``).

Deleting a job removes its row; a worker running it notices at its next progress report,
sets the cancel flag and exits without writing. Rows a previous API process left
``queued`` or ``running`` are failed on startup ("Interrupted by restart"); a worker
process that dies takes its job down as failed, and the pool is rebuilt.

Columns are the source of truth for ``status`` / ``progress`` / ``error``; ``summary`` holds
the rest of the ``BacktestSummary`` and ``result`` the ``BacktestResult`` (request only until
the job completes).
"""

from __future__ import annotations

import logging
import math
import multiprocessing
import secrets
import threading
import time
from collections.abc import Callable, Sequence
from concurrent.futures import Executor, Future, ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from functools import partial
from typing import Any

from ..analytics import metrics
from ..db import Database, iso, utcnow
from ..schemas import BacktestRequest, BacktestResult, BacktestRun, BacktestSummary, Candle

log = logging.getLogger("tradebot.api.backtests")

MAX_ACTIVE_JOBS = 8
MAX_WORKERS = 2
LIST_LIMIT = 100
MAX_RESULT_CANDLES = 2_000
MAX_CURVE_POINTS = 2_000
PROGRESS_INTERVAL_SEC = 0.5
INTERRUPTED_BY_RESTART = "Interrupted by restart"
INTERRUPTED_BY_SHUTDOWN = "Interrupted by shutdown"

Runner = Callable[..., Any]


class TooManyBacktests(Exception):
    """Raised when MAX_ACTIVE_JOBS jobs are already queued or running (HTTP 429)."""


def new_job_id() -> str:
    return f"bt_{secrets.token_hex(6)}"


def _summary_from_row(row: Any) -> BacktestSummary:
    summary = BacktestSummary.model_validate_json(row["summary"])
    return summary.model_copy(
        update={"status": row["status"], "progress": row["progress"], "error": row["error"]}
    )


def _result_from_row(row: Any) -> BacktestResult:
    summary = _summary_from_row(row)
    result = BacktestResult.model_validate_json(row["result"])
    return result.model_copy(update=summary.model_dump())


def _fail(db: Database, job_id: str, message: str) -> bool:
    """Mark a queued / running job failed; False when it is gone or already finished."""
    row = db.read_one("SELECT summary FROM backtests WHERE id = ?", (job_id,))
    if row is None:
        return False
    summary = BacktestSummary.model_validate_json(row["summary"]).model_copy(
        update={"status": "failed", "error": message, "finished_at": utcnow()}
    )
    with db.tx() as conn:
        changed = conn.execute(
            "UPDATE backtests SET status = 'failed', error = ?, summary = ? "
            "WHERE id = ? AND status IN ('queued', 'running')",
            (message, summary.model_dump_json(), job_id),
        ).rowcount
    return bool(changed)


class BacktestJobs:
    """Job bookkeeping in the API process. Thread-safe."""

    def __init__(
        self,
        db: Database,
        *,
        max_workers: int = MAX_WORKERS,
        executor_factory: Callable[[], Executor] | None = None,
        runner: Runner | None = None,
    ):
        self.db = db
        self.max_workers = max_workers
        self._factory = executor_factory or self._process_pool
        # None: the worker imports tradebot.backtest.run_backtest itself (process pools
        # can only ship picklable callables; tests inject a fake with a thread pool)
        self._runner = runner
        self._executor: Executor | None = None
        self._lock = threading.Lock()
        self._closing = False

    def _process_pool(self) -> Executor:
        return ProcessPoolExecutor(
            max_workers=self.max_workers, mp_context=multiprocessing.get_context("spawn")
        )

    # -- lifecycle -------------------------------------------------------------

    def recover(self) -> int:
        """Fail the jobs a previous API process left behind; returns how many."""
        rows = self.db.read("SELECT id FROM backtests WHERE status IN ('queued', 'running')")
        failed = sum(1 for row in rows if _fail(self.db, row["id"], INTERRUPTED_BY_RESTART))
        if failed:
            log.warning("Marked %d interrupted backtest(s) as failed", failed)
        return failed

    def shutdown(self) -> None:
        with self._lock:
            self._closing = True
            executor, self._executor = self._executor, None
        if executor is None:
            return
        # Running backtests can take minutes; do not hold the API's shutdown hostage.
        # (ProcessPoolExecutor keeps its workers in ``_processes``; thread pools have none.)
        workers = getattr(executor, "_processes", None)
        processes = list(workers.values()) if isinstance(workers, dict) else []
        executor.shutdown(wait=False, cancel_futures=True)
        for process in processes:
            if process.is_alive():
                process.terminate()

    # -- operations ------------------------------------------------------------

    def submit(self, request: BacktestRequest) -> BacktestSummary:
        with self._lock:
            active = self.db.read_one(
                "SELECT COUNT(*) AS n FROM backtests WHERE status IN ('queued', 'running')"
            )["n"]
            if active >= MAX_ACTIVE_JOBS:
                raise TooManyBacktests(
                    f"{active} backtests are already queued or running; wait for one to finish"
                )
            now = utcnow()
            summary = BacktestSummary(
                id=new_job_id(),
                created_at=now,
                status="queued",
                progress=0.0,
                symbol=request.symbol,
                timeframe=request.timeframe,
                start=request.start,
                end=request.end,
                strategy=request.strategy,
            )
            result = BacktestResult(**summary.model_dump(), request=request)
            with self.db.tx() as conn:
                conn.execute(
                    "INSERT INTO backtests(id, created_at, status, progress, summary, result, error) "
                    "VALUES (?, ?, 'queued', 0, ?, ?, NULL)",
                    (summary.id, iso(now), summary.model_dump_json(), result.model_dump_json()),
                )
            try:
                future = self._submit_locked(summary.id)
            except Exception as exc:
                _fail(self.db, summary.id, f"Could not start the backtest worker: {exc}")
                raise
        future.add_done_callback(partial(self._on_done, summary.id))
        return summary

    def _submit_locked(self, job_id: str) -> Future[None]:
        task = (run_backtest_job, str(self.db.path), job_id, self._runner)
        for attempt in (1, 2):
            if self._executor is None:
                self._executor = self._factory()
            try:
                return self._executor.submit(*task)
            except BrokenProcessPool:
                self._executor = None
                if attempt == 2:
                    raise
        raise AssertionError("unreachable")

    def _on_done(self, job_id: str, future: Future[None]) -> None:
        if future.cancelled():
            return  # cancelled at shutdown: the next start fails it as interrupted
        exc = future.exception()
        if exc is None:
            return
        message = INTERRUPTED_BY_SHUTDOWN if self._closing else f"Backtest worker crashed: {exc}"
        if _fail(self.db, job_id, message) and not self._closing:
            log.error("Backtest %s failed in its worker: %s", job_id, exc)
        if isinstance(exc, BrokenProcessPool):
            with self._lock:
                broken, self._executor = self._executor, None
            if broken is not None:
                broken.shutdown(wait=False, cancel_futures=True)

    def list(self, limit: int = LIST_LIMIT) -> list[BacktestSummary]:
        rows = self.db.read(
            "SELECT status, progress, error, summary FROM backtests ORDER BY created_at DESC LIMIT ?",
            (limit,),
        )
        return [_summary_from_row(r) for r in rows]

    def get(self, job_id: str) -> BacktestResult | None:
        row = self.db.read_one(
            "SELECT status, progress, error, summary, result FROM backtests WHERE id = ?", (job_id,)
        )
        return _result_from_row(row) if row else None

    def delete(self, job_id: str) -> bool:
        with self.db.tx() as conn:
            return bool(conn.execute("DELETE FROM backtests WHERE id = ?", (job_id,)).rowcount)


# --------------------------------------------------------------------------
# Worker side (runs in a spawned process)
# --------------------------------------------------------------------------


def run_backtest_job(db_path: str, job_id: str, runner: Runner | None = None) -> None:
    """Process-pool entry point: run one queued job to completion. Top-level, so picklable."""
    db = Database(db_path)
    try:
        if runner is None:
            try:
                runner = _default_runner()
            except ImportError as exc:
                log.error("Backtester unavailable: %s", exc)
                _fail(db, job_id, f"Backtester unavailable: {exc}")
                return
        _run_job(db, job_id, runner)
    finally:
        db.close()


def _default_runner() -> Runner:
    from ..backtest import run_backtest  # the trading core is only needed inside workers

    return run_backtest


def to_percent(value: float) -> float:
    """Progress callbacks report a fraction (0–1); the contract stores percent (0–100)."""
    if not math.isfinite(value):
        return 0.0
    return min(100.0, max(0.0, value * 100.0))


class _ProgressReporter:
    """The ``progress`` callback: throttled writes, and the cancellation check."""

    def __init__(self, db: Database, job_id: str, cancel: threading.Event):
        self.db = db
        self.job_id = job_id
        self.cancel = cancel
        self._last_write = -math.inf

    def __call__(self, fraction: float) -> None:
        if self.cancel.is_set():
            return
        now = time.monotonic()
        if now - self._last_write < PROGRESS_INTERVAL_SEC:
            return
        self._last_write = now
        with self.db.tx() as conn:
            alive = conn.execute(
                "UPDATE backtests SET progress = ? WHERE id = ? AND status = 'running'",
                (round(to_percent(fraction), 1), self.job_id),
            ).rowcount
        if not alive:
            self.cancel.set()  # deleted (or failed elsewhere): stop working on it


def _run_job(db: Database, job_id: str, runner: Runner) -> None:
    row = db.read_one("SELECT summary, result FROM backtests WHERE id = ?", (job_id,))
    if row is None:
        return  # deleted while queued
    queued = BacktestResult.model_validate_json(row["result"])
    running = BacktestSummary.model_validate_json(row["summary"]).model_copy(update={"status": "running"})
    with db.tx() as conn:
        claimed = conn.execute(
            "UPDATE backtests SET status = 'running', summary = ? WHERE id = ? AND status = 'queued'",
            (running.model_dump_json(), job_id),
        ).rowcount
    if not claimed:
        return

    cancel = threading.Event()
    started = time.perf_counter()
    try:
        outcome = runner(queued.request, progress=_ProgressReporter(db, job_id, cancel), cancel=cancel)
    except Exception as exc:
        if not cancel.is_set():
            log.exception("Backtest %s failed", job_id)
            _fail(db, job_id, f"{type(exc).__name__}: {exc}" if str(exc) else type(exc).__name__)
        return
    if cancel.is_set():
        return
    try:
        summary, result = completed(
            running, queued.request, outcome, int((time.perf_counter() - started) * 1000)
        )
    except Exception as exc:
        log.exception("Backtest %s returned an unusable result", job_id)
        _fail(db, job_id, f"Invalid backtest result: {exc}")
        return
    with db.tx() as conn:
        conn.execute(
            "UPDATE backtests SET status = 'completed', progress = 100, error = NULL, summary = ?, result = ? "
            "WHERE id = ? AND status = 'running'",
            (summary.model_dump_json(), result.model_dump_json(), job_id),
        )


def completed(
    running: BacktestSummary, request: BacktestRequest, outcome: Any, duration_ms: int
) -> tuple[BacktestSummary, BacktestResult]:
    """Summary and result of a finished run (``outcome`` is a ``tradebot.backtest.BacktestOutcome``)."""
    runs = [BacktestRun.model_validate(r, from_attributes=True) for r in outcome.runs]
    runs.sort(key=lambda r: r.strategy != request.strategy)  # requested strategy first (stable sort)
    primary = runs[0].metrics if runs else None
    summary = running.model_copy(
        update={
            "status": "completed",
            "progress": 100.0,
            "finished_at": utcnow(),
            "error": None,
            "total_return_pct": primary.total_return_pct if primary else None,
            "win_rate": primary.win_rate if primary else None,
            "max_drawdown_pct": primary.max_drawdown_pct if primary else None,
            "sharpe": primary.sharpe if primary else None,
            "trades": primary.trades if primary else None,
        }
    )
    result = BacktestResult(
        **summary.model_dump(),
        request=request,
        data_source=outcome.data_source,
        duration_ms=duration_ms,
        candles=compact_candles(list(outcome.candles), MAX_RESULT_CANDLES),
        runs=[_compact_run(r) for r in runs],
    )
    return summary, result


def compact_candles(candles: Sequence[Candle], max_candles: int) -> list[Candle]:
    """Merge consecutive candles (OHLCV-correct) until at most ``max_candles`` remain."""
    if len(candles) <= max_candles:
        return list(candles)
    size = math.ceil(len(candles) / max_candles)
    merged: list[Candle] = []
    for i in range(0, len(candles), size):
        group = candles[i : i + size]
        merged.append(
            Candle(
                time=group[0].time,
                open=group[0].open,
                high=max(c.high for c in group),
                low=min(c.low for c in group),
                close=group[-1].close,
                volume=sum(c.volume for c in group),
            )
        )
    return merged


def _compact_run(run: BacktestRun) -> BacktestRun:
    if len(run.equity_curve) <= MAX_CURVE_POINTS:
        return run
    return run.model_copy(update={"equity_curve": metrics.downsample(run.equity_curve, MAX_CURVE_POINTS)})
