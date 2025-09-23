#!/usr/bin/env bash
set -euo pipefail

# Single offline deploy script (no Docker, no Yarn/NPM)
# - Sets env vars for offline ML mode
# - Installs Python deps from vendored wheels
# - Starts all agents (router, credit, fraud, esg)
# - Verifies health
# - Prints service URLs

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# -------- Configuration (override via env or .env.local) --------
export LOG_LEVEL="${LOG_LEVEL:-WARNING}"
export DISABLE_VERTEX="${DISABLE_VERTEX:-1}"
export USE_ML="${USE_ML:-1}"
export ROUTER_STRATEGY="${ROUTER_STRATEGY:-ml}"
export CREDIT_MODEL_PATH="${CREDIT_MODEL_PATH:-models/credit.joblib}"
export FRAUD_MODEL_PATH="${FRAUD_MODEL_PATH:-models/fraud.joblib}"
export ESG_MODEL_PATH="${ESG_MODEL_PATH:-models/esg.joblib}"
export ROUTER_MODEL_PATH="${ROUTER_MODEL_PATH:-models/router.joblib}"

# Ports (router 8080, credit 8081, fraud 8082, esg 8083)
export ROUTER_PORT="${ROUTER_PORT:-8080}"
export CREDIT_PORT="${CREDIT_PORT:-8081}"
export FRAUD_PORT="${FRAUD_PORT:-8082}"
export ESG_PORT="${ESG_PORT:-8083}"

# Load .env.local if present
if [ -f .env.local ]; then
  # shellcheck source=/dev/null
  source .env.local
fi

# -------- Pre-flight checks --------
# Resolve Python interpreter and wheelhouse via helper
# shellcheck source=/dev/null
source "$ROOT_DIR/scripts/python_env_resolver.sh"

# -------- Install venvs from wheelhouse (offline) --------
PYTHON="$PY_BIN" bash scripts/agents_install.sh

# -------- Start services (sequential, health-gated) --------
# Ensure previous PIDs are stopped
bash scripts/agents_stop.sh >/dev/null 2>&1 || true

RUN_DIR="$ROOT_DIR/.run"
mkdir -p "$RUN_DIR"

start_one() {
  local name="$1" module="$2" venvname="$3" port="$4"
  local vdir="$ROOT_DIR/.venv/$venvname"
  local bindir="$vdir/bin"; case "$(uname -s 2>/dev/null || echo unknown)" in MINGW*|MSYS*|CYGWIN*) bindir="$vdir/Scripts";; esac
  local py="$bindir/python"
  local log="$RUN_DIR/$name.log"
  local pidf="$RUN_DIR/$name.pid"
  if [ ! -x "$py" ]; then echo "ERROR: venv for $name missing" >&2; exit 1; fi
  echo "Starting $name on :$port"
  PORT="$port" "$py" -m uvicorn "$module":app --host 0.0.0.0 --port "$port" >"$log" 2>&1 &
  echo $! >"$pidf"
}

wait_for() {
  local url="$1"; local retries=30; local delay=0.5
  for _ in $(seq 1 $retries); do
    curl -fsS "$url" >/dev/null && return 0
    sleep "$delay"
  done
  return 1
}

# Start agents in order and wait for health
start_one credit agents.credit_agent.main credit "$CREDIT_PORT"
wait_for "http://localhost:$CREDIT_PORT/health" && echo "Credit OK" || { echo "Credit FAILED"; exit 1; }

start_one fraud agents.fraud_agent.main fraud "$FRAUD_PORT"
wait_for "http://localhost:$FRAUD_PORT/health" && echo "Fraud OK" || { echo "Fraud FAILED"; exit 1; }

start_one esg agents.esg_agent.main esg "$ESG_PORT"
wait_for "http://localhost:$ESG_PORT/health" && echo "ESG OK" || { echo "ESG FAILED"; exit 1; }

# Router after agents; passes on ROUTER_STRATEGY from env
start_one router agents.moe_router.main router "$ROUTER_PORT"
wait_for "http://localhost:$ROUTER_PORT/health" && echo "Router OK" || { echo "Router FAILED"; exit 1; }

# Start web dashboard after router
bash scripts/dashboard_start.sh

# -------- Verify health --------
retry_curl() {
  local url="$1"; local retries=20; local delay=0.5
  for _ in $(seq 1 $retries); do
    if curl -fsS "$url" >/dev/null; then return 0; fi
    sleep "$delay"
  done
  return 1
}

set +e
retry_curl "http://localhost:$ROUTER_PORT/health" && echo "Router OK" || { echo "Router FAILED"; exit 1; }
retry_curl "http://localhost:$CREDIT_PORT/health" && echo "Credit OK" || { echo "Credit FAILED"; exit 1; }
retry_curl "http://localhost:$FRAUD_PORT/health" && echo "Fraud OK" || { echo "Fraud FAILED"; exit 1; }
retry_curl "http://localhost:$ESG_PORT/health" && echo "ESG OK" || { echo "ESG FAILED"; exit 1; }
# Dashboard health
retry_curl "http://localhost:${DASHBOARD_PORT:-8090}/health" && echo "Web Dashboard OK" || { echo "Web Dashboard FAILED"; exit 1; }
set -e

# -------- Print endpoints --------
echo ""
echo "Services running (offline):"
echo "- Router: http://localhost:$ROUTER_PORT"
echo "- Credit: http://localhost:$CREDIT_PORT"
echo "- Fraud:  http://localhost:$FRAUD_PORT"
echo "- ESG:    http://localhost:$ESG_PORT"
echo "- Web:    http://localhost:${DASHBOARD_PORT:-8090}"

echo ""
echo "Sample route (credit):"
echo "curl -s -X POST http://localhost:$ROUTER_PORT/route -H 'Content-Type: application/json' -d '{\n  \"type\":\"credit\",\n  \"content\":\"please evaluate loan eligibility and credit score\",\n  \"metadata\":{\"annual_income\":65000,\"debt_to_income\":0.32,\"credit_utilization\":0.28}\n}' | jq ."
