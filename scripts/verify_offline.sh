#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# Verify docker builds do not need network and that wheelhouse is populated
if [ ! -d "vendor/python/py311/wheels" ] || [ -z "$(ls -A vendor/python/py311/wheels 2>/dev/null || true)" ]; then
  echo "ERROR: vendor/python/py311/wheels is empty. Populate wheels before offline builds." >&2
  exit 1
fi

# Try a no-network build for the router as a quick check
DOCKER_BUILDKIT=1 docker build --network=none -f docker/moe_router.Dockerfile -t moe/router:verify . >/dev/null 2>&1 || {
  echo "ERROR: Offline build failed. A dependency may not be vendored." >&2
  exit 1
}

echo "Offline verification passed: wheels present and build succeeded without network."
