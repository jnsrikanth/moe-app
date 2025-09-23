#!/usr/bin/env bash
set -euo pipefail

# Build all agent images without network
# Requires wheels committed under vendor/python/py311/wheels

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# Disable network for docker build to enforce offline (Docker 25+ supports --network=none)

docker build --network=none -f docker/credit.Dockerfile -t moe/credit:local .
docker build --network=none -f docker/fraud.Dockerfile -t moe/fraud:local .
docker build --network=none -f docker/esg.Dockerfile -t moe/esg:local .
docker build --network=none -f docker/moe_router.Dockerfile -t moe/router:local .

echo "All images built offline successfully."
