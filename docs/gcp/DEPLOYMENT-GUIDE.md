# GCP Deployment Guide for moe-app

This guide describes how to migrate and operate moe-app on Google Cloud using:
- Option A: Cloud Run (managed, simplest)
- Option B: GKE Autopilot (Kubernetes)

It also covers IAM, networking, observability, security, and a migration path for enterprise orgs.

Prerequisites
- gcloud CLI installed and authenticated (gcloud auth login)
- Application Default Credentials for local testing (gcloud auth application-default login)
- A billing account on GCP (you need the BILLING_ACCOUNT_ID)

1) Create a new GCP Project (don’t touch existing coffee-bean-project)
- Choose unique IDs; example values below use placeholders. Replace PROJECT_ID and PROJECT_NAME.

Commands
```bash
PROJECT_ID=moe-app-<unique-suffix>
PROJECT_NAME="moe-app"
BILLING_ACCOUNT_ID=<YOUR_BILLING_ACCOUNT_ID>

# Create project and set it as default
gcloud projects create $PROJECT_ID --name="$PROJECT_NAME" --set-as-default

# Link billing
gcloud beta billing projects link $PROJECT_ID --billing-account=$BILLING_ACCOUNT_ID

# Set default region and zone (adjust as needed)
REGION=us-central1
ZONE=us-central1-a
gcloud config set compute/region $REGION
gcloud config set compute/zone $ZONE
```

2) Enable required APIs
```bash
APIS=(
  serviceusage.googleapis.com
  artifactregistry.googleapis.com
  run.googleapis.com
  cloudbuild.googleapis.com
  container.googleapis.com
  compute.googleapis.com
  aiplatform.googleapis.com
  logging.googleapis.com
  monitoring.googleapis.com
  secretmanager.googleapis.com
  iamcredentials.googleapis.com
)
for api in "${APIS[@]}"; do gcloud services enable $api; done
```

3) Create an Artifact Registry repo for container images
```bash
REPO=moe-app
REGION=us-central1

gcloud artifacts repositories create $REPO \
  --repository-format=docker \
  --location=$REGION \
  --description="moe-app containers"
```

4) Build and push image (Cloud Build)
- The repo includes cloudbuild.yaml. Submit a build and push:
```bash
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions _REGION=$REGION,_REPOSITORY=$REPO,_IMAGE=moe-app
```
- Note the resulting image URL displayed at the end, e.g.:
  us-central1-docker.pkg.dev/PROJECT_ID/moe-app/moe-app:SHORT_SHA

Option A: Cloud Run (recommended for simplicity)
1) Deploy to Cloud Run
```bash
IMAGE="us-central1-docker.pkg.dev/$PROJECT_ID/$REPO/moe-app:$(git rev-parse --short HEAD)"
# If using SHORT_SHA from Cloud Build logs, replace accordingly.

# Deploy (unauthenticated for public access). Add --service-account for custom SA.
gcloud run deploy moe-app \
  --image=$IMAGE \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --max-instances=3 \
  --memory=1Gi

# Set environment variables (Vertex AI + app config)
gcloud run services update moe-app \
  --region=$REGION \
  --update-env-vars=NODE_ENV=production,PORT=8080,ROUTER_MODEL=gemini-1.5-flash,AGENT_MODEL_CREDIT=gemini-1.5-flash,AGENT_MODEL_FRAUD=gemini-1.5-flash,AGENT_MODEL_ESG=gemini-1.5-flash,GCP_LOCATION=$REGION
```
2) Grant Vertex AI permissions to the service account
- Cloud Run uses its runtime service account; by default, it’s PROJECT_NUMBER-compute@developer.gserviceaccount.com.
- Grant aiplatform.user so it can call Vertex AI.
```bash
RUNTIME_SA=$(gcloud run services describe moe-app --region=$REGION --format='value(spec.template.spec.serviceAccountName)')
# If empty, use default compute SA: $(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')-compute@developer.gserviceaccount.com

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:$RUNTIME_SA \
  --role=roles/aiplatform.user
```
3) Get the Cloud Run URL
```bash
gcloud run services describe moe-app --region=$REGION --format='value(status.url)'
```
4) Test health and APIs
```bash
CR_URL=$(gcloud run services describe moe-app --region=$REGION --format='value(status.url)')
curl -sS "$CR_URL/health"
curl -sS "$CR_URL/api/models"
```

