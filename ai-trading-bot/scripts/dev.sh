#!/usr/bin/env bash
# Development: trading engine + API (auto-reload) + Vite dev server, all on one database.
#
#   scripts/dev.sh                       dashboard on http://localhost:5173
#   FEED=simulated scripts/dev.sh        skip Binance, use the deterministic simulator
#   TRADEBOT_DB=/tmp/demo.db scripts/dev.sh   start from a fresh database
#
# Creates backend/.venv and installs the backend (with test / lint tools) and the
# dashboard's npm packages when they are missing. Ctrl-C stops everything.
#
# The Python processes read the environment and ai-trading-bot/.env (see .env.example):
# TRADEBOT_DB, FEED, API_HOST, API_PORT, OPENROUTER_API_KEY, ... Script-only options:
#   DASHBOARD_PORT   Vite dev server port (default 5173)
#   VITE_API_PROXY   where Vite proxies /api and /ws (default: this API)
#   PYTHON           interpreter used to create the virtualenv (default: newest python3.11+)
#   STOP_TIMEOUT     seconds to wait for a graceful stop before killing (default 15)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

ensure_backend dev
ensure_dashboard_deps
resolve_config

api_url="http://$(local_host "$API_HOST_CFG"):$API_PORT_CFG"
export VITE_API_PROXY="${VITE_API_PROXY:-$api_url}"
export DASHBOARD_PORT="${DASHBOARD_PORT:-5173}"

log "AI Trading Bot — development"
printf '    %-10s %s\n' database "$DB_PATH" dashboard "http://localhost:$DASHBOARD_PORT" \
  api "$api_url/api/docs"
printf '    %sCtrl-C stops everything.%s\n' "$DIM" "$RESET"

cd "$BACKEND"
run engine $'\e[36m' "$PY" -m tradebot.engine_main
run api $'\e[35m' "$PY" -m tradebot.api.main --reload
cd "$DASHBOARD"
run web $'\e[32m' npm run dev
supervise
