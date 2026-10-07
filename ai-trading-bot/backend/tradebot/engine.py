"""Live engine: market feed → trading core → store, plus heartbeat, settings reload and upkeep.

Start-up
    1. Initialise the database and load the settings (seeding defaults on a fresh install).
    2. Pick the feed: ``FEED=simulated`` uses the simulator; ``FEED=binance`` retries Binance
       with backoff until it answers; ``FEED=auto`` probes Binance with short timeouts and falls
       back to the simulator (``SYSTEM_WARNING`` + ``MARKET_DATA_UNAVAILABLE``). A database
       that already holds simulated market data stays on the simulator under ``auto`` so real
       and simulated prices never mix in one history.
    3. Persist the feed's history, then one of:
       - **bootstrap** (simulator + empty database): replay the last ``SIM_BOOTSTRAP_DAYS`` of
         simulated 1m candles through the same trading core on a virtual clock, heuristic
         analyst only. Decisions, trades, equity and events get historical timestamps,
         notifications are created read, ``MARKET_UPDATE`` events are skipped, and a
         ``SYSTEM_INFO`` summary announces the result;
       - **resume** (existing database): reload positions, P&L, the day's numbers, halts and
         pending signal evaluations, warm the indicators from stored candles and replay the
         candles missed while offline in catch-up mode (stops and targets fill, no new calls);
       - **warm-up** (Binance + empty database): indicators from the backfill only.

Cadence while running
    - every tick: forming candles, mark-to-market, stops / targets / time exits;
    - every 1m close: indicators, MTF report, shadow evaluations; on a decision-timeframe
      close the decision cycle (a remote analyst is awaited off the event path);
    - about once a second: forming candle upserts and the ticker / portfolio / positions
      snapshots in one transaction;
    - every ~2 s: heartbeat (``status`` with CPU / RSS and the applied settings version) and
      ``risk``, plus a check for a new settings version (applied live, symbols included);
    - every 60 s: an equity snapshot; hourly: retention housekeeping.

The daily UTC rollover happens inside the core on the first input of a new day. SIGINT /
SIGTERM stop the engine gracefully (final equity snapshot, ``running: false`` status).
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import random
import time
from collections.abc import Awaitable, Callable, Mapping, Sequence
from datetime import UTC, datetime
from typing import Any

import psutil

from .ai import build_analyst
from .ai.base import Analyst, AnalystResult
from .ai.heuristic import HeuristicAnalyst
from .ai.openrouter import OpenRouterAnalyst
from .ai.pricing import refresh_live_prices
from .config import VERSION, EnvConfig
from .core import CoreConfig, PendingDecision, TradingCore
from .db import Database, utcnow
from .market.binance import BinanceFeed
from .market.candles import CandleArrays
from .market.feed import (
    CandleEvent,
    Feed,
    FeedEvent,
    FeedUnavailable,
    MarketHistory,
    StatusEvent,
    StoredMarket,
    TickerEvent,
    TickEvent,
)
from .market.simulated import SimulatedFeed
from .market.symbols import normalize
from .notify import Notifier
from .schemas import BotSettings, Candle, EngineStatus, FeedKind, FeedSetting, Ticker
from .store import META_BOOTSTRAP, CandleRow, Store, candle_row

log = logging.getLogger(__name__)

DAY = 86_400
FLUSH_EVERY = 1.0
HEARTBEAT_EVERY = 2.0
EQUITY_EVERY = 60.0
HOUSEKEEPING_EVERY = 3600.0
AUTO_PROBE_TIMEOUT = 90.0  # upper bound for the Binance probe + backfill under FEED=auto
BINANCE_RETRY_MAX = 60.0
BOOTSTRAP_FLUSH_BATCHES = 3000
WARMUP_DEPTH = 600
WARMUP_DEPTH_1M = 1500  # a full UTC day of 1m candles rebuilds the forming 1d candle exactly
SPARKLINE_POINTS = 24
WARNING_EVERY = 600.0  # seconds between repeated engine warnings of one kind
META_FEED = "engine.feed"


def _ts(unix: float) -> datetime:
    return datetime.fromtimestamp(unix, UTC)


class _Buffer:
    """Collects core batches and writes them in large transactions (bootstrap replay)."""

    def __init__(self, store: Store, size: int = BOOTSTRAP_FLUSH_BATCHES) -> None:
        self.store = store
        self.size = size
        self.batches: list = []

    def write(self, batch) -> None:
        self.batches.append(batch)
        if len(self.batches) >= self.size:
            self.flush()

    def flush(self) -> None:
        if self.batches:
            self.store.write_many(self.batches)
            self.batches = []


class Engine:
    def __init__(
        self,
        cfg: EnvConfig,
        db: Database,
        *,
        feed: FeedSetting | None = None,
        bootstrap_days: int | None = None,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.cfg = cfg
        self.db = db
        self.store = Store(db)
        self.feed_setting: FeedSetting = feed or cfg.feed
        self.bootstrap_days = cfg.sim_bootstrap_days if bootstrap_days is None else max(0, bootstrap_days)
        self.clock = clock
        self.settings = BotSettings()
        self.started_at = utcnow()
        self.process = psutil.Process()
        self.feed: Feed | None = None
        self.core: TradingCore | None = None
        self.analyst: Analyst = HeuristicAnalyst()
        self.notifier: Notifier | None = None
        self.bootstrap_info: dict[str, Any] | None = None
        self._stop = asyncio.Event()
        self._queue: asyncio.Queue[FeedEvent] = asyncio.Queue()
        self._tasks: list[asyncio.Task] = []
        self._analysis_tasks: dict[str, asyncio.Task] = {}
        self._candle_rows: dict[tuple[str, str, int], CandleRow] = {}
        self._tickers: dict[str, Ticker] = {}
        self._fresh_tickers: set[str] = set()
        self._retiring: set[str] = set()
        self._warned: dict[str, float] = {}
        self._sim_state_saved: str | None = None
        self._feed_connected: bool | None = None
        self._phase: str | None = "Starting"

    # ------------------------------------------------------------------
    # lifecycle
    # ------------------------------------------------------------------

    async def run(self) -> None:
        """Start, trade until ``stop()`` is called, then shut down cleanly."""
        try:
            await self.start()
        except _Stopped:
            log.info("Stopped during start-up")
            return
        try:
            await self._stop.wait()
        finally:
            await self.shutdown()

    def stop(self) -> None:
        self._stop.set()

    async def start(self) -> None:
        if self.cfg.trading_mode == "live":
            raise RuntimeError(
                "TRADING_MODE=live is not implemented in this build: only paper trading is supported"
            )
        self.db.init()
        self.settings = self.db.get_settings()
        self.started_at = utcnow()
        fresh = self.store.is_empty()
        symbols = self._wanted_symbols()
        stored = StoredMarket() if fresh else self.store.stored_market(symbols)
        log.info(
            "Starting engine v%s: %s database, feed=%s, symbols=%s",
            VERSION,
            "fresh" if fresh else "existing",
            self.feed_setting,
            ", ".join(symbols),
        )

        self.feed, history = await self._open_feed(symbols, stored, fresh)
        rows = self.store.write_history(history)
        self.store.set_meta(META_FEED, self.feed.kind)
        self._save_sim_state()
        log.info("Feed %s ready: %d historical candles stored", self.feed.kind, rows)

        self.analyst = build_analyst(self.cfg, self.settings.ai)
        self.notifier = Notifier.from_config(
            self.cfg, self.settings.notifications, on_failure=self._channel_failed
        )
        self.store.on_notifications = self.notifier.dispatch
        self.core = TradingCore(
            self.settings,
            CoreConfig(
                starting_balance=self.cfg.starting_balance,
                mode=self.cfg.trading_mode,
                defer_remote_analysis=True,
            ),
            self.analyst,
            self.store,
        )
        if fresh and self.feed.kind == "simulated" and self.bootstrap_days > 0:
            self._bootstrap(history)
        elif fresh:
            self._warm_from_history(history)
        else:
            self._resume(history, stored)
        self._phase = None

        now = utcnow()
        self._publish_snapshots(now)
        self.core.record_equity(now)
        self.store.event(
            "SYSTEM_INFO",
            "Engine started",
            f"Paper trading {', '.join(self.settings.trading.symbols)} on the {self._feed_label()} · "
            f"strategy {self.settings.trading.strategy} · analyst {self.core.last_model}",
            data={"component": "engine", "feed": self.feed.kind, "version": VERSION},
        )
        if isinstance(self.analyst, OpenRouterAnalyst):
            self._spawn(refresh_live_prices(self.cfg.openrouter_base_url))
        self._tasks = [
            asyncio.create_task(self._feed_loop(), name="feed"),
            asyncio.create_task(self._consume(), name="consume"),
            asyncio.create_task(self._every(FLUSH_EVERY, self._flush_live, offset=0.35), name="flush"),
            asyncio.create_task(self._every(HEARTBEAT_EVERY, self._heartbeat), name="heartbeat"),
            asyncio.create_task(self._every(EQUITY_EVERY, self._record_equity), name="equity"),
            asyncio.create_task(
                self._every(HOUSEKEEPING_EVERY, self._housekeeping, first=60.0), name="housekeeping"
            ),
        ]
        log.info("Engine running (%s feed, strategy %s)", self.feed.kind, self.settings.trading.strategy)

    async def shutdown(self) -> None:
        log.info("Stopping engine")
        tasks = [*self._tasks, *self._analysis_tasks.values()]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self._tasks = []
        now = utcnow()
        if self.core is not None:
            with contextlib.suppress(Exception):
                self._flush_live()
                self.core.record_equity(now)
                self._save_sim_state()
                self.store.put_live("status", self._status(now, running=False))
                self.store.event(
                    "SYSTEM_INFO",
                    "Engine stopped",
                    "The trading engine shut down cleanly; open positions are kept and resume on restart.",
                    data={"component": "engine"},
                )
        if self.feed is not None:
            with contextlib.suppress(Exception):
                await self.feed.close()
        if self.notifier is not None:
            with contextlib.suppress(Exception):
                await self.notifier.aclose()
        if isinstance(self.analyst, OpenRouterAnalyst):
            with contextlib.suppress(Exception):
                await self.analyst.client.aclose()
        log.info("Engine stopped")

    # ------------------------------------------------------------------
    # feed selection
    # ------------------------------------------------------------------

    def _wanted_symbols(self) -> list[str]:
        """Configured symbols plus any symbol that still has an open position."""
        symbols = [normalize(s) for s in self.settings.trading.symbols]
        for row in self.db.read("SELECT DISTINCT symbol FROM positions"):
            if row["symbol"] not in symbols:
                symbols.append(row["symbol"])
        return list(dict.fromkeys(symbols))

    async def _open_feed(
        self, symbols: list[str], stored: StoredMarket, fresh: bool
    ) -> tuple[Feed, MarketHistory]:
        setting = self.feed_setting
        previous = None if fresh else self.store.get_meta(META_FEED)
        if setting == "auto" and previous == "simulated":
            log.info(
                "The stored market data is simulated: staying on the simulator (reset the database to switch)"
            )
            setting = "simulated"
        if setting == "binance" and previous == "simulated":
            self.store.event(
                "SYSTEM_WARNING",
                "Switching a simulated history to Binance",
                "The stored market data comes from the simulator; Binance prices will not continue it. "
                "Reset the database to start a clean Binance history.",
                severity="warning",
                data={"component": "market_data"},
            )
        if setting in ("auto", "binance"):
            attempt = 0
            while True:
                auto = setting == "auto"
                feed = BinanceFeed(
                    self.cfg.binance_rest_url,
                    self.cfg.binance_ws_url,
                    connect_timeout=3.0 if auto else 5.0,
                    ws_open_timeout=5.0 if auto else 10.0,
                )
                try:
                    history = await asyncio.wait_for(feed.open(symbols, stored), timeout=AUTO_PROBE_TIMEOUT)
                    return feed, history
                except (FeedUnavailable, TimeoutError) as exc:
                    with contextlib.suppress(Exception):
                        await feed.close()
                    reason = str(exc) or "no answer"
                    if auto:
                        self._market_data_unavailable(reason, fallback=True)
                        break
                    attempt += 1
                    delay = min(BINANCE_RETRY_MAX, 2.0**attempt) * random.uniform(0.75, 1.0)
                    log.warning("Binance unavailable (%s); retrying in %.0f s", reason, delay)
                    if attempt == 1:
                        self._market_data_unavailable(reason, fallback=False)
                    self._write_status(
                        "binance", False, f"Binance unreachable ({reason}); retrying in {delay:.0f} s"
                    )
                    with contextlib.suppress(TimeoutError):
                        await asyncio.wait_for(self._stop.wait(), timeout=delay)
                    if self._stop.is_set():
                        raise _Stopped from None
        sim = SimulatedFeed(self.cfg.sim_seed, minute_days=max(16, self.bootstrap_days + 2))
        history = await sim.open(symbols, stored)
        return sim, history

    def _market_data_unavailable(self, reason: str, *, fallback: bool) -> None:
        if fallback:
            title = "Binance unreachable — using the simulator"
            message = (
                f"Live market data could not be reached ({reason}). The engine switched to the deterministic "
                f"simulated market (seed {self.cfg.sim_seed}); trading continues on simulated prices."
            )
        else:
            title = "Binance unreachable — retrying"
            message = (
                f"Live market data could not be reached ({reason}). The engine keeps retrying with backoff."
            )
        log.warning("%s: %s", title, reason)
        self.store.event(
            "SYSTEM_WARNING",
            title,
            message,
            severity="warning",
            data={"component": "market_data", "error": reason},
        )
        self.store.notify(
            "MARKET_DATA_UNAVAILABLE", title, message, severity="warning", data={"error": reason}
        )

    def _feed_label(self) -> str:
        if self.feed is None:
            return "market feed"
        return (
            "Binance live feed"
            if self.feed.kind == "binance"
            else f"simulated market (seed {self.cfg.sim_seed})"
        )

    # ------------------------------------------------------------------
    # bootstrap / resume / warm-up
    # ------------------------------------------------------------------

    def _bootstrap(self, history: MarketHistory) -> None:
        """Replay the last N days of simulated 1m candles through the core (heuristic only)."""
        assert self.core is not None
        core = self.core
        started = time.perf_counter()
        days = self.bootstrap_days
        end = history.end
        start = end - days * DAY
        symbols = [s for s in history.candles if "1m" in history.candles[s]]
        self._phase = f"Bootstrapping: replaying {days} days of simulated market"
        self._write_status("simulated", True, self._phase)

        live_store, buffer = self.store, _Buffer(Store(self.db, historical=True))
        live_analyst = core.analyst
        cfg = core.config
        cfg.historical, cfg.emit_market_updates, cfg.publish_mtf = True, False, False
        cfg.defer_remote_analysis = False
        core.sink = buffer
        core.set_analyst(HeuristicAnalyst())
        for sym in symbols:
            core.warm_up(sym, self._history_slice(history.candles[sym], until=start))

        minutes = {sym: history.candles[sym]["1m"].window(start, end) for sym in symbols}
        by_time: dict[int, list[tuple[str, Candle]]] = {}
        for sym, arrays in minutes.items():
            for candle in arrays.to_candles():
                by_time.setdefault(candle.time, []).append((sym, candle))
        times = sorted(by_time)
        last_status = time.monotonic()
        for i, t in enumerate(times):
            for sym, candle in by_time[t]:
                core.on_candle(sym, candle)
            core.record_equity(_ts(t + 60), include_positions=False)
            if time.monotonic() - last_status >= HEARTBEAT_EVERY:
                last_status = time.monotonic()
                buffer.flush()
                self._write_status("simulated", True, f"{self._phase} ({i / len(times) * 100:.0f}%)")
        core.record_equity(_ts(end))
        buffer.flush()
        buffer.store.finish_historical()

        cfg.historical, cfg.emit_market_updates, cfg.publish_mtf = False, True, True
        cfg.defer_remote_analysis = True
        core.sink = live_store
        core.set_analyst(live_analyst)
        duration = time.perf_counter() - started
        summary = live_store.summary()
        trades, wins, pnl = summary["trades"], summary["wins"], summary["realized_pnl"]
        equity = core.equity()
        ret = (equity / self.cfg.starting_balance - 1.0) * 100.0
        win_rate = wins / trades * 100.0 if trades else None
        decisions = summary["counts"]["ai_decisions"]
        self.bootstrap_info = {
            "days": days,
            "duration_sec": round(duration, 2),
            "trades": trades,
            "wins": wins,
            "win_rate": round(win_rate, 2) if win_rate is not None else None,
            "realized_pnl": round(pnl, 2),
            "equity": round(equity, 2),
            "return_pct": round(ret, 4),
            "decisions": decisions,
            "open_positions": len(core.broker.positions),
            "seed": self.cfg.sim_seed,
        }
        self.store.set_meta(META_BOOTSTRAP, {**self.bootstrap_info, "finished_at": utcnow()})
        message = (
            f"Replayed {days} days of simulated market through the trading core in {duration:.1f} s: "
            f"{trades} trades"
            + (f" ({win_rate:.0f}% wins)" if win_rate is not None else "")
            + f", equity {equity:,.2f} USDT ({ret:+.2f}%), {decisions:,} AI decisions. Trading continues live."
        )
        self.store.event(
            "SYSTEM_INFO",
            "Bootstrap complete",
            message,
            severity="success",
            data={"component": "bootstrap", **self.bootstrap_info},
        )
        log.info("Bootstrap: %s", message)

    def _history_slice(self, per_tf: Mapping[str, CandleArrays], until: int) -> dict[str, list[Candle]]:
        """Closed candles before ``until`` of every timeframe, as deep as a warm-up needs."""
        out: dict[str, list[Candle]] = {}
        for tf, arrays in per_tf.items():
            depth = WARMUP_DEPTH_1M if tf == "1m" else WARMUP_DEPTH
            out[tf] = arrays.window(None, until).tail(depth).to_candles()
        return out

    def _warm_from_history(self, history: MarketHistory) -> None:
        assert self.core is not None
        for sym, per_tf in history.candles.items():
            self.core.warm_up(sym, self._history_slice(per_tf, until=history.end))

    def _resume(self, history: MarketHistory, stored: StoredMarket) -> None:
        """Restore trading state, warm the indicators and replay the downtime in catch-up mode."""
        assert self.core is not None
        core = self.core
        now = utcnow()
        core.restore(self.store.restored_state(now), now)
        gap: dict[int, list[tuple[str, Candle]]] = {}
        for sym, per_tf in history.candles.items():
            last = stored.last_1m.get(sym)
            if last is None:  # a symbol without stored data: its history came complete
                core.warm_up(sym, self._history_slice(per_tf, until=history.end))
                continue
            warm = self.store.warmup_history(sym, until=last.time)
            warm["1m"] = self.store.latest_candles(sym, "1m", WARMUP_DEPTH_1M, until=last.time)
            core.warm_up(sym, warm)
            minutes = per_tf.get("1m")
            if minutes is not None and len(minutes):
                for candle in minutes.window(last.time + 60, None).to_candles():
                    gap.setdefault(candle.time, []).append((sym, candle))
        for t in sorted(gap):
            for sym, candle in gap[t]:
                core.on_candle(sym, candle, decide=False)
            core.record_equity(_ts(t + 60), include_positions=False)
        if gap:
            log.info("Caught up %d minutes of market data missed while offline", len(gap))

    # ------------------------------------------------------------------
    # live event handling
    # ------------------------------------------------------------------

    def _emit(self, event: FeedEvent) -> None:
        self._queue.put_nowait(event)

    async def _feed_loop(self) -> None:
        backoff = 1.0
        while True:
            assert self.feed is not None
            try:
                await self.feed.run(self._emit)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - keep the engine alive, report, retry
                log.exception("Market feed crashed")
                self._warn(
                    "feed",
                    "Market feed error",
                    f"The {self.feed.kind} feed stopped unexpectedly ({type(exc).__name__}); restarting it.",
                    component="market_data",
                )
                await asyncio.sleep(backoff)
                backoff = min(60.0, backoff * 2)

    async def _consume(self) -> None:
        while True:
            event = await self._queue.get()
            self._handle(event)
            while not self._queue.empty():
                self._handle(self._queue.get_nowait())

    def _handle(self, event: FeedEvent) -> None:
        core = self.core
        assert core is not None
        try:
            if isinstance(event, TickEvent):
                core.on_tick(event.symbol, event.price, _ts(event.ts))
            elif isinstance(event, CandleEvent):
                self._candle_rows[(event.symbol, event.timeframe, event.candle.time)] = candle_row(
                    event.symbol, event.timeframe, event.candle
                )
                if event.closed and event.timeframe == core.config.base_timeframe:
                    for pending in core.on_candle(event.symbol, event.candle):
                        self._schedule_analysis(pending)
            elif isinstance(event, TickerEvent):
                self._tickers[event.ticker.symbol] = event.ticker
                self._fresh_tickers.add(event.ticker.symbol)
            elif isinstance(event, StatusEvent):
                self._feed_status(event)
        except Exception as exc:  # noqa: BLE001 - one bad event must not stop trading
            log.exception("Error while processing a %s", type(event).__name__)
            self._bot_error(f"Error while processing market data ({type(exc).__name__}: {exc})")

    def _feed_status(self, event: StatusEvent) -> None:
        previous = self._feed_connected
        self._feed_connected = event.connected
        if previous is None or previous == event.connected:
            return
        if event.connected:
            self.store.event(
                "SYSTEM_INFO",
                "Market data reconnected",
                event.message or "The market feed is streaming again.",
                severity="success",
                data={"component": "market_data"},
            )
        else:
            self._warn(
                "feed-down",
                "Market data connection lost",
                event.message or "The market feed disconnected; reconnecting.",
                component="market_data",
            )

    def _schedule_analysis(self, pending: PendingDecision) -> None:
        running = self._analysis_tasks.get(pending.symbol)
        if running is not None and not running.done():
            log.info(
                "Analysis of %s still running; skipping the %s close", pending.symbol, pending.ctx.timeframe
            )
            return
        self._analysis_tasks[pending.symbol] = asyncio.create_task(
            self._analyze(pending), name=f"ai:{pending.symbol}"
        )

    async def _analyze(self, pending: PendingDecision) -> None:
        assert self.core is not None
        try:
            result = await self.analyst.aanalyze(pending.ctx)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 - the decision still completes with the heuristic
            log.exception("Analyst failed on %s", pending.symbol)
            result = self._heuristic_fallback(pending, f"Analyst error ({type(exc).__name__})")
        try:
            self.core.complete(pending, result, utcnow())
        except Exception as exc:  # noqa: BLE001
            log.exception("Completing the decision on %s failed", pending.symbol)
            self._bot_error(f"Decision on {pending.symbol} failed ({type(exc).__name__}: {exc})")

    @staticmethod
    def _heuristic_fallback(pending: PendingDecision, reason: str) -> AnalystResult:
        result = HeuristicAnalyst().analyze(pending.ctx)
        result.fallback_reason = reason
        result.failed = True
        return result

    # ------------------------------------------------------------------
    # periodic work
    # ------------------------------------------------------------------

    async def _every(
        self,
        period: float,
        fn: Callable[[], Awaitable[None] | None],
        *,
        offset: float = 0.0,
        first: float | None = None,
    ) -> None:
        if first is not None:
            await asyncio.sleep(first)
        while True:
            try:
                out = fn()
                if asyncio.iscoroutine(out):
                    await out
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - periodic work must keep running
                log.exception("Periodic task %s failed", getattr(fn, "__name__", fn))
                self._bot_error(f"{getattr(fn, '__name__', 'task')} failed ({type(exc).__name__}: {exc})")
            now = self.clock()
            await asyncio.sleep(period - (now - offset) % period if period <= 60 else period)

    def _flush_live(self) -> None:
        core = self.core
        assert core is not None
        now = utcnow()
        rows = list(self._candle_rows.values())
        self._candle_rows.clear()
        live: dict[str, Any] = {}
        for sym in sorted(self._fresh_tickers):
            ticker = self._tickers.get(sym)
            if ticker is not None:
                live[f"ticker:{sym}"] = ticker.model_copy(
                    update={"sparkline": self._sparkline(sym, ticker.price)}
                )
        self._fresh_tickers.clear()
        live["portfolio"] = core.portfolio(now)
        live["positions"] = core.positions(now)
        self.store.flush_live(rows, live)

    def _sparkline(self, symbol: str, price: float) -> list[float]:
        """The last 24 hourly closes (the newest point is the live price)."""
        assert self.core is not None
        book = self.core.books.get(symbol)
        if book is None or "1h" not in book.series:
            return []
        closes = [c.close for c in book.candles("1h", SPARKLINE_POINTS - 1)]
        return [*closes, price]

    async def _heartbeat(self) -> None:
        core = self.core
        assert core is not None
        await self._check_settings()
        self._retire_symbols()
        now = utcnow()
        with self.db.tx() as conn:
            self.db.put_live("status", self._status(now), conn=conn)
            self.db.put_live("risk", core.risk_snapshot(now), conn=conn)
        self._save_sim_state()

    def _record_equity(self) -> None:
        assert self.core is not None
        self.core.record_equity(utcnow())

    def _housekeeping(self) -> None:
        report = self.store.housekeeping(utcnow())
        if report.total:
            log.info(
                "Housekeeping removed %d MARKET_UPDATE events and %d candles",
                report.market_updates,
                report.candles,
            )

    def _save_sim_state(self) -> None:
        if self.feed is None:
            return
        state = self.feed.state()
        if state is None:
            return
        encoded = json.dumps(state, sort_keys=True)
        if encoded != self._sim_state_saved:
            self.store.save_sim_state(state)
            self._sim_state_saved = encoded

    # ------------------------------------------------------------------
    # settings
    # ------------------------------------------------------------------

    async def _check_settings(self) -> None:
        if self.db.settings_version() == self.settings.version:
            return
        await self.apply_settings(self.db.get_settings())

    async def apply_settings(self, new: BotSettings) -> None:
        """Apply a saved settings version live (strategy, risk, AI, notifications and symbols)."""
        core, feed = self.core, self.feed
        assert core is not None and feed is not None
        old = self.settings
        self.settings = new
        core.apply_settings(new)
        if isinstance(self.analyst, OpenRouterAnalyst):
            self.analyst.update_settings(new.ai)
            core.set_analyst(self.analyst)
        if self.notifier is not None:
            self.notifier.update_settings(new.notifications)
        wanted = [normalize(s) for s in new.trading.symbols]
        added = [s for s in wanted if s not in feed.symbols]
        self._retiring.update(s for s in old.trading.symbols if normalize(s) not in wanted)
        self._retiring.difference_update(wanted)
        if added:
            await self._add_symbols(added)
        log.info("Applied settings version %d", new.version)
        self.store.event(
            "SYSTEM_INFO",
            f"Settings applied (version {new.version})",
            f"Strategy {new.trading.strategy} · {', '.join(new.trading.symbols)} · decision timeframe "
            f"{new.trading.decision_timeframe} · risk {new.risk.risk_per_trade_pct:g}% per trade",
            data={"component": "settings", "version": new.version},
        )

    async def _add_symbols(self, symbols: Sequence[str]) -> None:
        core, feed = self.core, self.feed
        assert core is not None and feed is not None
        stored = self.store.stored_market(symbols)
        history = await feed.add_symbols(symbols, stored)
        self.store.write_history(history)
        self._save_sim_state()
        refreshed = self.store.stored_market(symbols)
        for sym in symbols:
            last = refreshed.last_1m.get(sym)
            if last is None:
                continue
            warm = self.store.warmup_history(sym, until=last.time)
            warm["1m"] = self.store.latest_candles(sym, "1m", WARMUP_DEPTH_1M, until=last.time)
            core.warm_up(sym, warm)
        log.info("Now streaming %s", ", ".join(symbols))

    def _retire_symbols(self) -> None:
        """Stop streaming removed symbols once they have no open position left."""
        core, feed = self.core, self.feed
        assert core is not None and feed is not None
        done = [
            s
            for s in self._retiring
            if core.broker.position_for(s) is None and core.broker.order_for(s) is None
        ]
        if done:
            feed.remove_symbols(done)
            self._retiring.difference_update(done)
            log.info("Stopped streaming %s", ", ".join(done))

    # ------------------------------------------------------------------
    # status and warnings
    # ------------------------------------------------------------------

    def _status(self, now: datetime, *, running: bool = True) -> EngineStatus:
        core, feed = self.core, self.feed
        s = self.settings
        reason, _until = core.risk.halt_status(now) if core is not None else (None, None)
        try:
            cpu = self.process.cpu_percent(None)
            rss = self.process.memory_info().rss / 1_048_576
        except psutil.Error:
            cpu, rss = 0.0, 0.0
        message = self._phase or (feed.message if feed is not None else None)
        return EngineStatus(
            mode=self.cfg.trading_mode,
            running=running,
            trading_allowed=reason is None and running,
            halt_reason=reason,
            strategy=s.trading.strategy,
            symbols=list(s.trading.symbols),
            primary_symbol=s.trading.primary_symbol,
            decision_timeframe=s.trading.decision_timeframe,
            feed=feed.kind if feed is not None else "simulated",
            feed_connected=bool(feed.connected) if feed is not None else False,
            feed_message=message,
            ai_provider=core.last_provider if core is not None else self.analyst.provider,
            ai_model=core.last_model if core is not None else self.analyst.model,
            openrouter_configured=self.cfg.openrouter_configured,
            settings_version=s.version,
            started_at=self.started_at,
            heartbeat_at=now,
            last_market_update=core.last_market_update if core is not None else None,
            last_ai_analysis=core.last_analysis_at if core is not None else None,
            last_trade=core.last_trade_at if core is not None else None,
            next_analysis_at=core.next_decision_at(now) if core is not None and running else None,
            version=VERSION,
            pid=os.getpid(),
            cpu_pct=round(cpu, 1),
            rss_mb=round(rss, 1),
        )

    def _write_status(self, feed: FeedKind, connected: bool, message: str) -> None:
        """A status heartbeat during start-up, before the live loop runs."""
        now = utcnow()
        status = self._status(now).model_copy(
            update={"feed": feed, "feed_connected": connected, "feed_message": message}
        )
        self.store.put_live("status", status)

    def _warn(self, key: str, title: str, message: str, *, component: str) -> None:
        """A SYSTEM_WARNING event, at most once per ``WARNING_EVERY`` for one kind of problem."""
        now = time.monotonic()
        last = self._warned.get(key)
        if last is not None and now - last < WARNING_EVERY:
            return
        self._warned[key] = now
        self.store.event("SYSTEM_WARNING", title, message, severity="warning", data={"component": component})

    def _bot_error(self, message: str) -> None:
        now = time.monotonic()
        last = self._warned.get("bot-error")
        if last is not None and now - last < WARNING_EVERY:
            return
        self._warned["bot-error"] = now
        with contextlib.suppress(Exception):
            self.store.event(
                "SYSTEM_WARNING", "Engine error", message, severity="error", data={"component": "engine"}
            )
            self.store.notify(
                "BOT_ERROR", "Engine error", message, severity="error", data={"component": "engine"}
            )

    def _channel_failed(self, channel: str, error: str) -> None:
        self.store.event(
            "SYSTEM_WARNING",
            f"{channel.capitalize()} notifications failing",
            f"Delivery via {channel} failed: {error}. Notifications stay available in the dashboard.",
            severity="warning",
            data={"component": "notifications", "channel": channel},
        )

    def _publish_snapshots(self, now: datetime) -> None:
        """Every live_state key, so the dashboard is complete the moment the engine is up."""
        core = self.core
        assert core is not None
        live: dict[str, Any] = {
            "status": self._status(now),
            "portfolio": core.portfolio(now),
            "positions": core.positions(now),
            "risk": core.risk_snapshot(now),
        }
        for sym in core.books:
            report = core.mtf_report(sym, now)
            if report is not None:
                live[f"mtf:{sym}"] = report
            state = core.regimes[sym].state
            if state is not None:
                live[f"regime:{sym}"] = state
        self.store.flush_live([], live)

    def _spawn(self, coro: Awaitable[Any]) -> None:
        task = asyncio.ensure_future(coro)
        self._tasks.append(task)


class _Stopped(Exception):
    """Stop was requested while the engine was still starting."""
