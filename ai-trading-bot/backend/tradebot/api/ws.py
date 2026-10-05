"""WebSocket hub (``/ws``): one broadcaster per process fans engine updates out to dashboards.

Every frame is JSON ``{"type": ..., "data": ...}`` (``schemas.WsServerMessage``).

**On connect** the server sends ``hello`` (``last_event_id``), then a snapshot burst:
``status``, ``portfolio``, ``positions``, ``risk``, one ``ticker`` per symbol, ``mtf`` and
``regime`` per symbol, and the latest ``ai_analysis`` per symbol (state the engine has
not published yet is skipped). Every event with an id above ``hello.last_event_id`` is
then guaranteed to arrive on this connection, in id order.

**Streaming** (a single broadcaster task polls the database every 250 ms):

- ``event`` for every new outbox row. Alongside ``AI_ANALYSIS`` an ``ai_analysis`` frame
  with the full analysis, sent again after ``TRADE_EXECUTED`` / ``TRADE_REJECTED`` once
  the risk decision is recorded, so treat ``ai_analysis`` as an upsert by id;
  ``trade_closed`` with the full trade after ``STOP_LOSS`` / ``TAKE_PROFIT`` /
  ``TRADE_CLOSED``; ``settings`` after ``SETTINGS_CHANGED``. Events older than 10 min
  (history the engine is catching up on, e.g. the simulator bootstrap) stream as plain
  ``event`` frames without the extra frames.
- ``notification`` for each new unread notification.
- ``status``, ``portfolio``, ``positions``, ``risk``, ``ticker``, ``mtf``, ``regime`` whenever
  the engine rewrites them, and ``status`` at least every 2 s so a silent engine shows
  ``degraded`` after 10 s and ``offline`` after 60 s without a heartbeat.
- ``candle`` for each chart the connection subscribed to, only when it changed: the
  forming candle as it updates (``closed: false``) and the final version of a candle
  once the next one opens (``closed: true``), each with the overlay values at that candle.

**Client frames** (``schemas.WsClientMessage``):

- ``subscribe_chart`` replaces the connection's chart subscriptions (the first 8 distinct
  pairs; extras are ignored). The current candle of a newly added pair follows at once.
- ``resume`` replays the events with ``last_event_id`` < id ≤ ``hello.last_event_id`` and any
  broadcast since (the newest 500 at most, oldest first), ahead of every later frame; events
  after that arrive live. Sent right after ``hello`` with the last id seen on the previous
  connection, it fills exactly the gap. Dedupe by id. A ``hello.last_event_id`` lower than
  the client's own last id means the database was reset: start over.
- ``ping`` → ``pong`` (``{"server_time"}``).
- An invalid frame gets an ``error`` frame (``{"code", "message"}``); the connection stays.

**Back-pressure**: each connection has a bounded send queue. State frames are coalesced
(a newer ``ticker`` / ``positions`` / ... replaces one still waiting), ``ticker`` and
``candle`` frames are dropped first when the queue is full, and a client whose queue stays
full for 10 s (or overflows the hard limit) is closed with code 1013; it reconnects and
resumes from its last event id. Unauthorized connections are closed with 4401.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import math
import time
from collections import deque
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime

from fastapi import WebSocket
from pydantic import BaseModel, TypeAdapter, ValidationError

from ..analytics.performance import PortfolioKpiService
from ..config import VERSION, EnvConfig
from ..db import Database, utcnow
from ..indicators import overlay_values
from ..schemas import (
    AIAnalysis,
    Candle,
    EngineStatus,
    MTFReport,
    PortfolioState,
    Position,
    RegimeState,
    RiskSnapshot,
    Ticker,
    WsAIAnalysis,
    WsCandle,
    WsCandleData,
    WsClientMessage,
    WsClientPing,
    WsClientSubscribeChart,
    WsError,
    WsEvent,
    WsHello,
    WsHelloData,
    WsMTF,
    WsNotification,
    WsPong,
    WsPortfolio,
    WsPositions,
    WsRegime,
    WsRisk,
    WsSettings,
    WsStatus,
    WsTicker,
    WsTradeClosed,
)
from . import queries
from .bot_settings import with_server_fields
from .charts import warmup_bars
from .redaction import Redactor
from .validation import is_symbol, normalize_symbol

log = logging.getLogger("tradebot.api.ws")

CLOSE_EVENT_TYPES = frozenset({"STOP_LOSS", "TAKE_PROFIT", "TRADE_CLOSED"})
RISK_DECISION_EVENT_TYPES = frozenset({"TRADE_EXECUTED", "TRADE_REJECTED"})
CATCH_UP_AGE_SEC = 600.0
CLOSE_GOING_AWAY = 1001
CLOSE_UNAVAILABLE = 1011
CLOSE_TRY_AGAIN = 1013
_CLIENT_MESSAGE: TypeAdapter[WsClientMessage] = TypeAdapter(WsClientMessage)
_POSITIONS: TypeAdapter[list[Position]] = TypeAdapter(list[Position])
_LIVE_ORDER = ("status", "portfolio", "positions", "risk", "ticker", "mtf", "regime")

ChartKey = tuple[str, str]


@dataclass
class HubOptions:
    poll_interval: float = 0.25
    status_interval: float = 2.0
    event_batch: int = 500
    queue_soft_limit: int = 512
    queue_hard_limit: int = 2_048
    stuck_timeout: float = 10.0
    send_timeout: float = 10.0
    max_charts: int = 8
    resume_limit: int = 500
    max_client_frame: int = 16_384
    ready_timeout: float = 15.0


@dataclass(frozen=True)
class Outgoing:
    """A serialized frame and how to queue it."""

    text: str
    key: str | None = None  # a newer frame with the same key replaces one still queued
    droppable: bool = False  # dropped first when a client falls behind
    chart: ChartKey | None = None  # only for connections subscribed to this chart


# --------------------------------------------------------------------------
# Per-connection send queue
# --------------------------------------------------------------------------


class _Entry:
    __slots__ = ("droppable", "key", "text")

    def __init__(self, text: str, key: str | None, droppable: bool):
        self.text = text
        self.key = key
        self.droppable = droppable


class _Replay:
    """Holds the place of replayed events in the queue until they are loaded."""

    __slots__ = ("frames", "ready")

    def __init__(self) -> None:
        self.frames: list[str] = []
        self.ready = asyncio.Event()


class SendQueue:
    """Bounded, coalescing queue between the broadcaster and one connection's writer."""

    def __init__(self, options: HubOptions):
        self.soft_limit = options.queue_soft_limit
        self.hard_limit = options.queue_hard_limit
        self.stuck_timeout = options.stuck_timeout
        self.dropped = 0
        self.full_since: float | None = None
        self._items: deque[_Entry | _Replay] = deque()
        self._keyed: dict[str, _Entry] = {}
        self._wakeup = asyncio.Event()

    def __len__(self) -> int:
        return len(self._items)

    def put(self, text: str, *, key: str | None = None, droppable: bool = False) -> bool:
        """Queue a frame; False means the client is hopelessly behind and must go."""
        if key is not None and (queued := self._keyed.get(key)) is not None:
            queued.text = text  # newest state wins and keeps its place in line
            return True
        if len(self._items) >= self.soft_limit:
            if self.full_since is None:
                self.full_since = time.monotonic()
            if droppable:
                self.dropped += 1
                return not self._stuck()
            self._drop_droppable()
            if len(self._items) >= self.hard_limit:
                return False
        entry = _Entry(text, key, droppable)
        self._items.append(entry)
        if key is not None:
            self._keyed[key] = entry
        self._wakeup.set()
        return not self._stuck()

    def reserve(self) -> _Replay | None:
        """A placeholder for frames that will be filled in later (None when overflowing)."""
        if len(self._items) >= self.hard_limit:
            return None
        block = _Replay()
        self._items.append(block)
        self._wakeup.set()
        return block

    async def get(self) -> _Entry | _Replay:
        while not self._items:
            self._wakeup.clear()
            await self._wakeup.wait()
        item = self._items.popleft()
        if isinstance(item, _Entry) and item.key is not None and self._keyed.get(item.key) is item:
            del self._keyed[item.key]
        if len(self._items) < self.soft_limit:
            self.full_since = None
        return item

    def _stuck(self) -> bool:
        return self.full_since is not None and time.monotonic() - self.full_since > self.stuck_timeout

    def _drop_droppable(self) -> None:
        kept: deque[_Entry | _Replay] = deque()
        for item in self._items:
            if isinstance(item, _Entry) and item.droppable:
                self.dropped += 1
                if item.key is not None and self._keyed.get(item.key) is item:
                    del self._keyed[item.key]
            else:
                kept.append(item)
        self._items = kept