Option B: GKE Autopilot
1) Create an Autopilot cluster
```bash
CLUSTER=moe-autopilot
REGION=us-central1

gcloud container clusters create-auto $CLUSTER --region=$REGION

# Get credentials for kubectl
gcloud container clusters get-credentials $CLUSTER --region=$REGION
```
2) Workload Identity (recommended) and Service Account
```bash
# Create a KSA (Kubernetes service account)
kubectl create serviceaccount moe-app-ksa

# Create a GSA (Google service account)
GSA=moe-app-sa
gcloud iam service-accounts create $GSA --display-name="moe-app GSA"

# Allow KSA to impersonate GSA (Workload Identity binding)
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')

gcloud iam service-accounts add-iam-policy-binding $GSA@$PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member=serviceAccount:$PROJECT_ID.svc.id.goog[default/moe-app-ksa]

# Annotate the KSA to use the GSA
kubectl annotate serviceaccount \
  --namespace default \
  moe-app-ksa \
  iam.gke.io/gcp-service-account=$GSA@$PROJECT_ID.iam.gserviceaccount.com

# Grant Vertex AI role to GSA
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:$GSA@$PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/aiplatform.user
```
3) Prepare k8s manifests
- Update k8s/deployment-service-ingress.yaml placeholders:
  - PROJECT_ID, REGION, REPOSITORY, TAG
- If using Workload Identity, set spec.serviceAccountName: moe-app-ksa in Deployment spec and remove the annotation-based SA wiring.

Apply manifests:
```bash
kubectl apply -f k8s/deployment-service-ingress.yaml
```
4) External access
- The Ingress will provision a GCLB. Check the IP and map a DNS record.
- For TLS with Managed Certificates, create a ManagedCertificate and reference it via networking.gke.io/managed-certificates.

Observability (both Cloud Run and GKE)
- Logs: Cloud Logging (filter by resource.type=cloud_run_revision or k8s_container)
- Metrics: Cloud Monitoring; create dashboards/alerts (latency, error rate, CPU/memory)
- Traces: Optional, add OpenTelemetry later

Security & Secrets
- Prefer Application Default Credentials or Workload Identity; avoid embedding keys.
- Store any app secrets in Secret Manager; mount via Cloud Run env vars or GKE secrets.
- IAM least-privilege: roles/aiplatform.user only where needed.

Networking
- For private egress, use Serverless VPC Connector (Cloud Run) or Cloud NAT (GKE) if calling external services.
- Enterprise: consider VPC-SC, Private Service Connect for Vertex AI, and private clusters.

CI/CD
- Use Cloud Build triggers to build on branch gcp_main and deploy to Cloud Run or update the GKE deployment (kubectl apply step via Cloud Build with a deployer SA).

Local Development (minimal)
- ADC: gcloud auth application-default login
- Env: export GCP_PROJECT_ID=...; export GCP_LOCATION=us-central1
- Start server locally: PORT=4010 NODE_ENV=production npm run start

Migration Path to Enterprise
- Org policies: restrict public invocations, enforce CMEK, restrict regions
- Networking: private clusters, VPC-SC perimeters, private access to Google APIs
- IAM: dedicated workload SAs, no broad primitive roles; separate build/deploy SAs
- Multi-env: projects per env (dev/stage/prod), separate artifact repos and service accounts per env
- Audit: Cloud Audit Logs sink to SIEM; set up alerting in Monitoring

Appendix: Image naming
- us-central1-docker.pkg.dev/PROJECT_ID/REPOSITORY/moe-app:TAG
- Use git SHA or version tags for traceability.

