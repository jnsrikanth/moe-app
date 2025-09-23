#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WHEELHOUSE="$ROOT_DIR/vendor/python/py311/wheels"
RUN_DIR="$ROOT_DIR/.run"

mkdir -p "$RUN_DIR"

if [ ! -d "$WHEELHOUSE" ] || [ -z "$(ls -A "$WHEELHOUSE" 2>/dev/null || true)" ]; then
  echo "ERROR: Wheelhouse is empty: $WHEELHOUSE. Run: python scripts/bake_wheels.py (with internet once)" >&2
  exit 1
fi

# Create venvs per agent
create_venv() {
  local name="$1"
  local vdir="$ROOT_DIR/.venv/$name"
  if [ ! -d "$vdir" ]; then
    python3 -m venv "$vdir"
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

echo "Python venvs installed with offline wheels."