class Connection:
    def __init__(self, websocket: WebSocket, queue: SendQueue):
        self.websocket = websocket
        self.queue = queue
        self.charts: list[ChartKey] = []
        self.writer: asyncio.Task[None] | None = None
        self.closing = False


# --------------------------------------------------------------------------
# Results handed from the polling threads back to the event loop
# --------------------------------------------------------------------------


@dataclass
class _LiveUpdate:
    versions: dict[str, int]
    frames: list[tuple[str, Outgoing]] = field(default_factory=list)
    engine: EngineStatus | None = None


@dataclass
class _EventBatch:
    cursor: int
    full: bool
    frames: list[Outgoing] = field(default_factory=list)
    analyses: dict[str, tuple[datetime, Outgoing]] = field(default_factory=dict)


@dataclass
class _Initial:
    cursor: int
    notification_cursor: int
    live: _LiveUpdate
    symbols: list[str]
    analyses: dict[str, tuple[datetime, Outgoing]]


@dataclass(frozen=True)
class _ChartState:
    last: Candle
    history: tuple[Candle, ...]  # closed candles before ``last``, oldest first
    frame: Outgoing  # the latest frame, sent at once to new subscribers


def _keep_latest(
    analyses: dict[str, tuple[datetime, Outgoing]], symbol: str, created_at: datetime, frame: Outgoing
) -> None:
    current = analyses.get(symbol)
    if current is None or created_at >= current[0]:
        analyses[symbol] = (created_at, frame)


