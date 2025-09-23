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

# Choose package sets based on platform and Python minor version
# Detect Windows Git Bash/MINGW/MSYS
UNAME_S="$(uname -s 2>/dev/null || echo unknown)"
IS_WIN=0
case "$UNAME_S" in
  MINGW*|MSYS*|CYGWIN*) IS_WIN=1 ;;
  *) IS_WIN=0 ;;
esac

# Base packages (common)
BASE_PKGS=(fastapi==0.115.0 pydantic==2.8.2 httpx==0.27.2)
# Uvicorn: avoid [standard] on Windows (uvloop not available)
if [ "$IS_WIN" -eq 1 ]; then
  BASE_PKGS+=(uvicorn==0.30.6)
else
  BASE_PKGS+=("uvicorn[standard]==0.30.6")
fi

# ML stack by Python version
ML_PKGS=()
case "$PY_MM" in
  py313)
    ML_PKGS=(numpy==2.3.3 scipy==1.16.2 scikit-learn==1.6.1 joblib==1.5.2)
    ;;
  py312)
    ML_PKGS=(numpy==1.26.4 scipy==1.11.4 scikit-learn==1.4.2 joblib==1.4.2)
    ;;
  *)
    ML_PKGS=(numpy==1.26.4 scipy==1.11.4 scikit-learn==1.4.2 joblib==1.4.2)
    ;;
esac

# Create venvs per agent using the resolved interpreter
create_venv() {
  local name="$1"
  local vdir="$ROOT_DIR/.venv/$name"
  if [ ! -d "$vdir" ]; then
    "$PY_BIN" -m venv "$vdir"
  fi
  # Determine venv bin dir per OS
  local bindir="$vdir/bin"
  if [ "$IS_WIN" -eq 1 ]; then bindir="$vdir/Scripts"; fi
  # shellcheck source=/dev/null
  source "$bindir/activate"
  pip install --no-index --find-links="$WHEELHOUSE" "${BASE_PKGS[@]}" "${ML_PKGS[@]}" || {
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
DASH_BINDIR="$DASH_VENV/bin"
if [ "$IS_WIN" -eq 1 ]; then DASH_BINDIR="$DASH_VENV/Scripts"; fi
# shellcheck source=/dev/null
source "$DASH_BINDIR/activate"
pip install --no-index --find-links="$WHEELHOUSE" jinja2==3.1.4 python-multipart==0.0.9 || {
  echo "ERROR: Offline pip install failed for dashboard (jinja2, python-multipart)" >&2
  exit 1
}
# Uvicorn for dashboard
if [ "$IS_WIN" -eq 1 ]; then
  pip install --no-index --find-links="$WHEELHOUSE" uvicorn==0.30.6 >/dev/null 2>&1 || true
else
  pip install --no-index --find-links="$WHEELHOUSE" "uvicorn[standard]==0.30.6" >/dev/null 2>&1 || true
fi

deactivate || true

echo "Python venvs installed with offline wheels (interpreter: $($PY_BIN -V 2>&1))."
