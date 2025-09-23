# Cloud Run Deployment (MoE Router + Agents + Dashboard)

This is the canonical, minimal deployment guide for running the MoE system on Google Cloud Run with separate services for:
- moe-credit
- moe-fraud
- moe-esg
- moe-router
- moe-dashboard (optional)

Key characteristics
- Docker-only builds using vendored Python wheels (offline-friendly and reproducible)
- No Node/Yarn/NPM; Python-only services
- Clean environment variables, minimal configuration
- No service-to-service auth in this guide (can be added later)

Prerequisites
- gcloud CLI authenticated to your GCP project
- Artifact Registry enabled for Docker images
- Vendored wheels available under vendor/python/py311/wheels

Files added in this repo
- docker/moe_router.Dockerfile
- docker/credit.Dockerfile
- docker/fraud.Dockerfile
- docker/esg.Dockerfile
- docker/dashboard.Dockerfile
- scripts/cloudrun_deploy.sh
- .dockerignore (keeps images lean)

1) One command deploy (recommended)
- Build, push and deploy all services (agents → router → dashboard) in order. The script will print the final URLs.

```bash
PROJECT_ID=<your-project-id> \
REGION=<your-region> \
DEPLOY_DASHBOARD=1 \
bash scripts/cloudrun_deploy.sh
```

Optional arguments
- REPO=moe-repo        # Artifact Registry repo name (default: moe-repo)
- TAG=v1               # Image tag (default: v1)
- DEPLOY_DASHBOARD=0   # Skip dashboard deploy

What the script does
- Enables APIs if needed: Artifact Registry, Cloud Run
- Creates the Artifact Registry repo if missing
- Builds and pushes images to REGION-docker.pkg.dev/PROJECT_ID/REPO
- Deploys moe-credit, moe-fraud, moe-esg first (public by default in this guide)
- Captures their URLs and injects them into moe-router env vars
- Deploys moe-router (public)
- Optionally deploys moe-dashboard with the router/agents URLs
- Prints final service URLs and health checks

2) Manual deploy (if you prefer step-by-step)
- Build and push each image:

```bash
REPO_URI="$REGION-docker.pkg.dev/$PROJECT_ID/moe-repo"

docker build -f docker/credit.Dockerfile    -t "$REPO_URI/moe-credit:v1" . && docker push "$REPO_URI/moe-credit:v1"
docker build -f docker/fraud.Dockerfile     -t "$REPO_URI/moe-fraud:v1" .  && docker push "$REPO_URI/moe-fraud:v1"
docker build -f docker/esg.Dockerfile       -t "$REPO_URI/moe-esg:v1" .    && docker push "$REPO_URI/moe-esg:v1"
docker build -f docker/moe_router.Dockerfile -t "$REPO_URI/moe-router:v1" . && docker push "$REPO_URI/moe-router:v1"
docker build -f docker/dashboard.Dockerfile -t "$REPO_URI/moe-dashboard:v1" . && docker push "$REPO_URI/moe-dashboard:v1"
```

- Deploy agents first and capture URLs (Cloud Run will print them):

```bash
gcloud run deploy moe-credit \
  --image "$REPO_URI/moe-credit:v1" \
  --platform managed --region "$REGION" --allow-unauthenticated \
  --min-instances 0 --max-instances 3 --cpu 1 --memory 512Mi --port 8080
CREDIT_URL=$(gcloud run services describe moe-credit --region "$REGION" --format='value(status.url)')

gcloud run deploy moe-fraud \
  --image "$REPO_URI/moe-fraud:v1" \
  --platform managed --region "$REGION" --allow-unauthenticated \
  --min-instances 0 --max-instances 3 --cpu 1 --memory 512Mi --port 8080
FRAUD_URL=$(gcloud run services describe moe-fraud --region "$REGION" --format='value(status.url)')

gcloud run deploy moe-esg \
  --image "$REPO_URI/moe-esg:v1" \
  --platform managed --region "$REGION" --allow-unauthenticated \
  --min-instances 0 --max-instances 3 --cpu 1 --memory 512Mi --port 8080
ESG_URL=$(gcloud run services describe moe-esg --region "$REGION" --format='value(status.url)')
```

- Deploy router (inject agent URLs):

```bash
gcloud run deploy moe-router \
  --image "$REPO_URI/moe-router:v1" \
  --platform managed --region "$REGION" --allow-unauthenticated \
  --min-instances 0 --max-instances 3 --cpu 1 --memory 512Mi --port 8080 \
  --set-env-vars LOG_LEVEL=WARNING,ROUTER_STRATEGY=ml \
  --set-env-vars CREDIT_URL="$CREDIT_URL",FRAUD_URL="$FRAUD_URL",ESG_URL="$ESG_URL"
ROUTER_URL=$(gcloud run services describe moe-router --region "$REGION" --format='value(status.url)')
```

- Deploy dashboard (optional):

```bash
gcloud run deploy moe-dashboard \
  --image "$REPO_URI/moe-dashboard:v1" \
  --platform managed --region "$REGION" --allow-unauthenticated \
  --min-instances 0 --max-instances 2 --cpu 1 --memory 512Mi --port 8080 \
  --set-env-vars ROUTER_URL="$ROUTER_URL",CREDIT_URL="$CREDIT_URL",FRAUD_URL="$FRAUD_URL",ESG_URL="$ESG_URL"
DASHBOARD_URL=$(gcloud run services describe moe-dashboard --region "$REGION" --format='value(status.url)')
```

3) Verify deployment

```bash
curl -sS "$CREDIT_URL/health" | jq .
curl -sS "$FRAUD_URL/health" | jq .
curl -sS "$ESG_URL/health" | jq .
curl -sS "$ROUTER_URL/health" | jq .
# If deployed
[ -n "${DASHBOARD_URL:-}" ] && curl -sS "$DASHBOARD_URL/health" | jq .
```

Notes
- Logging: Cloud Run file system is ephemeral. The dashboard writes JSONL audit logs locally for offline demos; for production, prefer Cloud Logging (stdout/stderr) or GCS (we can wire this later).
- Security: This guide deploys services as public (allow-unauthenticated). You can add service-to-service auth later (router invokes agents via Identity tokens) when you’re ready.
- Cold starts: To reduce cold start, increase --min-instances (cost trade-off).
- No localhost: On GCP, the router and dashboard must point to agents via their Cloud Run URLs (this guide sets those env vars during deploy).