def _text(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def _same_candle(a: Candle, b: Candle) -> bool:
    return (a.time, a.open, a.high, a.low, a.close, a.volume) == (
        b.time,
        b.open,
        b.high,
        b.low,
        b.close,
        b.volume,
    )


def _describe(exc: ValidationError) -> str:
    first = exc.errors()[0]
    loc = ".".join(str(part) for part in first.get("loc", ()))
    return f"{loc}: {first['msg']}" if loc else str(first["msg"])


def _live_rank(key: str) -> int:
    prefix = key.partition(":")[0]
    return _LIVE_ORDER.index(prefix) if prefix in _LIVE_ORDER else len(_LIVE_ORDER)


# --------------------------------------------------------------------------
# The hub
# --------------------------------------------------------------------------


class Hub:
    def __init__(
        self,
        db: Database,
        config: EnvConfig,
        kpis: PortfolioKpiService,
        redactor: Redactor,
        options: HubOptions | None = None,
    ):
        self.db = db
        self.config = config
        self.kpis = kpis
        self.redactor = redactor
        self.options = options or HubOptions()
        self.messages_sent = 0
        self._connections: set[Connection] = set()
        self._dropped_closed = 0
        self._task: asyncio.Task[None] | None = None
        self._ready: asyncio.Event | None = None
        self._background: set[asyncio.Task[None]] = set()
        # broadcaster state; only ever mutated on the event loop
        self._cursor = 0
        self._notification_cursor = 0
        self._versions: dict[str, int] = {}
        self._state_frames: dict[str, Outgoing] = {}
        self._engine: EngineStatus | None = None
        self._symbols: list[str] = []
        self._analyses: dict[str, tuple[datetime, Outgoing]] = {}
        self._charts: dict[ChartKey, _ChartState] = {}
        self._last_status = -math.inf

    # -- introspection ---------------------------------------------------------

    @property
    def running(self) -> bool:
        return self._task is not None and not self._task.done()

    @property
    def clients(self) -> int:
        return len(self._connections)

    @property
    def frames_dropped(self) -> int:
        return self._dropped_closed + sum(c.queue.dropped for c in self._connections)

    @property
    def last_event_id(self) -> int:
        return self._cursor

    def serialize(self, model: BaseModel) -> str:
        return self.redactor.text(model.model_dump_json())

    # -- lifecycle -------------------------------------------------------------

    async def start(self) -> None:
        self._ready = asyncio.Event()
        self._task = asyncio.create_task(self._run(), name="ws-broadcaster")

    async def stop(self) -> None:
        task, self._task = self._task, None
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        for conn in list(self._connections):
            self._remove(conn)
            await self._close(conn, CLOSE_GOING_AWAY, "Server shutting down")
        for background in list(self._background):
            background.cancel()

    # -- connections -----------------------------------------------------------

    async def serve(self, websocket: WebSocket) -> None:
        """Run one dashboard connection until it disconnects."""
        await websocket.accept()
        ready = self._ready
        if ready is None or not self.running:
            await websocket.close(code=CLOSE_UNAVAILABLE, reason="Live updates unavailable")
            return
        try:
            await asyncio.wait_for(ready.wait(), self.options.ready_timeout)
        except TimeoutError:
            await websocket.close(code=CLOSE_TRY_AGAIN, reason="Server is starting, retry shortly")
            return
        conn = Connection(websocket, SendQueue(self.options))
        self._greet(conn)
        self._connections.add(conn)
        conn.writer = asyncio.create_task(self._write_loop(conn), name="ws-writer")
        try:
            await self._read_loop(conn)
        finally:
            self._remove(conn)
            conn.closing = True
            conn.writer.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await conn.writer

    def _greet(self, conn: Connection) -> None:
        """Queue ``hello`` and the snapshot burst. Synchronous, so no broadcast can slip in
        between the cursor reported in ``hello`` and the connection joining the fan-out."""
        hello = WsHello(
            data=WsHelloData(server_time=utcnow(), api_version=VERSION, last_event_id=self._cursor)
        )
        frames = [Outgoing(self.serialize(hello)), self._status_frame()]
        frames += [
            self._state_frames[k] for k in ("portfolio", "positions", "risk") if k in self._state_frames
        ]
        frames += [f for s in self._symbols if (f := self._state_frames.get(f"ticker:{s}"))]
        for symbol in self._symbols:
            frames += [f for k in (f"mtf:{symbol}", f"regime:{symbol}") if (f := self._state_frames.get(k))]
        frames += [self._analyses[s][1] for s in self._symbols if s in self._analyses]
        for out in frames:
            conn.queue.put(out.text, key=out.key)

    async def _read_loop(self, conn: Connection) -> None:
        websocket = conn.websocket
        while True:
            try:
                message = await websocket.receive()
            except Exception:  # disconnected underneath us
                return
            if message["type"] == "websocket.disconnect":
                return
            text = message.get("text")
            if text is None:
                self._send_error(conn, "invalid_message", "Binary frames are not supported; send JSON text")
                continue
            if len(text) > self.options.max_client_frame:
                self._send_error(
                    conn, "frame_too_large", f"Frames are limited to {self.options.max_client_frame} bytes"
                )
                continue
            try:
                request = _CLIENT_MESSAGE.validate_json(text)
            except ValidationError as exc:
                self._send_error(conn, "invalid_message", _describe(exc))
                continue
            if isinstance(request, WsClientPing):
                self._send(conn, Outgoing(self.serialize(WsPong(data={"server_time": utcnow()}))))
            elif isinstance(request, WsClientSubscribeChart):
                self._subscribe(conn, request)
            else:
                await self._resume(conn, request.last_event_id)

    async def _write_loop(self, conn: Connection) -> None:
        websocket = conn.websocket
        try:
            while True:
                item = await conn.queue.get()
                if isinstance(item, _Replay):
                    await item.ready.wait()
                    texts: Sequence[str] = item.frames
                else:
                    texts = (item.text,)
                for text in texts:
                    await asyncio.wait_for(websocket.send_text(text), self.options.send_timeout)
                    self.messages_sent += 1
        except TimeoutError:
            self._evict(conn, "Send timed out")
        except asyncio.CancelledError:
            raise
        except Exception:  # the client went away mid-send; the read loop cleans up
            conn.closing = True

    def _subscribe(self, conn: Connection, request: WsClientSubscribeChart) -> None:
        pairs: list[ChartKey] = []
        rejected: list[str] = []
        for chart in request.charts:
            symbol = normalize_symbol(chart.symbol)
            if not is_symbol(symbol):
                rejected.append(chart.symbol)
                continue
            pair = (symbol, chart.timeframe)
            if pair not in pairs and len(pairs) < self.options.max_charts:
                pairs.append(pair)
        if rejected:
            self._send_error(conn, "invalid_symbol", f"Ignored invalid symbol(s): {', '.join(rejected)}")
        added = [p for p in pairs if p not in conn.charts]
        conn.charts = pairs
        for pair in added:
            state = self._charts.get(pair)
            if state is not None:
                self._send(conn, state.frame)

    async def _resume(self, conn: Connection, last_event_id: int) -> None:
        upto = self._cursor
        if last_event_id >= upto:
            return
        block = conn.queue.reserve()
        if block is None:
            self._evict(conn, "Client too slow")
            return
        try:
            block.frames = await asyncio.to_thread(self._replay_frames, max(0, last_event_id), upto)
        except Exception:
            log.exception("Replaying events after %s failed", last_event_id)
        finally:
            block.ready.set()

    def _send(self, conn: Connection, out: Outgoing) -> None:
        if not conn.queue.put(out.text, key=out.key, droppable=out.droppable):
            self._evict(conn, "Client too slow")

    def _send_error(self, conn: Connection, code: str, message: str) -> None:
        self._send(conn, Outgoing(self.serialize(WsError(data={"code": code, "message": message}))))

    def _remove(self, conn: Connection) -> None:
        if conn in self._connections:
            self._connections.discard(conn)
            self._dropped_closed += conn.queue.dropped

    def _evict(self, conn: Connection, reason: str) -> None:
        if conn.closing:
            return
        conn.closing = True
        self._remove(conn)
        log.warning("Closing a slow WebSocket client: %s", reason)
        task = asyncio.get_running_loop().create_task(self._close(conn, CLOSE_TRY_AGAIN, reason))
        self._background.add(task)
        task.add_done_callback(self._background.discard)

    async def _close(self, conn: Connection, code: int, reason: str) -> None:
        conn.closing = True
        if conn.writer is not None and conn.writer is not asyncio.current_task():
            conn.writer.cancel()
        with contextlib.suppress(Exception):
            await conn.websocket.close(code=code, reason=reason)

    def _publish(self, out: Outgoing) -> None:
        for conn in list(self._connections):
            if out.chart is None or out.chart in conn.charts:
                self._send(conn, out)

    # -- broadcaster -----------------------------------------------------------

    async def _run(self) -> None:
        loop = asyncio.get_running_loop()
        while True:
            try:
                await self._prime()
                break
            except Exception:
                log.exception("Live updates could not read the database; retrying in 2 s")
                await asyncio.sleep(2.0)
        assert self._ready is not None
        self._ready.set()
        last_logged = -math.inf
        while True:
            started = loop.time()
            more = False
            try:
                more = await self._tick()
            except Exception:
                if loop.time() - last_logged > 30.0:
                    log.exception("Live update poll failed")
                    last_logged = loop.time()
            if not more:
                await asyncio.sleep(max(0.0, self.options.poll_interval - (loop.time() - started)))

    async def _prime(self) -> None:
        initial = await asyncio.to_thread(self._load_initial)
        self._cursor = initial.cursor
        self._notification_cursor = initial.notification_cursor
        self._symbols = initial.symbols
        self._analyses = initial.analyses
        self._apply_live(initial.live, publish=False)
        self._last_status = asyncio.get_running_loop().time()

    async def _tick(self) -> bool:
        """One polling round; True when a full event batch suggests more are waiting."""
        batch = await asyncio.to_thread(self._read_events, self._cursor)
        for out in batch.frames:
            self._publish(out)
        for symbol, (created_at, frame) in batch.analyses.items():
            _keep_latest(self._analyses, symbol, created_at, frame)
        self._cursor = batch.cursor

        self._apply_live(await asyncio.to_thread(self._read_live, self._versions))

        cursor, notifications = await asyncio.to_thread(self._read_notifications, self._notification_cursor)
        for out in notifications:
            self._publish(out)
        self._notification_cursor = cursor

        if asyncio.get_running_loop().time() - self._last_status >= self.options.status_interval:
            self._publish_status()
        await self._poll_charts()
        return batch.full

    def _apply_live(self, update: _LiveUpdate, publish: bool = True) -> None:
        self._versions = update.versions
        if update.engine is not None:
            self._engine = update.engine
            if update.engine.symbols:
                self._symbols = list(update.engine.symbols)
            if publish:
                self._publish_status()
        for key, out in update.frames:
            self._state_frames[key] = out
            if publish:
                self._publish(out)

    def _status_frame(self) -> Outgoing:
        status = queries.bot_status(self._engine, self.config)
        return Outgoing(self.serialize(WsStatus(data=status)), key="status")

    def _publish_status(self) -> None:
        self._last_status = asyncio.get_running_loop().time()
        self._publish(self._status_frame())

    def _wanted_charts(self) -> set[ChartKey]:
        return {pair for conn in self._connections for pair in conn.charts}

    async def _poll_charts(self) -> None:
        wanted = self._wanted_charts()
        for pair in [p for p in self._charts if p not in wanted]:
            del self._charts[pair]
        if not wanted:
            return
        updates = await asyncio.to_thread(
            self._read_charts, {pair: self._charts.get(pair) for pair in wanted}
        )
        still_wanted = self._wanted_charts()
        for pair, (state, frames) in updates.items():
            if pair in still_wanted:
                self._charts[pair] = state
                for out in frames:
                    self._publish(out)

    # -- database reads (run in worker threads; they never touch hub state) ------

    def _load_initial(self) -> _Initial:
        cursor = self.db.last_event_id()
        notification_cursor = queries.last_notification_id(self.db)
        live = self._read_live({})
        symbols = queries.active_symbols(self.db, live.engine)
        analyses: dict[str, tuple[datetime, Outgoing]] = {}
        for symbol in symbols:
            analysis = queries.latest_analysis(self.db, symbol)
            if analysis is not None:
                analyses[symbol] = (analysis.created_at, self._analysis_frame(analysis))
        return _Initial(cursor, notification_cursor, live, symbols, analyses)

    def _read_events(self, cursor: int) -> _EventBatch:
        events = self.db.events_after(cursor, self.options.event_batch)
        batch = _EventBatch(
            cursor=events[-1].id if events else cursor, full=len(events) >= self.options.event_batch
        )
        now = utcnow()
        caught_up: set[str] = set()
        for event in events:
            batch.frames.append(Outgoing(self.serialize(WsEvent(data=event))))
            if (now - event.ts).total_seconds() > CATCH_UP_AGE_SEC:
                if event.type == "AI_ANALYSIS" and event.symbol:
                    caught_up.add(event.symbol)
                continue
            if event.type == "AI_ANALYSIS" or event.type in RISK_DECISION_EVENT_TYPES:
                analysis = queries.find_analysis(self.db, _text(event.data.get("analysis_id")))
                if analysis is not None:
                    frame = self._analysis_frame(analysis)
                    batch.frames.append(frame)
                    _keep_latest(batch.analyses, analysis.symbol, analysis.created_at, frame)
            elif event.type in CLOSE_EVENT_TYPES:
                trade_id = _text(event.data.get("trade_id"))
                trade = queries.find_trade(self.db, trade_id) if trade_id else None
                if trade is not None:
                    batch.frames.append(Outgoing(self.serialize(WsTradeClosed(data=trade))))
            elif event.type == "SETTINGS_CHANGED":
                settings = with_server_fields(self.db.get_settings(), self.config)
                batch.frames.append(Outgoing(self.serialize(WsSettings(data=settings)), key="settings"))
        # history caught up on still moves the "latest analysis" a new dashboard is greeted with
        for symbol in caught_up - batch.analyses.keys():
            analysis = queries.latest_analysis(self.db, symbol)
            if analysis is not None:
                _keep_latest(batch.analyses, symbol, analysis.created_at, self._analysis_frame(analysis))
        return batch

    def _read_live(self, known: dict[str, int]) -> _LiveUpdate:
        current = self.db.live_versions()
        update = _LiveUpdate(versions={k: v for k, v in known.items() if k in current})
        for key in sorted((k for k, v in current.items() if known.get(k) != v), key=_live_rank):
            row = self.db.read_one("SELECT version, payload FROM live_state WHERE key = ?", (key,))
            if row is None:
                continue
            update.versions[key] = row["version"]
            try:
                if key == "status":
                    update.engine = EngineStatus.model_validate_json(row["payload"])
                elif (out := self._live_frame(key, row["payload"])) is not None:
                    update.frames.append((key, out))
            except ValueError:
                log.warning("Skipping malformed live_state %r", key, exc_info=True)
        return update

    def _live_frame(self, key: str, payload: str) -> Outgoing | None:
        if key == "portfolio":
            portfolio = self.kpis.portfolio(PortfolioState.model_validate_json(payload))
            return Outgoing(self.serialize(WsPortfolio(data=portfolio)), key=key)
        if key == "positions":
            return Outgoing(self.serialize(WsPositions(data=_POSITIONS.validate_json(payload))), key=key)
        if key == "risk":
            return Outgoing(self.serialize(WsRisk(data=RiskSnapshot.model_validate_json(payload))), key=key)
        prefix = key.partition(":")[0]
        if prefix == "ticker":
            ticker = Ticker.model_validate_json(payload)
            return Outgoing(self.serialize(WsTicker(data=ticker)), key=key, droppable=True)
        if prefix == "mtf":
            return Outgoing(self.serialize(WsMTF(data=MTFReport.model_validate_json(payload))), key=key)
        if prefix == "regime":
            return Outgoing(self.serialize(WsRegime(data=RegimeState.model_validate_json(payload))), key=key)
        return None

    def _read_notifications(self, cursor: int) -> tuple[int, list[Outgoing]]:
        items = queries.notifications_after(self.db, cursor)
        frames = [Outgoing(self.serialize(WsNotification(data=n))) for n in items if not n.read]
        return (items[-1].id if items else cursor), frames

    def _replay_frames(self, after_id: int, upto_id: int) -> list[str]:
        events = queries.events_between(self.db, after_id, upto_id, self.options.resume_limit)
        return [self.serialize(WsEvent(data=e)) for e in events]

    def _analysis_frame(self, analysis: AIAnalysis) -> Outgoing:
        return Outgoing(self.serialize(WsAIAnalysis(data=analysis)), key=f"ai:{analysis.id}")

    def _read_charts(
        self, states: dict[ChartKey, _ChartState | None]
    ) -> dict[ChartKey, tuple[_ChartState, list[Outgoing]]]:
        updates: dict[ChartKey, tuple[_ChartState, list[Outgoing]]] = {}
        for (symbol, timeframe), state in states.items():
            latest = queries.latest_candles(self.db, symbol, timeframe, 2)
            if not latest:
                continue
            current = latest[-1]
            depth = warmup_bars(timeframe)
            frames: list[Outgoing] = []
            if state is None or current.time < state.last.time:
                history = tuple(queries.candles_before(self.db, symbol, timeframe, current.time, depth))
            elif current.time > state.last.time:
                closed = latest[0] if len(latest) == 2 and latest[0].time == state.last.time else None
                if closed is not None:
                    history = (*state.history, closed)[-depth:]
                else:  # several candles went by between two polls
                    history = tuple(queries.candles_before(self.db, symbol, timeframe, current.time, depth))
                    closed = history[-1] if history else None
                if closed is not None:
                    frames.append(self._candle_frame(symbol, timeframe, closed, True, history[:-1]))
            elif _same_candle(current, state.last):
                continue
            else:
                history = state.history
            forming = self._candle_frame(symbol, timeframe, current, False, history)
            frames.append(forming)
            updates[(symbol, timeframe)] = (_ChartState(current, history, forming), frames)
        return updates

    def _candle_frame(
        self, symbol: str, timeframe: str, candle: Candle, closed: bool, history: Sequence[Candle]
    ) -> Outgoing:
        data = WsCandleData(
            symbol=symbol,
            timeframe=timeframe,
            candle=candle,
            closed=closed,
            indicators=overlay_values([*history, candle], timeframe),
        )
        return Outgoing(
            self.serialize(WsCandle(data=data)),
            key=f"candle:{symbol}:{timeframe}:{candle.time}",
            droppable=True,
            chart=(symbol, timeframe),
        )
