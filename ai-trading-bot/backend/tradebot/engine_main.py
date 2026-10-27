"""Command-line entry point of the trading engine.

    python -m tradebot.engine_main [--db PATH] [--feed auto|binance|simulated]
                                   [--bootstrap-days N] [--reset] [--log-level LEVEL]

(also installed as ``tradebot-engine``). Configuration comes from the environment / ``.env``
(``tradebot.config``); the flags override the database path, the feed and the bootstrap length
for this run. ``--reset`` deletes the database first (a fresh install: on the simulator the
bootstrap replays its history again). SIGINT / SIGTERM stop the engine gracefully.

Log lines never contain secrets: every configured secret value is masked by the formatter.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import logging
import signal
import sys
from collections.abc import Sequence
from pathlib import Path

from .config import VERSION, EnvConfig, get_config
from .db import Database
from .engine import Engine


class ScrubbingFormatter(logging.Formatter):
    """Masks every configured secret in the final log text (messages and tracebacks alike)."""

    def __init__(self, fmt: str, secrets: Sequence[str]) -> None:
        super().__init__(fmt)
        self.secrets = sorted((s for s in secrets if s), key=len, reverse=True)

    def format(self, record: logging.LogRecord) -> str:
        text = super().format(record)
        for secret in self.secrets:
            text = text.replace(secret, "***")
        return text


def configure_logging(level: str, cfg: EnvConfig) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(
        ScrubbingFormatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s", cfg.secret_values())
    )
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
    for noisy in ("httpx", "httpcore", "websockets"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="tradebot-engine",
        description="AI trading bot engine (paper trading): market data, AI analyst, risk manager and paper broker.",
    )
    parser.add_argument("--db", type=Path, default=None, help="SQLite database path (default: TRADEBOT_DB)")
    parser.add_argument(
        "--feed",
        choices=("auto", "binance", "simulated"),
        default=None,
        help="market data source (default: FEED, normally auto = Binance with simulator fallback)",
    )
    parser.add_argument(
        "--bootstrap-days",
        type=int,
        default=None,
        metavar="N",
        help="days of simulated history to replay on an empty database (default: SIM_BOOTSTRAP_DAYS; 0 disables)",
    )
    parser.add_argument("--reset", action="store_true", help="delete the database before starting")
    parser.add_argument("--log-level", default=None, help="logging level (default: LOG_LEVEL)")
    return parser.parse_args(argv)


def reset_database(path: Path) -> list[Path]:
    """Delete the database and its WAL / shared-memory files; returns the files removed."""
    removed: list[Path] = []
    for suffix in ("", "-wal", "-shm"):
        candidate = path.with_name(path.name + suffix)
        if candidate.exists():
            candidate.unlink()
            removed.append(candidate)
    return removed


async def _serve(engine: Engine) -> None:
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        with contextlib.suppress(NotImplementedError, RuntimeError):
            loop.add_signal_handler(sig, engine.stop)
    await engine.run()


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    cfg = get_config()
    configure_logging(args.log_level or cfg.log_level, cfg)
    log = logging.getLogger("tradebot.engine")
    if cfg.trading_mode == "live":
        log.error(
            "TRADING_MODE=live is not implemented in this build: the engine only paper trades. "
            "Set TRADING_MODE=paper (or remove it) to start."
        )
        return 2
    if args.bootstrap_days is not None and args.bootstrap_days < 0:
        log.error("--bootstrap-days must be 0 or more")
        return 2
    db_path = (args.db or cfg.tradebot_db).expanduser().resolve()
    if args.reset:
        removed = reset_database(db_path)
        log.info(
            "Reset: removed %s",
            ", ".join(str(p) for p in removed) if removed else "nothing (no database yet)",
        )
    log.info("AI trading bot engine %s — paper trading — database %s", VERSION, db_path)
    db = Database(db_path)
    engine = Engine(cfg, db, feed=args.feed, bootstrap_days=args.bootstrap_days)
    try:
        asyncio.run(_serve(engine))
    except KeyboardInterrupt:
        pass
    except Exception:
        log.exception("Engine failed")
        return 1
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
