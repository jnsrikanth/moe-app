#!/usr/bin/env bash
# Verify Yarn Berry zero-install build and run with health checks
# - Frees ports 3000-3005
# - Offline install from .yarn/cache (unless --allow-network)
# - Starts dev server with vendored Yarn CLI if needed
# - Logs to ./logs with rotation, falling back to /tmp if not writable
# - Health checks on / and /health
# - Prints SUCCESS/FAIL summary

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()  { printf "%b\n" "${BLUE}[INFO]${NC} $*"; }
ok()    { printf "%b\n" "${GREEN}[OK]${NC}   $*"; }
warn()  { printf "%b\n" "${YELLOW}[WARN]${NC} $*"; }
err()   { printf "%b\n" "${RED}[ERR]${NC}  $*"; }

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  --port <port>          Port to run on (default: 3000)
  --allow-network        Allow network during yarn install (default: offline)
  --skip-build           Skip yarn build step (dev only)
  --help                 Show this help

Environment variables:
  LOG_DIR                Where to write logs (default: ./logs, fallback: /tmp/moe-app-logs)
  VENDORED_YARN         Path to vendored Yarn CLI (default: .yarn/releases/yarn-4.10.2.cjs)
EOF
}

PORT=3000
ALLOW_NETWORK=0
SKIP_BUILD=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      PORT="$2"; shift 2;;
    --allow-network)
      ALLOW_NETWORK=1; shift;;
    --skip-build)
      SKIP_BUILD=1; shift;;
    --help|-h)
      usage; exit 0;;
    *)
      err "Unknown option: $1"; usage; exit 1;;
  esac
done

# Determine Yarn command (vendored preferred)
VENDORED_YARN=${VENDORED_YARN:-".yarn/releases/yarn-4.10.2.cjs"}
if [[ -f "$VENDORED_YARN" ]]; then
  YARN_CMD=(node "$VENDORED_YARN")
elif command -v yarn >/dev/null 2>&1; then
  YARN_CMD=(yarn)
else
  # Try corepack if available
  if command -v corepack >/dev/null 2>&1; then
    info "Enabling Corepack to provision Yarn..."
    corepack enable || true
  fi
  if command -v yarn >/dev/null 2>&1; then
    YARN_CMD=(yarn)
  else
    err "Yarn is not available and vendored CLI not found at $VENDORED_YARN"
    err "Ensure $VENDORED_YARN exists or install Yarn/Corepack."
    exit 1
  fi
fi

PROJECT_NAME=$(node -pe "require('./package.json').name" 2>/dev/null || echo moe-app)

# Prepare logs dir (prefer repo logs)
DEFAULT_LOG_DIR="${LOG_DIR:-$ROOT_DIR/logs}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_DIR_RESOLVED="$DEFAULT_LOG_DIR"
mkdir -p "$LOG_DIR_RESOLVED" 2>/dev/null || true
if [[ ! -w "$LOG_DIR_RESOLVED" ]]; then
  # Hardened fallback chain for locked-down systems (no symlinks, restricted dirs)
  warn "Log dir $LOG_DIR_RESOLVED not writable, trying temp locations"
  if [[ -n "${TMPDIR:-}" ]] && mkdir -p "$TMPDIR/moe-app-logs" 2>/dev/null && [[ -w "$TMPDIR/moe-app-logs" ]]; then
    LOG_DIR_RESOLVED="$TMPDIR/moe-app-logs"
  elif [[ -n "${TEMP:-}" ]] && mkdir -p "$TEMP/moe-app-logs" 2>/dev/null && [[ -w "$TEMP/moe-app-logs" ]]; then
    LOG_DIR_RESOLVED="$TEMP/moe-app-logs"
  elif mkdir -p "/tmp/moe-app-logs" 2>/dev/null && [[ -w "/tmp/moe-app-logs" ]]; then
    LOG_DIR_RESOLVED="/tmp/moe-app-logs"
  else
    err "No writable log directory available. Set LOG_DIR to a writable path and retry."
    exit 1
  fi
fi
APP_LOG="$LOG_DIR_RESOLVED/app-dev-$TIMESTAMP.log"
LAUNCH_LOG="$LOG_DIR_RESOLVED/dev-launch-$TIMESTAMP.out"
# On hardened Windows environments, symlinks may be disallowed. Use marker files instead of symlinks.
echo "$APP_LOG" > "$LOG_DIR_RESOLVED/app-dev.latest" 2>/dev/null || true
echo "$LAUNCH_LOG" > "$LOG_DIR_RESOLVED/dev-launch.latest" 2>/dev/null || true

rotate_logs() {
  # keep last 10 matching files
  ls -1t "$LOG_DIR_RESOLVED"/app-dev-*.log 2>/dev/null | tail -n +11 | xargs -r rm -f || true
  ls -1t "$LOG_DIR_RESOLVED"/dev-launch-*.out 2>/dev/null | tail -n +11 | xargs -r rm -f || true
}

free_ports_unix() {
  for p in 3000 3001 3002 3003 3004 3005; do
    if command -v lsof >/dev/null 2>&1; then
      lsof -tiTCP:$p -sTCP:LISTEN | xargs -r kill -9 || true
    else
      # netstat/grep fallback
      PIDS=$(netstat -anp 2>/dev/null | awk -v port=:$p '$0 ~ port && /LISTEN/ {print $7}' | sed 's/\/.*//' || true)
      if [[ -n "$PIDS" ]]; then kill -9 $PIDS 2>/dev/null || true; fi
    fi
  done
}

