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
# Determine venv python path cross-platform
VENV_PY=""
if [ -x "$vdir/bin/python" ]; then
  VENV_PY="$vdir/bin/python"
elif [ -x "$vdir/Scripts/python.exe" ]; then
  VENV_PY="$vdir/Scripts/python.exe"
else
  echo "ERROR: Cannot find venv python for $name at $vdir" >&2
  exit 1
fi

# Determine platform to avoid uvloop on Windows (no wheels there)
local SYS
SYS=$("$VENV_PY" -c 'import platform;print(platform.system())')
local BASE_PKGS="fastapi==0.115.0 pydantic==2.8.2 httpx==0.27.2 numpy==1.26.4 scipy==1.11.4 scikit-learn==1.4.2 joblib==1.4.2 python-multipart==0.0.9 jinja2==3.1.4"
local UVICORN_PKGS
if [ "$SYS" = "Windows" ]; then
  UVICORN_PKGS="uvicorn==0.30.6 websockets==15.0.1 watchfiles==1.1.0 httptools==0.6.4 colorama==0.4.6"
else
  UVICORN_PKGS="uvicorn[standard]==0.30.6"
fi

# Sanitize any pip user/site settings that would force --user (Windows safe)
unset PIP_USER PYTHONUSERBASE PIP_TARGET PIP_REQUIRE_VIRTUALENV || true
PIP_CONFIG_FILE=/dev/null PIP_DISABLE_PIP_VERSION_CHECK=1 "$VENV_PY" -m pip install --isolated --no-index --find-links="$WHEELHOUSE" $BASE_PKGS $UVICORN_PKGS || {
  echo "ERROR: Offline pip install failed for $name" >&2
  exit 1
}
}

create_venv credit
create_venv fraud
create_venv esg
create_venv router
create_venv dashboard

# Install/ensure dashboard-specific dependencies without activating (cross-platform)
DASH_PY=""
if [ -x "$ROOT_DIR/.venv/dashboard/bin/python" ]; then
  DASH_PY="$ROOT_DIR/.venv/dashboard/bin/python"
elif [ -x "$ROOT_DIR/.venv/dashboard/Scripts/python.exe" ]; then
  DASH_PY="$ROOT_DIR/.venv/dashboard/Scripts/python.exe"
else
  echo "ERROR: dashboard venv python not found" >&2
  exit 1
fi
# Sanitize pip env and install dashboard deps
unset PIP_USER PYTHONUSERBASE PIP_TARGET PIP_REQUIRE_VIRTUALENV || true
PIP_CONFIG_FILE=/dev/null PIP_DISABLE_PIP_VERSION_CHECK=1 "$DASH_PY" -m pip install --isolated --no-index --find-links="$WHEELHOUSE" jinja2==3.1.4 python-multipart==0.0.9 || {
  echo "ERROR: Offline pip install failed for dashboard (jinja2, python-multipart)" >&2
  exit 1
}

echo "Python venvs installed with offline wheels (interpreter: $($PY_BIN -V 2>&1))."
