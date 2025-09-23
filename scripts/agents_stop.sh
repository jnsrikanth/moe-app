#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"

stop_agent() {
  local name="$1"
  local pidfile="$RUN_DIR/$name.pid"
  if [ -f "$pidfile" ]; then
    local pid
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" || true
      sleep 0.2
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pidfile"
    echo "Stopped $name"
  else
    echo "$name not running"
  fi
}

stop_agent router
stop_agent credit
stop_agent fraud
stop_agent esg
stop_agent web

echo "All services stopped."
