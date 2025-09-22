# GCP Cloud Run Deployment Guide

This guide covers deploying the MoE Router, Expert Agents, and Python ML service to Google Cloud Run with zero-install Yarn Berry and service-to-service auth.

## Architecture

- **moe-router** (public)
  - Serves web UI at root
  - Exposes /api endpoints
  - Invokes Expert Agents with service-to-service auth
  - Default engine=ml for offline/local routing
  - Optional: switch to engine=llm for Vertex/Gemini
- **Expert Agents** (private)
  - credit-agent
  - fraud-agent
  - esg-agent
  - Only invoked by moe-router
  - No public access
- **python-ml** (private)
  - Default ML engine (zero deps)
  - Only invoked by moe-router
  - No public access

## Prerequisites

```bash
# Variables
PROJECT_ID=moe-app-bfsi-1757248254
REGION=us-central1
REPO=moe-app # Artifact Registry repo for Docker images
```

## 1. Setup GCP resources

```bash
# Enable services
gcloud services enable \
  artifactregistry.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com

# Create Docker repo
gcloud artifacts repositories create $REPO \
  --repository-format=docker \
  --location=$REGION

# Create service accounts
gcloud iam service-accounts create router-sa \
  --display-name="MoE Router Service Account"

gcloud iam service-accounts create credit-sa \
  --display-name="Credit Agent Service Account"

gcloud iam service-accounts create fraud-sa \
  --display-name="Fraud Agent Service Account"

gcloud iam service-accounts create esg-sa \
  --display-name="ESG Agent Service Account"

gcloud iam service-accounts create ml-sa \
  --display-name="Python ML Service Account"

# Grant router SA invoker rights on agent services (credit/fraud/esg)
for agent in credit fraud esg; do
  gcloud run services add-iam-policy-binding ${agent}-agent \
    --member=serviceAccount:router-sa@$PROJECT_ID.iam.gserviceaccount.com \
    --role=roles/run.invoker \
    --region=$REGION
done

# Grant router SA invoker on python-ml as well
gcloud run services add-iam-policy-binding python-ml \
  --member=serviceAccount:router-sa@$PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/run.invoker \
  --region=$REGION
```

## 2. Build and push images

```bash
# Helper to build and push a service
build_service() {
  local service=$1
  local tag=$(git rev-parse --short HEAD)
  local image=$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$service:$tag

  gcloud builds submit \
    --config=cloudbuild.${service}.yaml \
    --substitutions=_REGION=$REGION,_REPOSITORY=$REPO,_IMAGE=$service,_TAG=$tag
  
  echo "Built $image"
}

# Build all services
build_service moe-router
build_service credit-agent
build_service fraud-agent 
build_service esg-agent
build_service python-ml
```

## 3. Deploy services

### Deploy Python ML service (private)
```bash
ML_IMAGE=$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/python-ml:$(git rev-parse --short HEAD)

gcloud run deploy python-ml \
  --image=$ML_IMAGE \
  --region=$REGION \
  --no-allow-unauthenticated \
  --service-account=ml-sa@$PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars=LOCAL_ML_LABEL=mlp-local,PY_LOCAL_HOST=0.0.0.0

ML_URL=$(gcloud run services describe python-ml \
  --region=$REGION --format='value(status.url)')
```

### Deploy Expert Agents (private)
```bash
CREDIT_IMAGE=$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/credit-agent:$(git rev-parse --short HEAD)

gcloud run deploy credit-agent \
  --image=$CREDIT_IMAGE \
  --region=$REGION \
  --no-allow-unauthenticated \
  --service-account=credit-sa@$PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars=NODE_ENV=production

CREDIT_URL=$(gcloud run services describe credit-agent \
  --region=$REGION --format='value(status.url)')

# Repeat for fraud-agent and esg-agent...
```

