"""Phone alerts through Telegram and/or Discord.

Messages are sent from a background thread so a slow or failing chat service
never delays trading. Repeated identical alerts (e.g. the same error every
minute) are suppressed for ALERT_DEDUPE_MIN minutes.

Test your setup:  python -m optionbots.notify "hello from the bots"
"""
from __future__ import annotations

import logging
import os
import queue
import threading
import time

import requests

log = logging.getLogger(__name__)

ICONS = {"open": "🟦", "win": "✅", "loss": "🔻", "warn": "⚠️", "error": "🛑", "info": "ℹ️"}


class Notifier:
    def __init__(self, telegram_token: str = "", telegram_chat: str = "", discord_url: str = "",
                 dedupe_min: float = 30, send=None):
        self.telegram_token, self.telegram_chat, self.discord_url = telegram_token, telegram_chat, discord_url
        self.dedupe_sec = dedupe_min * 60
        self.recent: dict[str, float] = {}
        self.lock = threading.Lock()
        self._send = send or self._post        # injectable for tests
        self.q: queue.Queue[str] = queue.Queue(maxsize=200)
        if self.enabled:
            threading.Thread(target=self._worker, name="notifier", daemon=True).start()

    @classmethod
    def from_env(cls) -> "Notifier":
        return cls(os.environ.get("TELEGRAM_BOT_TOKEN", ""), os.environ.get("TELEGRAM_CHAT_ID", ""),
                   os.environ.get("DISCORD_WEBHOOK_URL", ""), float(os.environ.get("ALERT_DEDUPE_MIN", 30)))

    @property
    def enabled(self) -> bool:
        return bool((self.telegram_token and self.telegram_chat) or self.discord_url)

    def alert(self, bot: str, kind: str, text: str, dedupe_key: str | None = None) -> bool:
        """Queue an alert. Returns False if disabled or suppressed as a duplicate."""
        if not self.enabled:
            return False
        key = dedupe_key or f"{bot}:{kind}:{text}"
        now = time.time()
        with self.lock:
            if now - self.recent.get(key, 0) < self.dedupe_sec:
                return False
            self.recent[key] = now
        msg = f"{ICONS.get(kind, '•')} {bot.upper()}: {text}"
        try:
            self.q.put_nowait(msg)
        except queue.Full:
            log.warning("alert queue full, dropping: %s", msg)
            return False
        return True

    def flush(self, timeout: float = 10) -> None:
        """Wait until queued alerts are sent (used by the CLI test and at shutdown)."""
        end = time.time() + timeout
        while not self.q.empty() and time.time() < end:
            time.sleep(0.1)
        time.sleep(0.2)

    def _worker(self) -> None:
        while True:
            msg = self.q.get()
            try:
                self._send(msg)
            except Exception as e:   # never let an alert failure reach the trading loop
                log.warning("alert failed: %s", e)

    def _post(self, msg: str) -> None:
        """Send to every configured channel; raise if any of them failed (after trying all)."""
        errors = []
        if self.telegram_token and self.telegram_chat:
            try:
                r = requests.post(f"https://api.telegram.org/bot{self.telegram_token}/sendMessage", timeout=15,
                                  json={"chat_id": self.telegram_chat, "text": msg, "disable_web_page_preview": True})
                if r.status_code >= 400:
                    errors.append(f"telegram {r.status_code}: {r.text[:200]}")
            except requests.RequestException as e:
                errors.append(f"telegram: {e}")
        if self.discord_url:
            try:
                r = requests.post(self.discord_url, json={"content": msg[:1900]}, timeout=15)
                if r.status_code >= 400:
                    errors.append(f"discord {r.status_code}: {r.text[:200]}")
            except requests.RequestException as e:
                errors.append(f"discord: {e}")
        if errors:
            raise RuntimeError("; ".join(errors))


if __name__ == "__main__":
    import sys

    from .config import load_dotenv

    load_dotenv()
    logging.basicConfig(level=logging.INFO)
    n = Notifier.from_env()
    if not n.enabled:
        raise SystemExit("No alert channel configured: set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID and/or DISCORD_WEBHOOK_URL in .env")
    try:
        n._send(f"{ICONS['info']} TEST: {' '.join(sys.argv[1:]) or 'alerts are working'}")
    except Exception as e:
        print(f"FAILED: {e}", file=sys.stderr)
        raise SystemExit(1)
    print("sent")
