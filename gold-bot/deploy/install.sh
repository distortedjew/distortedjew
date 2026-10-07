#!/usr/bin/env bash
# Run on a Linux VPS as root, from the gold-bot directory: sudo bash deploy/install.sh
set -euo pipefail
id goldbot &>/dev/null || useradd --system --home /opt/gold-bot --shell /usr/sbin/nologin goldbot
mkdir -p /opt/gold-bot/logs /opt/gold-bot/data
cp -r goldbot requirements.txt /opt/gold-bot/
[ -f /opt/gold-bot/.env ] || { cp .env.example /opt/gold-bot/.env; echo "Edit /opt/gold-bot/.env (OANDA_TOKEN, OANDA_ACCOUNT_ID)"; }
chmod 600 /opt/gold-bot/.env
[ -d /opt/gold-bot/venv ] || python3 -m venv /opt/gold-bot/venv
/opt/gold-bot/venv/bin/pip install -q -r /opt/gold-bot/requirements.txt
chown -R goldbot:goldbot /opt/gold-bot
cp deploy/gold-bot.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now gold-bot
echo "Logs: journalctl -u gold-bot -f     Trades: /opt/gold-bot/logs/trades.jsonl"
