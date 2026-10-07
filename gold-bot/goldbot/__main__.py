"""python -m goldbot   (runs forever; Ctrl+C or systemctl stop to end)"""
import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

from .bot import GoldBot
from .config import Config


def main() -> None:
    cfg = Config.from_env()
    Path(cfg.log_dir).mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.StreamHandler(sys.stdout),
                  RotatingFileHandler(Path(cfg.log_dir) / "goldbot.log", maxBytes=5_000_000, backupCount=5)],
    )
    try:
        GoldBot(cfg).run()
    except KeyboardInterrupt:
        logging.getLogger("goldbot").info("stopped by user")


if __name__ == "__main__":
    main()
