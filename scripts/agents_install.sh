#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
mkdir -p "$RUN_DIR"

# Resolve Python interpreter + wheelhouse via helper if not provided by caller
if [ -z "${PY_BIN:-}" ] || [ -z "${WHEELHOUSE:-}" ] || [ -z "${PY_MM:-}" ]; then
  # shellcheck source=/dev/null
  source "$ROOT_DIR/scripts/python_env_resolver.sh"
fi

# Create venvs per agent using the resolved interpreter
create_venv() {
  local name="$1"
  local vdir="$ROOT_DIR/.venv/$name"
  if [ ! -d "$vdir" ]; then
    "$PY_BIN" -m venv "$vdir"
  fi
  # shellcheck source=/dev/null
  source "$vdir/bin/activate"
  pip install --no-index --find-links="$WHEELHOUSE" fastapi==0.115.0 uvicorn[standard]==0.30.6 pydantic==2.8.2 httpx==0.27.2 numpy==1.26.4 scipy==1.11.4 scikit-learn==1.4.2 joblib==1.4.2 || {
    echo "ERROR: Offline pip install failed for $name" >&2
    exit 1
  }
  deactivate || true
}

create_venv credit
create_venv fraud
create_venv esg
create_venv router
create_venv dashboard

# Install dashboard-specific dependency (jinja2) in its venv
DASH_VENV="$ROOT_DIR/.venv/dashboard"
# shellcheck source=/dev/null
source "$DASH_VENV/bin/activate"
pip install --no-index --find-links="$WHEELHOUSE" jinja2==3.1.4 python-multipart==0.0.9 || {
  echo "ERROR: Offline pip install failed for dashboard (jinja2, python-multipart)" >&2
  exit 1
}
deactivate || true

echo "Python venvs installed with offline wheels (interpreter: $($PY_BIN -V 2>&1))."
