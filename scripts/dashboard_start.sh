#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
mkdir -p "$RUN_DIR"

PORT="${DASHBOARD_PORT:-8090}"
# Choose venv python based on OS
PY_BIN_DIR="$ROOT_DIR/.venv/dashboard/bin"
case "$(uname -s 2>/dev/null || echo unknown)" in MINGW*|MSYS*|CYGWIN*) PY_BIN_DIR="$ROOT_DIR/.venv/dashboard/Scripts";; esac
PY="$PY_BIN_DIR/python"
LOG="$RUN_DIR/web.log"
PID="$RUN_DIR/web.pid"

if [ ! -x "$PY" ]; then
  echo "ERROR: dashboard venv missing. Run: bash scripts/agents_install.sh" >&2
  exit 1
fi

if [ -f "$PID" ] && kill -0 "$(cat "$PID")" 2>/dev/null; then
  echo "Web dashboard already running (PID $(cat "$PID"))."
  exit 0
fi

echo "Starting web dashboard on :$PORT"
PORT="$PORT" "$PY" -m uvicorn web.app:app --host 0.0.0.0 --port "$PORT" >"$LOG" 2>&1 &
echo $! >"$PID"
echo "Web dashboard started: http://localhost:$PORT"
