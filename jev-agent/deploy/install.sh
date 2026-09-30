#!/usr/bin/env bash
# Run on the VPS as root, from the jev-agent directory: sudo bash deploy/install.sh
set -euo pipefail
id jev &>/dev/null || useradd --system --home /opt/jev-agent --shell /usr/sbin/nologin jev
mkdir -p /opt/jev-agent/logs
cp -r package.json package-lock.json tsconfig.json src public /opt/jev-agent/
[ -f /opt/jev-agent/.env ] || { cp .env.example /opt/jev-agent/.env; echo "Edit /opt/jev-agent/.env (set TYPESAFE_AI_API_KEY, MODEL=jev, FEED=binance)"; }
chmod 600 /opt/jev-agent/.env
(cd /opt/jev-agent && npm ci)
chown -R jev:jev /opt/jev-agent
cp deploy/jev-agent.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now jev-agent
echo "Logs: journalctl -u jev-agent -f     Decisions: /opt/jev-agent/logs/decisions.jsonl"