### Deploy Router (public)
```bash
ROUTER_IMAGE=$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/moe-router:$(git rev-parse --short HEAD)

gcloud run deploy moe-router \
  --image=$ROUTER_IMAGE \
  --region=$REGION \
  --allow-unauthenticated \
  --service-account=router-sa@$PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars=NODE_ENV=production,ROUTER_ENGINE=ml,LOCAL_ML_LABEL=mlp-local \
  --set-env-vars=PY_LOCAL_URL=$ML_URL \
  --set-env-vars=CREDIT_AGENT_URL=$CREDIT_URL,FRAUD_AGENT_URL=$FRAUD_URL,ESG_AGENT_URL=$ESG_URL

ROUTER_URL=$(gcloud run services describe moe-router \
  --region=$REGION --format='value(status.url)')
```

## 4. Verify deployment

```bash
# Health checks
curl -s "$ROUTER_URL/health" | jq .
curl -s "$ROUTER_URL/api/models" | jq .

# Generate a test request
curl -s -X POST "$ROUTER_URL/api/requests/generate" \
  -H "Content-Type: application/json" \
  -d '{"type":"Loan Application - Personal","priority":"medium"}' | jq .
```

## 5. Enable Vertex AI (optional)

If you want to switch from local ML to Vertex AI/Gemini:

1. Enable Vertex AI API:
```bash
gcloud services enable aiplatform.googleapis.com
```

2. Grant router SA Vertex permissions:
```bash
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:router-sa@$PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/aiplatform.user
```

3. Update router config:
```bash
# Switch to LLM engine + set model
gcloud run services update moe-router \
  --region=$REGION \
  --set-env-vars=^+^ROUTER_ENGINE=llm,VERTEX_AI_MODEL=gemini-pro

# Optional: keep local ML as fallback
gcloud run services update moe-router \
  --region=$REGION \
  --set-env-vars=^+^ROUTER_ENGINE=hybrid
```

## 6. Domain mapping (optional)

Map the router service to a custom domain:

```bash
# Verify domain ownership first
gcloud domains verify example.com

# Map domain to router
gcloud run domain-mappings create \
  --service=moe-router \
  --domain=moe.example.com \
  --region=$REGION
```

## Common tasks

### View logs
```bash
gcloud logging tail --project=$PROJECT_ID \
  "resource.type=cloud_run_revision AND resource.labels.service_name=moe-router"
```

### Update a service
```bash
# Build new image
build_service moe-router

# Deploy update
gcloud run services update moe-router \
  --image=$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/moe-router:$(git rev-parse --short HEAD) \
  --region=$REGION
```

### Switch ML engines
```bash
# Use local Python ML (default)
gcloud run services update moe-router \
  --region=$REGION \
  --set-env-vars=^+^ROUTER_ENGINE=ml,LOCAL_ML_LABEL=mlp-local

# Use Vertex AI/Gemini
gcloud run services update moe-router \
  --region=$REGION \
  --set-env-vars=^+^ROUTER_ENGINE=llm,VERTEX_AI_MODEL=gemini-pro

# Use both (hybrid)
gcloud run services update moe-router \
  --region=$REGION \
  --set-env-vars=^+^ROUTER_ENGINE=hybrid
```

## Notes

### Zero-install with Yarn Berry
- All Dockerfiles use the vendored .yarn/cache and yarn.lock.
- No network access needed during container builds.
- Set YARN_ENABLE_NETWORK=0 to verify offline install works.

### Service-to-service auth
- Router → Agent calls use Google-signed OIDC tokens.
- postWithIdToken helper handles auth automatically.
- Agents are private (no-allow-unauthenticated).
- Each service uses a dedicated SA.

### Local ML vs Vertex
- Default: ROUTER_ENGINE=ml uses Python ML service.
- Optional: ROUTER_ENGINE=llm for Vertex/Gemini.
- Hybrid mode (ROUTER_ENGINE=hybrid) tries ML first, falls back to LLM.
- Local ML is zero-deps, uses stdlib only.
- Labels (UI_MODEL_LABEL, LOCAL_ML_LABEL) reflect active engine.

### Browser URLs
- UI makes same-origin calls to router only.
- No CORS needed (unless hosting UI separately).
- Agents are never called directly from browser.