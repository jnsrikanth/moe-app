#!/usr/bin/env bash
set -euo pipefail

# Start local Python ML microservice (pure-stdlib) with safe logging
# Defaults: host 127.0.0.1, port 5055

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/python-ml-service"
LOG_DIR="${LOG_DIR_OVERRIDE:-$ROOT_DIR/logs}"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/python-ml-service.$(date +%Y%m%d-%H%M%S).log"

# Detect available python
PY_BIN=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1; then PY_BIN="$c"; break; fi
done
if [[ -z "$PY_BIN" ]]; then
  echo "ERROR: Python is required but was not found in PATH." >&2
  exit 1
fi

HOST="${PY_LOCAL_HOST:-127.0.0.1}"
PORT="${PY_LOCAL_PORT:-5055}"
LABEL="${LOCAL_ML_LABEL:-mlp-local}"

# If port is busy, fail fast (user can choose a different port)
if lsof -ti:"$PORT" >/dev/null 2>&1; then
  echo "ERROR: Port $PORT is busy. Set PY_LOCAL_PORT to a free port." >&2
  exit 1
fi

# Launch
echo "Starting Python ML service on http://$HOST:$PORT (label=$LABEL). Logs: $LOG_FILE"
(
  cd "$APP_DIR"
  PY_LOCAL_HOST="$HOST" PY_LOCAL_PORT="$PORT" LOCAL_ML_LABEL="$LABEL" \
  "$PY_BIN" app.py >>"$LOG_FILE" 2>&1 &
  echo $! > "$LOG_FILE.pid"
)

# Quick health check (best-effort)
sleep 0.5
if curl -sf "http://$HOST:$PORT/health" >/dev/null 2>&1; then
  echo "Python ML service is up."
else
  echo "WARNING: Health check failed, service may still be starting. See logs: $LOG_FILE"
fi
