#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# Print environment diagnostics (deterministic)
echo "[verify_offline] Repo: $ROOT_DIR"
PY_BIN="${PY_BIN:-$(command -v python3 || true)}"
if [ -n "$PY_BIN" ]; then
  echo "[verify_offline] Python: $($PY_BIN -V 2>&1) ($PY_BIN)"
  echo "[verify_offline] Platform: $("$PY_BIN" -c 'import platform,sys;print(platform.platform());print(platform.machine());print(sys.implementation.name)')"
else
  echo "[verify_offline] Python: not found in PATH" >&2
fi

WHEEL_DIR="vendor/python/py311/wheels"
echo "[verify_offline] Wheelhouse: $WHEEL_DIR"
if [ ! -d "$WHEEL_DIR" ]; then
  echo "ERROR: $WHEEL_DIR directory not found. Commit or provide wheels for py311." >&2
  exit 1
fi
if [ -z "$(ls -A "$WHEEL_DIR" 2>/dev/null || true)" ]; then
  echo "ERROR: $WHEEL_DIR is empty. Populate wheels before offline builds." >&2
  exit 1
fi

# Summarize wheel tags (first 10)
echo "[verify_offline] Sample wheels (first 10):"
ls -1 "$WHEEL_DIR" | head -10 | sed 's/^/  - /'
# Simple platform heuristic
if ls -1 "$WHEEL_DIR" | grep -qi 'macosx'; then echo "[verify_offline] Detected macOS-targeted wheels present"; fi
if ls -1 "$WHEEL_DIR" | grep -qi 'manylinux\|linux'; then echo "[verify_offline] Detected Linux-targeted wheels present"; fi
if ls -1 "$WHEEL_DIR" | grep -qi 'win_amd64\|win32'; then echo "[verify_offline] Detected Windows-targeted wheels present"; fi

# Try a no-network build for the router as a quick check (if Docker available and host not Windows)
HOST_SYS=$($PY_BIN - <<'PY'
import platform;print(platform.system())
PY
)
if [ "$HOST_SYS" = "Windows" ]; then
  echo "[verify_offline] Windows host detected; skipping Docker linux build check (not relevant for offline Python deploy)"
else
  if command -v docker >/dev/null 2>&1; then
    if ! DOCKER_BUILDKIT=1 docker build --network=none -f docker/moe_router.Dockerfile -t moe/router:verify . >/dev/null 2>&1; then
      echo "ERROR: Offline Docker build failed. A dependency may not be vendored for this platform." >&2
      exit 1
    fi
    echo "[verify_offline] Docker offline build: OK"
  else
    echo "[verify_offline] Docker not installed; skipping Docker offline build check"
  fi
fi

echo "Offline verification passed: wheels present and checks succeeded."
