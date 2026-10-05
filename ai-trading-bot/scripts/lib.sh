# shellcheck shell=bash disable=SC2034  # variables set here are read by the sourcing scripts
# Helpers shared by dev.sh and start.sh. Sourced, not executed.
#
# Each service runs in its own process group with its output prefixed ("[api] ..."). The
# supervisor stops every group when one service exits or on Ctrl-C / SIGTERM / SIGHUP:
# SIGTERM first, SIGKILL after STOP_TIMEOUT seconds (a second Ctrl-C forces it at once).

ORIG_PWD="$PWD"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
DASHBOARD="$ROOT/dashboard"
VENV="$BACKEND/.venv"
PY="$VENV/bin/python"
STOP_TIMEOUT="${STOP_TIMEOUT:-15}"

if [[ -t 1 ]]; then
  BOLD=$'\e[1m' DIM=$'\e[2m' RED=$'\e[31m' YELLOW=$'\e[33m' RESET=$'\e[0m'
else
  BOLD="" DIM="" RED="" YELLOW="" RESET=""
fi

log() { printf '%s==>%s %s\n' "$BOLD" "$RESET" "$*"; }
warn() { printf '%swarning:%s %s\n' "$YELLOW" "$RESET" "$*" >&2; }
die() {
  printf '%serror:%s %s\n' "$RED" "$RESET" "$*" >&2
  exit 1
}

# -- dependencies -------------------------------------------------------------------

# Create backend/.venv (Python 3.11+) and install the backend when it is missing.
# $1 = "dev" also installs the test and lint tools.
ensure_backend() {
  local extras="" python="${PYTHON:-}" candidate
  [[ "${1:-}" == dev ]] && extras="[dev]"
  if [[ ! -x "$PY" ]]; then
    if [[ -z "$python" ]]; then
      for candidate in python3.13 python3.12 python3.11 python3; do
        if command -v "$candidate" >/dev/null 2>&1; then
          python="$candidate"
          break
        fi
      done
    fi
    [[ -n "$python" ]] || die "Python 3.11+ not found; install it or set PYTHON=/path/to/python3.11"
    "$python" -c 'import sys; sys.exit(sys.version_info < (3, 11))' \
      || die "$python is $("$python" -V 2>&1); Python 3.11+ is required (set PYTHON=...)"
    log "Creating backend/.venv with $("$python" -V 2>&1)"
    "$python" -m venv "$VENV" || die "Could not create the virtualenv (Debian/Ubuntu: apt install python3-venv)"
  fi
  if ! (cd / && "$PY" -c 'import fastapi, uvicorn, pydantic_settings, numpy, psutil, websockets, tradebot') \
    >/dev/null 2>&1; then
    log "Installing the backend into backend/.venv"
    "$PY" -m pip install --disable-pip-version-check -q --upgrade pip
    "$PY" -m pip install --disable-pip-version-check -q -e "$BACKEND$extras"
  fi
}

# Install the dashboard's npm packages when they are missing (Node.js 22.12+).
ensure_dashboard_deps() {
  command -v npm >/dev/null 2>&1 || die "npm not found; install Node.js 22.12 or newer"
  node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 12) ? 0 : 1)' \
    || die "Node.js $(node -v) is too old; the dashboard needs 22.12 or newer"
  if [[ ! -x "$DASHBOARD/node_modules/.bin/vite" ]]; then
    log "Installing dashboard packages (npm ci)"
    (cd "$DASHBOARD" && npm ci --no-audit --no-fund)
  fi
}

