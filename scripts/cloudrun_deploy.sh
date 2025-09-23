#!/usr/bin/env bash
set -euo pipefail

# Cloud Run multi-service build + deploy for:
# - moe-credit
# - moe-fraud
# - moe-esg
# - moe-router
# - moe-dashboard (optional)
#
# Prereqs:
# - gcloud CLI installed and authenticated
# - Artifact Registry repo exists or will be created
# - vendor/python/py311/wheels populated
#
# Usage:
#   PROJECT_ID=your-project REGION=us-central1 bash scripts/cloudrun_deploy.sh
# Optional:
#   REPO=moe-repo TAG=v1 DEPLOY_DASHBOARD=1 bash scripts/cloudrun_deploy.sh

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-}"
REPO="${REPO:-moe-repo}"
TAG="${TAG:-v1}"
DEPLOY_DASHBOARD="${DEPLOY_DASHBOARD:-1}"

if [ -z "$PROJECT_ID" ] || [ -z "$REGION" ]; then
  echo "ERROR: Set PROJECT_ID and REGION." >&2
  exit 1
fi

# Configure gcloud
gcloud config set project "$PROJECT_ID" >/dev/null

echo "Enabling required services (if not already enabled)..."
gcloud services enable artifactregistry.googleapis.com run.googleapis.com cloudbuild.googleapis.com >/dev/null

REPO_URI="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO"

# Create AR repo if missing
if ! gcloud artifacts repositories describe "$REPO" --location "$REGION" >/dev/null 2>&1; then
  echo "Creating Artifact Registry repo: $REPO in $REGION"
  gcloud artifacts repositories create "$REPO" \
    --repository-format=docker --location="$REGION"
fi

echo "Configuring Docker auth for $REGION-docker.pkg.dev"
gcloud auth configure-docker "$REGION-docker.pkg.dev" -q

# Wheelhouse check
WHEELHOUSE="$ROOT_DIR/vendor/python/py311/wheels"
if [ ! -d "$WHEELHOUSE" ] || [ -z "$(ls -A "$WHEELHOUSE" 2>/dev/null || true)" ]; then
  echo "ERROR: Wheelhouse is empty: $WHEELHOUSE" >&2
  exit 1
fi

# Build images
build_push() {
  local name="$1" dockerfile="$2"
  local image="$REPO_URI/$name:$TAG"
  echo "\nBuilding $name => $image"
  docker build -f "$dockerfile" -t "$image" .
  echo "Pushing $image"
  docker push "$image"
}

build_push moe-credit Dockerfile.credit
build_push moe-fraud Dockerfile.fraud
build_push moe-esg Dockerfile.esg
build_push moe-router Dockerfile.router
if [ "$DEPLOY_DASHBOARD" = "1" ]; then
  build_push moe-dashboard Dockerfile.dashboard
fi

# Deploy agents first
svc_deploy() {
  local name="$1" image="$2"
  echo "\nDeploying $name"
  gcloud run deploy "$name" \
    --image "$image" \
    --platform managed \
    --region "$REGION" \
    --allow-unauthenticated \
    --min-instances 0 --max-instances 3 \
    --cpu 1 --memory 512Mi \
    --port 8080 \
    --quiet
}

svc_deploy moe-credit "$REPO_URI/moe-credit:$TAG"
CREDIT_URL=$(gcloud run services describe moe-credit --region "$REGION" --format='value(status.url)')

echo "CREDIT_URL=$CREDIT_URL"

svc_deploy moe-fraud "$REPO_URI/moe-fraud:$TAG"
FRAUD_URL=$(gcloud run services describe moe-fraud --region "$REGION" --format='value(status.url)')

echo "FRAUD_URL=$FRAUD_URL"

svc_deploy moe-esg "$REPO_URI/moe-esg:$TAG"
ESG_URL=$(gcloud run services describe moe-esg --region "$REGION" --format='value(status.url)')

echo "ESG_URL=$ESG_URL"

# Router with agent URLs
echo "\nDeploying moe-router with agent URLs"
gcloud run deploy moe-router \
  --image "$REPO_URI/moe-router:$TAG" \
  --platform managed \
  --region "$REGION" \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 3 \
  --cpu 1 --memory 512Mi \
  --port 8080 \
  --set-env-vars LOG_LEVEL=WARNING,ROUTER_STRATEGY=ml \
  --set-env-vars CREDIT_URL="$CREDIT_URL",FRAUD_URL="$FRAUD_URL",ESG_URL="$ESG_URL" \
  --quiet

ROUTER_URL=$(gcloud run services describe moe-router --region "$REGION" --format='value(status.url)')
echo "ROUTER_URL=$ROUTER_URL"

# Optional: Dashboard pointed to Cloud Run URLs
if [ "$DEPLOY_DASHBOARD" = "1" ]; then
  echo "\nDeploying moe-dashboard"
  gcloud run deploy moe-dashboard \
    --image "$REPO_URI/moe-dashboard:$TAG" \
    --platform managed \
    --region "$REGION" \
    --allow-unauthenticated \
    --min-instances 0 --max-instances 2 \
    --cpu 1 --memory 512Mi \
    --port 8080 \
    --set-env-vars ROUTER_URL="$ROUTER_URL",CREDIT_URL="$CREDIT_URL",FRAUD_URL="$FRAUD_URL",ESG_URL="$ESG_URL" \
    --quiet
  DASHBOARD_URL=$(gcloud run services describe moe-dashboard --region "$REGION" --format='value(status.url)')
  echo "DASHBOARD_URL=$DASHBOARD_URL"
fi

# Final summary
cat <<EOF

Deployment complete.

Agents:
- Credit: $CREDIT_URL
- Fraud:  $FRAUD_URL
- ESG:    $ESG_URL

Router:   $ROUTER_URL
Dashboard:${DASHBOARD_URL:+ $DASHBOARD_URL}

Health checks:
  curl -sS "$CREDIT_URL/health" | jq .
  curl -sS "$FRAUD_URL/health" | jq .
  curl -sS "$ESG_URL/health" | jq .
  curl -sS "$ROUTER_URL/health" | jq .
${DASHBOARD_URL:+  curl -sS "$DASHBOARD_URL/health" | jq .}
EOF
