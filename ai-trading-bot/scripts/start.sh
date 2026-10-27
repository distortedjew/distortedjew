#!/usr/bin/env bash
# Production: the trading engine plus the API serving the built dashboard on one port.
#
#   scripts/start.sh            build the dashboard if dashboard/dist is missing, then run
#   scripts/start.sh --build    rebuild the dashboard first (after pulling new code)
#
# Creates backend/.venv and installs the backend when it is missing. Configuration comes
# from the environment and ai-trading-bot/.env (see .env.example). Ctrl-C or SIGTERM stops
# both processes; if either one exits, the other is stopped too and the script exits with
# that status, so a process manager (systemd, supervisord, Docker) can restart the pair.
#
# Script-only options: PYTHON (interpreter used to create the virtualenv), STOP_TIMEOUT
# (seconds to wait for a graceful stop before killing, default 15).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

build=0
for arg in "$@"; do
  case "$arg" in
    --build) build=1 ;;
    -h | --help)
      sed -n '2,/^set -euo/p' "$0" | sed -e '$d' -e 's/^# \{0,1\}//'
      exit 0
      ;;
    *) die "unknown option: $arg (see --help)" ;;
  esac
done

ensure_backend
resolve_config

if ((build)) || [[ ! -f "$DIST_DIR/index.html" ]]; then
  [[ "$DIST_DIR" == "$DASHBOARD/dist" ]] \
    || die "DASHBOARD_DIST=$DIST_DIR has no index.html; build it there or unset DASHBOARD_DIST"
  ensure_dashboard_deps
  log "Building the dashboard"
  (cd "$DASHBOARD" && npm run build)
fi

url="http://$(local_host "$API_HOST_CFG"):$API_PORT_CFG"
log "AI Trading Bot"
printf '    %-10s %s\n' database "$DB_PATH" dashboard "$url" api "$url/api/docs"
if ! is_loopback "$API_HOST_CFG" && [[ "$AUTH_ENABLED" != 1 ]]; then
  warn "API_HOST=$API_HOST_CFG exposes the dashboard to the network without a password;" \
    "set DASHBOARD_TOKEN to require one"
fi

cd "$BACKEND"
run engine $'\e[36m' "$PY" -m tradebot.engine_main
run api $'\e[35m' "$PY" -m tradebot.api.main
supervise
