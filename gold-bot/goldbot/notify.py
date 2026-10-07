"""Optional Telegram alerts (set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID)."""
from __future__ import annotations

import logging

import requests

log = logging.getLogger("goldbot")


class Notifier:
    def __init__(self, token: str = "", chat_id: str = ""):
        self.token, self.chat_id = token, chat_id

    def send(self, text: str) -> None:
        if not (self.token and self.chat_id):
            return
        try:
            requests.post(f"https://api.telegram.org/bot{self.token}/sendMessage",
                          json={"chat_id": self.chat_id, "text": text}, timeout=10)
        except requests.RequestException as e:
            log.warning("telegram failed: %s", e)
