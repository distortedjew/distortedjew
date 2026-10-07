"""The live engine against temporary databases: bootstrap, restart recovery, fallback, settings."""

from __future__ import annotations

import asyncio
import time
from pathlib import Path

import pytest

from tradebot import engine_main
from tradebot.config import EnvConfig
from tradebot.db import Database
from tradebot.engine import Engine


def config(tmp_path: Path, **kw) -> EnvConfig:
    return EnvConfig(_env_file=None, tradebot_db=tmp_path / "engine.db", **kw)


async def run_for(engine: Engine, seconds: float) -> None:
    task = asyncio.create_task(engine.run())
    deadline = time.monotonic() + 120
    while engine._phase is not None and time.monotonic() < deadline and not task.done():  # still starting
        await asyncio.sleep(0.2)
    await asyncio.sleep(seconds)
    engine.stop()
    await asyncio.wait_for(task, timeout=30)


def count(db: Database, sql: str, params: tuple = ()) -> int:
    return int(db.read_one(sql, params)[0])


async def test_bootstrap_replays_14_days_quickly(tmp_path):
    cfg = config(tmp_path, feed="simulated")
    db = Database(cfg.tradebot_db)
    engine = Engine(cfg, db, bootstrap_days=14)
    t0 = time.perf_counter()
    await run_for(engine, 3.0)
    info = engine.bootstrap_info
    assert info is not None and info["duration_sec"] < 60 and time.perf_counter() - t0 < 90
    assert info["decisions"] == 14 * 288 * 3
    assert count(db, "SELECT COUNT(*) FROM trades") == info["trades"] > 0
    assert (
        count(
            db,
            "SELECT COUNT(*) FROM notifications WHERE read = 0 AND type IN ('TRADE_OPENED', 'TRADE_CLOSED', 'STOP_LOSS_HIT', 'TAKE_PROFIT_HIT')",
        )
        == 0
    )
    boot = db.read_one("SELECT ts FROM events WHERE json_extract(payload, '$.title') = 'Bootstrap complete'")[
        0
    ]
    assert count(db, "SELECT COUNT(*) FROM events WHERE type = 'MARKET_UPDATE' AND ts < ?", (boot,)) == 0
    # historical timestamps: the first decision is about 14 days old
    first = db.read_one("SELECT MIN(created_at) FROM ai_decisions")[0]
    assert first < boot[:8]  # an earlier month or day prefix than now
    assert count(db, "SELECT COUNT(*) FROM equity_snapshots") >= 14 * 1440
    for key in (
        "status",
        "portfolio",
        "positions",
        "risk",
        "ticker:BTC/USDT",
        "mtf:BTC/USDT",
        "regime:BTC/USDT",
    ):
        assert db.get_live(key) is not None, key
    status = db.get_live("status")
    assert status["running"] is False and status["feed"] == "simulated"  # stopped cleanly
    db.close()


async def test_restart_recovers_state_without_a_second_bootstrap(tmp_path):
    cfg = config(tmp_path, feed="simulated")
    db = Database(cfg.tradebot_db)
    await run_for(Engine(cfg, db, bootstrap_days=3), 2.5)
    before_positions = {r[0] for r in db.read("SELECT id FROM positions")}
    before_trades = {r[0]: r[1] for r in db.read("SELECT id, pnl FROM trades")}
    last_equity = db.read_one("SELECT equity FROM equity_snapshots ORDER BY time DESC LIMIT 1")[0]
    versions = db.live_versions()
    second = Engine(cfg, db, bootstrap_days=3)
    await run_for(second, 2.5)
    assert (
        count(db, "SELECT COUNT(*) FROM events WHERE json_extract(payload, '$.title') = 'Bootstrap complete'")
        == 1
    )
    assert second.bootstrap_info is None
    after_positions = {r[0] for r in db.read("SELECT id FROM positions")}
    closed_since = {r[0] for r in db.read("SELECT id FROM trades")}
    assert before_positions <= after_positions | closed_since  # every position survived or closed as a trade
    after_trades = {r[0]: r[1] for r in db.read("SELECT id, pnl FROM trades")}
    assert all(after_trades[k] == v for k, v in before_trades.items())  # history untouched
    portfolio = db.get_live("portfolio")
    assert portfolio["equity"] == pytest.approx(last_equity, rel=0.01)
    assert db.live_versions()["status"] > versions["status"]
    db.close()


async def test_auto_feed_falls_back_to_the_simulator(tmp_path):
    cfg = config(
        tmp_path, feed="auto", binance_rest_url="http://127.0.0.1:9", binance_ws_url="ws://127.0.0.1:9"
    )
    db = Database(cfg.tradebot_db)
    t0 = time.perf_counter()
    engine = Engine(cfg, db, bootstrap_days=1)
    await run_for(engine, 1.5)
    assert engine.feed is not None and engine.feed.kind == "simulated"
    assert time.perf_counter() - t0 < 60
    warning = db.read_one("SELECT payload FROM events WHERE type = 'SYSTEM_WARNING'")
    assert warning is not None and "market_data" in warning[0]
    assert count(db, "SELECT COUNT(*) FROM notifications WHERE type = 'MARKET_DATA_UNAVAILABLE'") == 1
    assert db.get_live("status")["feed"] == "simulated"
    db.close()


async def test_settings_are_applied_live(tmp_path):
    cfg = config(tmp_path, feed="simulated")
    db = Database(cfg.tradebot_db)
    engine = Engine(cfg, db, bootstrap_days=1)
    task = asyncio.create_task(engine.run())
    while engine._phase is not None or engine.core is None:
        await asyncio.sleep(0.2)
    settings = db.get_settings()
    settings.trading.strategy = "baseline"
    settings.trading.symbols = ["BTC/USDT", "ETH/USDT"]
    saved = db.save_settings(settings)
    for _ in range(40):
        await asyncio.sleep(0.25)
        status = db.get_live("status")
        if status and status["settings_version"] == saved.version:
            break
    engine.stop()
    await asyncio.wait_for(task, timeout=30)
    assert status["settings_version"] == saved.version and status["strategy"] == "baseline"
    assert engine.core.settings.trading.strategy == "baseline"
    assert (
        db.read_one(
            "SELECT COUNT(*) FROM events WHERE json_extract(payload, '$.data.component') = 'settings'"
        )[0]
        == 1
    )
    db.close()


def test_live_trading_mode_is_refused(tmp_path, monkeypatch):
    with pytest.raises(RuntimeError, match="not implemented"):
        asyncio.run(Engine(config(tmp_path, trading_mode="live"), Database(tmp_path / "x.db")).start())
    monkeypatch.setenv("TRADING_MODE", "live")
    engine_main.get_config.cache_clear()
    try:
        assert engine_main.main(["--db", str(tmp_path / "y.db")]) == 2
    finally:
        engine_main.get_config.cache_clear()
    assert not (tmp_path / "y.db").exists()


def test_cli_reset_removes_the_database_files(tmp_path):
    path = tmp_path / "bot.db"
    for suffix in ("", "-wal", "-shm"):
        Path(str(path) + suffix).write_text("x")
    assert len(engine_main.reset_database(path)) == 3 and not path.exists()


def test_log_formatter_masks_secrets():
    fmt = engine_main.ScrubbingFormatter("%(message)s", ["sk-secret-123"])
    import logging

    record = logging.LogRecord("x", logging.INFO, __file__, 1, "key is %s", ("sk-secret-123",), None)
    assert fmt.format(record) == "key is ***"