free_ports_win() {
  # PowerShell-based port free for Windows environments
  if command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -Command '
      $ports = 3000,3001,3002,3003,3004,3005;
      foreach ($p in $ports) {
        Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |
          ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
      }
    ' || true
  elif command -v pwsh >/dev/null 2>&1; then
    pwsh -NoProfile -Command '
      $ports = 3000,3001,3002,3003,3004,3005;
      foreach ($p in $ports) {
        Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |
          ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
      }
    ' || true
  fi
}

free_ports() {
  case "$(uname -s 2>/dev/null)" in
    MINGW*|MSYS*|CYGWIN*) free_ports_win;;
    *) free_ports_unix;;
  esac
}

kill_existing() {
  if "${YARN_CMD[@]}" run kill-dev >/dev/null 2>&1; then
    ok "Ran kill-dev script"
  fi
  free_ports
}

install_offline() {
  info "Installing dependencies (offline=$((1-ALLOW_NETWORK)) to $((ALLOW_NETWORK)))..."
  if [[ "$ALLOW_NETWORK" -eq 0 ]]; then
    YARN_ENABLE_NETWORK=0 "${YARN_CMD[@]}" install --immutable
  else
    "${YARN_CMD[@]}" install --immutable
  fi
  ok "Install complete"
}

build_app() {
  if [[ "$SKIP_BUILD" -eq 1 ]]; then
    info "Skipping build step per flag"
    return 0
  fi
  info "Building app..."
  "${YARN_CMD[@]}" build
  ok "Build complete"
}

start_server() {
  info "Starting dev server on 0.0.0.0:$PORT (logs: $APP_LOG)"
  rotate_logs
  if command -v nohup >/dev/null 2>&1; then
    HOST=0.0.0.0 TRUST_PROXY=1 PORT="$PORT" LOG_FILE="$APP_LOG" \
      nohup "${YARN_CMD[@]}" dev >>"$LAUNCH_LOG" 2>&1 &
  else
    HOST=0.0.0.0 TRUST_PROXY=1 PORT="$PORT" LOG_FILE="$APP_LOG" \
      "${YARN_CMD[@]}" dev >>"$LAUNCH_LOG" 2>&1 &
  fi
  echo $! > .dev-server.pid
  sleep 3
  PID=$(cat .dev-server.pid 2>/dev/null || true)
  if [[ -n "${PID}" ]] && ps -p "$PID" >/dev/null 2>&1; then
    ok "Server started (pid=$PID)"
  else
    err "Server failed to start; see $LAUNCH_LOG and $APP_LOG"
    return 1
  fi
}

health_checks() {
  info "Running health checks..."
  local ok_root=1 ok_health=1 code_root=0 code_health=0

  # Determine the actual port in case the launcher chose a different one
  local PORT_USED="$PORT"
  if [[ -f "$LAUNCH_LOG" ]]; then
    local chosen
    chosen=$(grep -Eo 'Starting MoE server on port [0-9]+' "$LAUNCH_LOG" | awk '{print $6}' | tail -n1 || true)
    if [[ -z "$chosen" ]]; then
      chosen=$(grep -Eo 'Port [0-9]+ is available' "$LAUNCH_LOG" | awk '{print $2}' | tail -n1 || true)
    fi
    if [[ -n "$chosen" ]]; then PORT_USED="$chosen"; fi
  fi

  # wait up to 20s for /health to return 200
  for i in {1..20}; do
    code_health=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT_USED/health" || echo 000)
    if [[ "$code_health" == "200" ]]; then break; fi
    sleep 1
  done

  code_root=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT_USED/" || echo 000)

  if [[ "$code_root" == "200" ]]; then ok_root=0; fi
  if [[ "$code_health" == "200" ]]; then ok_health=0; fi

  if [[ $ok_root -eq 0 ]]; then ok "/ returned 200"; else err "/ returned $code_root"; fi
  if [[ $ok_health -eq 0 ]]; then ok "/health returned 200"; else err "/health returned $code_health"; fi

  if [[ $ok_root -eq 0 && $ok_health -eq 0 ]]; then
    return 0
  else
    return 1
  fi
}

summary_success() {
  printf "%b\n" "${GREEN}SUCCESS:${NC} $PROJECT_NAME is running on http://localhost:$PORT"
  printf "%b\n" "Logs: $APP_LOG (app), $LAUNCH_LOG (launcher)"
}

summary_failure() {
  printf "%b\n" "${RED}FAILED:${NC} $PROJECT_NAME did not pass health checks"
  printf "%b\n" "Logs: $APP_LOG (app), $LAUNCH_LOG (launcher)"
  printf "%b\n" "Last 80 lines of app log:"; tail -n 80 "$APP_LOG" 2>/dev/null || true
  printf "%b\n" "Last 80 lines of launcher log:"; tail -n 80 "$LAUNCH_LOG" 2>/dev/null || true
}

main() {
  info "Project root: $ROOT_DIR"
  info "Using Yarn: ${YARN_CMD[*]}"
  info "Log dir: $LOG_DIR_RESOLVED"

  info "Step 1: Kill existing dev servers and free ports"
  kill_existing || true

  info "Step 2: Clean node_modules"
  rm -rf node_modules

  info "Step 3: Install dependencies"
  install_offline

  info "Step 4: Build (can be skipped with --skip-build)"
  build_app

  info "Step 5: Start server"
  start_server || { summary_failure; exit 1; }

  info "Step 6: Health checks"
  if health_checks; then
    summary_success
  else
    summary_failure
    exit 1
  fi
}

main "$@"
