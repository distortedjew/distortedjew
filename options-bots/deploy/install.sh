#!/usr/bin/env bash
# Install or update the five bots + dashboard as systemd services (Ubuntu/Debian).
#   sudo bash deploy/install.sh
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST=/opt/options-bots
BOTS="atlas nova ranger volt orchard"

command -v python3 >/dev/null || { apt-get update && apt-get install -y python3; }
python3 -c "import venv, ensurepip" 2>/dev/null || { apt-get update && apt-get install -y python3-venv; }
id optionbots >/dev/null 2>&1 || useradd --system --home "$DEST" --shell /usr/sbin/nologin optionbots

mkdir -p "$DEST/data"
# copy code, never overwrite the live .env or data/
tar -C "$SRC" --exclude=.env --exclude=data --exclude=.venv --exclude=__pycache__ -cf - . | tar -C "$DEST" -xf -
[ -f "$DEST/.env" ] || { cp "$SRC/.env.example" "$DEST/.env"; echo ">> created $DEST/.env - add your Alpaca keys"; }
chmod 600 "$DEST/.env"

python3 -m venv "$DEST/.venv"
"$DEST/.venv/bin/pip" install -q --upgrade pip
"$DEST/.venv/bin/pip" install -q -r "$DEST/requirements.txt"
chown -R optionbots:optionbots "$DEST"

cp "$SRC/deploy/optionbot@.service" "$SRC/deploy/optionbots-dashboard.service" /etc/systemd/system/
systemctl daemon-reload
for b in $BOTS; do systemctl enable "optionbot@$b" >/dev/null; done
systemctl enable optionbots-dashboard >/dev/null

echo
echo "Installed to $DEST. Next:"
echo "  sudo nano $DEST/.env                       # Alpaca paper keys, dashboard password"
echo "  sudo systemctl restart 'optionbot@*' optionbots-dashboard   # (re)start everything"
echo "  systemctl status 'optionbot@*'             # are they running?"
echo "  journalctl -u optionbot@atlas -f           # live log of one bot"
