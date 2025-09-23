#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
export PYTHONPATH="$ROOT_DIR/agents"
export LOG_LEVEL="WARNING"
export DISABLE_VERTEX="${DISABLE_VERTEX:-1}"
export USE_ML="${USE_ML:-1}"

mkdir -p "$RUN_DIR"

start_agent() {
  local name="$1" module="$2" port="$3" vname="$4"
  local venv="$ROOT_DIR/.venv/$vname/bin/python"
  if [ ! -x "$venv" ]; then
    echo "ERROR: venv for $name not found. Run: yarn agents:install" >&2
    exit 1
  fi
  local logfile="$RUN_DIR/$name.log"
  local pidfile="$RUN_DIR/$name.pid"
  if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    echo "$name already running (PID $(cat "$pidfile"))."
    return 0
  fi
  echo "Starting $name on :$port"
  PORT="$port" "$venv" -m uvicorn "$module":app --host 0.0.0.0 --port "$port" >"$logfile" 2>&1 &
  echo $! >"$pidfile"
}

start_agent credit agents.credit_agent.main 8081 credit
start_agent fraud agents.fraud_agent.main 8082 fraud
start_agent esg agents.esg_agent.main 8083 esg
start_agent router agents.moe_router.main 8080 router

echo "All agents started. Router: http://localhost:8080"