# Resolve the configuration exactly as the Python processes will (environment, then
# ai-trading-bot/.env and backend/.env). Sets DB_PATH, API_HOST_CFG, API_PORT_CFG,
# AUTH_ENABLED (0/1) and DIST_DIR. A relative TRADEBOT_DB is taken from the directory the
# script was started in and exported as an absolute path, so the engine and the API always
# open the same database.
resolve_config() {
  local out
  out="$(cd "$ORIG_PWD" && "$PY" - <<'PY'
from tradebot.config import EnvConfig

config = EnvConfig()
print(config.tradebot_db.expanduser().resolve())
print(config.api_host)
print(config.api_port)
print(1 if config.dashboard_token and config.dashboard_token.get_secret_value().strip() else 0)
print(config.dashboard_dist.expanduser().resolve())
PY
)" || die "Could not read the configuration (check the environment and .env)"
  {
    read -r DB_PATH
    read -r API_HOST_CFG
    read -r API_PORT_CFG
    read -r AUTH_ENABLED
    read -r DIST_DIR
  } <<<"$out"
  export TRADEBOT_DB="$DB_PATH"
}

# A host name for URLs that reach the API from this machine.
local_host() {
  case "$1" in
    "" | 0.0.0.0 | :: | "[::]") echo 127.0.0.1 ;;
    *:*) echo "[$1]" ;;
    *) echo "$1" ;;
  esac
}

is_loopback() {
  case "$1" in
    127.* | localhost | ::1 | "[::1]") return 0 ;;
    *) return 1 ;;
  esac
}

# -- supervision ----------------------------------------------------------------------

PIDS=()
NAMES=()

_prefix() {
  local label="$1" line
  trap '' INT TERM HUP # keep relaying the service's last words while it shuts down
  while IFS= read -r line || [[ -n "$line" ]]; do
    printf '%s %s\n' "$label" "$line"
  done
}

# run NAME COLOR COMMAND... : start a service in its own process group.
run() {
  local name="$1" color="$2" label
  shift 2
  label="$(printf '%-6s' "[$name]")"
  [[ -t 1 ]] && label="$color$label$RESET"
  set -m # job control on only while forking: the service gets its own process group
  # The subshell outlives the stop signal (a handler, unlike an ignore, is not inherited by
  # the service), so its exit means the whole pipeline is done. Its own stderr only carries
  # bash's "Terminated" notices; the service's output goes through the prefixer.
  (
    trap ':' INT TERM HUP
    "$@" </dev/null 2>&1 | _prefix "$label"
  ) 2>/dev/null &
  PIDS+=("$!")
  NAMES+=("$name")
  set +m
}

_signal_all() {
  local pid
  for pid in "${PIDS[@]}"; do
    kill "-$1" -- "-$pid" 2>/dev/null || true
  done
}

_any_alive() {
  local pid
  for pid in "${PIDS[@]}"; do
    kill -0 "$pid" 2>/dev/null && return 0
  done
  return 1
}

stop_all() {
  local code="${1:-0}" deadline
  trap 'printf "\n"; log "Forcing shutdown"; _signal_all KILL; exit "$code"' INT TERM HUP
  log "Stopping ${NAMES[*]}…"
  _signal_all TERM
  deadline=$((SECONDS + STOP_TIMEOUT))
  while _any_alive && ((SECONDS < deadline)); do
    sleep 0.2
  done
  if _any_alive; then
    warn "Still running after ${STOP_TIMEOUT}s; killing"
  fi
  _signal_all KILL
  exit "$code"
}

# Wait until a service exits (then stop the others and exit with its status) or until
# Ctrl-C / SIGTERM / SIGHUP.
supervise() {
  local i code
  trap 'printf "\n"; stop_all 130' INT
  trap 'stop_all 143' TERM
  trap 'stop_all 129' HUP
  while true; do
    for i in "${!PIDS[@]}"; do
      if ! kill -0 "${PIDS[$i]}" 2>/dev/null; then
        code=0
        wait "${PIDS[$i]}" || code=$?
        if ((code == 0)); then
          log "${NAMES[$i]} exited"
        else
          warn "${NAMES[$i]} exited with status $code"
        fi
        stop_all "$code"
      fi
    done
    sleep 1
  done
}
