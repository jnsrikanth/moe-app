# Enterprise GCP Migration Guide (BFSI)

This guide provides a step-by-step plan to migrate the current MoE router + agents to an enterprise-grade Google Cloud setup aligned with BFSI requirements (security, compliance, scale, observability, change control). It includes detailed checklists and comparison tables for each platform area.

Scope
- Workloads: MoE Router (Cloud Run) + Agent microservices (Credit/Fraud/ESG on Cloud Run), optional GKE for specialized workloads
- AI: Vertex AI (Gemini 2.5 Flash Lite) as router LLM; agents may also use Vertex AI
- CI/CD: Cloud Build (or GitHub Actions with Workload Identity Federation)
- Environments: dev → stage → prod

Outcomes
- Secure, auditable, least-privilege, reproducible infra via IaC
- Clear separation of concerns: routing, agents, data access
- Observability & SLOs, incident response, and reviewable change control

---

1) Reference architecture (high level)

- Organizations / Folders / Projects hierarchy
  - org
    - folders: bfsii-platform, bfsii-apps
      - projects: moe-dev, moe-stage, moe-prod (and shared infra projects)
- Networking
  - Dedicated VPC per environment (or shared VPC with service projects)
  - Private egress via Cloud NAT; restrict egress via firewall/egress policies
  - Private access to Google APIs when feasible; Private Service Connect for Vertex AI endpoints if required
- Workload platform
  - Cloud Run for router + agents (stateless services)
  - Optional GKE Autopilot for workloads requiring advanced k8s controls
- Data & state
  - Artifact Registry for images
  - Secret Manager for secrets
  - Cloud KMS (CMEK) for key management (logs, buckets, Artifact Registry, Secret Manager)
  - Consider Cloud SQL/AlloyDB/Spanner for durable state (replace local SQLite)
- AI
  - Vertex AI Gemini 2.5 Flash Lite with project-scope model access and region policy
- Observability
  - Cloud Logging, Cloud Monitoring, Error Reporting, Traces
  - Dashboards per environment & SLOs
- Security & Compliance
  - IAM least-privilege, service accounts per service, Workload Identity, VPC-SC (optional), SCC, DLP, retention policies

---

2) Migration phases (step-by-step)

Phase 0 — Readiness (Org & Foundation)
- [ ] Create folders and projects: moe-dev, moe-stage, moe-prod
- [ ] Link billing and set default region/zone
- [ ] Enable core APIs: artifactregistry, run, cloudbuild, aiplatform, secretmanager, logging, monitoring, iamcredentials, compute
- [ ] Create Artifact Registry repos per env (region: us-central1 or required region)
- [ ] Create KMS key rings & keys (CMEK) for storage/logs if mandated; attach CMEK policies to resources
- [ ] Define and apply org policies (prevent public IPs, restrict services/locations, enforce CMEK, etc.)

Phase 1 — Networking & Security Baseline
- [ ] Create VPC per env; subnets; Cloud NAT for egress
- [ ] Serverless VPC Connector (Cloud Run → VPC) if private egress needed
- [ ] Private access to Google APIs (if required by controls)
- [ ] Create service accounts: router-sa, credit-sa, fraud-sa, esg-sa, build/deploy SAs
- [ ] Bind least-priv roles (e.g., roles/run.invoker, roles/aiplatform.user, roles/artifactregistry.reader)
- [ ] Secrets: create Secret Manager entries; avoid inline secrets; enforce access bindings

Phase 2 — CI/CD & Artifacts
- [ ] Configure Cloud Build triggers for branches (dev/stage/prod)
- [ ] Use separate deploy SAs per env; grant minimum deploy roles
- [ ] Optionally setup Workload Identity Federation for GitHub Actions
- [ ] Build & push images to Artifact Registry (namespaced per env)

Phase 3 — Deploy router and first agent (Credit) to Cloud Run
- [ ] Deploy services with SAs, memory/CPU, min/max instances, concurrency, timeouts
- [ ] Set env vars: GCP_PROJECT_ID, GCP_LOCATION, VERTEX_API_ENDPOINT, ROUTER_MODEL=gemini-2.5-flash-lite
- [ ] Grant router-sa roles/run.invoker on agent services
- [ ] Set router CREDIT_AGENT_URL to agent’s Cloud Run URL
- [ ] Verify /health, /ready; run smoke tests

Phase 4 — Expand to Fraud & ESG agents, and data persistence
- [ ] Scaffold Fraud & ESG microservices and deploy
- [ ] Replace ephemeral storage (SQLite) with managed DB (Cloud SQL/AlloyDB/Spanner) and add migration scripts
- [ ] Ensure read/write IAM for SAs via IAM or IAM DB identities

Phase 5 — Observability, SLOs, Alerts
- [ ] Create Monitoring dashboards (latency, error rate, request throughput, engine readiness, per-agent SLAs)
- [ ] Add alerts (pager/email/Slack) for key SLOs; configure uptime checks if exposed via LB
- [ ] Export logs to BigQuery or SIEM if required; redact sensitive fields

Phase 6 — Compliance & Data Governance
- [ ] Logging retention policy; object lifecycle policies
- [ ] Audit Logs sink to central project; Cloud Asset Inventory
- [ ] Security Command Center (SCC) & Assured Workloads (if required)
- [ ] DLP inspections on logs/data flows; doc PII handling
- [ ] VPC Service Controls for perimeter isolation of sensitive projects (optional)

Phase 7 — DR/BCP & Performance
- [ ] Multi-region strategy (active/standby or active/active) for critical services
- [ ] Performance tests and load testing; autoscaling policies
- [ ] Cost monitoring and budgets; rollback & canary release strategies

---

3) Enterprise tables

3.1 Environment separation

| Area | Dev | Stage | Prod |
|---|---|---|---|
| Projects | moe-dev | moe-stage | moe-prod |
| Artifact Registry | us-central1/moe-dev | us-central1/moe-stage | us-central1/moe-prod |
| Cloud Run services | router, credit, fraud, esg (dev) | same (mirrors) | same (hardened limits) |
| Secrets | Dev-only values | Synthetic or obfuscated | Real; locked down |
| IAM | Broad for velocity | Narrow | Strict least-priv |
| Vertex AI | Enabled; test models | Same | Enabled w/ approved models |
| DB | Dev dataset | Masked staging data | Production datasets |

3.2 Networking & egress

| Topic | Dev | Stage | Prod |
|---|---|---|---|
| VPC | Single env VPC | Separate VPC or shared VPC | Separate VPC; possibly shared VPC with host |
| NAT | Per env | Per env | Per env; restrict egress |
| Private APIs | Optional | Recommended | Strongly recommended |
| Serverless VPC Connector | Optional | If needed | If needed; tuned |

3.3 Security & IAM

| Control | Dev | Stage | Prod |
|---|---|---|---|
| SA per service | Yes | Yes | Yes |
| IAM roles | Minimal set | Least-privilege | Strict least-privilege |
| Secrets | Dev secrets | Stage secrets | Secret Manager w/ rotation |
| CMEK | Optional | Recommended | Required per policy |
| VPC-SC | Optional | Optional | Consider perimeter for sensitive projects |

3.4 Observability

| Metric | Target |
|---|---|
| Router p50 latency | < 200ms (no heavy LLM call) |
| Agent p95 latency | < 800ms (LLM-backed) |
| Error rate | < 1% |
| LLM readiness | 100% for prod; alert if degraded |

3.5 CI/CD

| Area | Practice |
|---|---|
| Triggers | Branch filters (gcp_main for infra/docs; feature branches for changes) |
| Build SA | roles/artifactregistry.writer only |
| Deploy SA | roles/run.admin + roles/iam.serviceAccountUser scoped to env |
| Promotion | dev → stage → prod with approvals |

3.6 Vertex AI

| Topic | Practice |
|---|---|
| Models | gemini-2.5-flash-lite (router); revisit as models evolve |
| Access | Ensure project-level enablement per region (us-central1) |
| Guardrails | JSON schema + function-calling + confidence threshold |
| Data usage | Comply with org policy; disable data logging if required |

3.7 Data & Persistence

| Area | Option |
|---|---|
| DB | Cloud SQL / AlloyDB / Spanner (replace SQLite) |
| Migration | Drizzle/Prisma/Flyway; change approval |
| Backups | Automated backups + PITR |

---

4) Scripts & command skeletons

Environment setup (per project)
```bash
PROJECT_ID=moe-<env>
REGION=us-central1

# APIs
gcloud services enable artifactregistry.googleapis.com run.googleapis.com cloudbuild.googleapis.com aiplatform.googleapis.com secretmanager.googleapis.com logging.googleapis.com monitoring.googleapis.com iamcredentials.googleapis.com compute.googleapis.com

# Artifact Registry
gcloud artifacts repositories create moe-app --location=$REGION --repository-format=docker

# KMS (optional, CMEK)
gcloud kms keyrings create app-ring --location=$REGION
gcloud kms keys create app-key --keyring=app-ring --purpose=encryption --location=$REGION
```

Service accounts (per env)
```bash
# Router & agents
ROUTER_SA=router-sa
CREDIT_SA=credit-sa

for SA in $ROUTER_SA $CREDIT_SA; do
  gcloud iam service-accounts create $SA --display-name="$SA"
  # Example role set (tighten based on usage)
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member=serviceAccount:$SA@$PROJECT_ID.iam.gserviceaccount.com \
    --role=roles/aiplatform.user
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member=serviceAccount:$SA@$PROJECT_ID.iam.gserviceaccount.com \
    --role=roles/run.invoker
  # add artifact registry read if needed for pull from private repos
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member=serviceAccount:$SA@$PROJECT_ID.iam.gserviceaccount.com \
    --role=roles/artifactregistry.reader
done
```

Cloud Run deploy examples
```bash
IMAGE=us-central1-docker.pkg.dev/$PROJECT_ID/moe-app/router:<TAG>
gcloud run deploy moe-app \
  --image=$IMAGE \
  --region=$REGION \
  --service-account=$ROUTER_SA@$PROJECT_ID.iam.gserviceaccount.com \
  --allow-unauthenticated=false \
  --set-env-vars=NODE_ENV=production,GCP_PROJECT_ID=$PROJECT_ID,GCP_LOCATION=$REGION,VERTEX_API_ENDPOINT=$REGION-aiplatform.googleapis.com,ROUTER_MODEL=gemini-2.5-flash-lite

CREDIT_IMAGE=us-central1-docker.pkg.dev/$PROJECT_ID/moe-app/credit-agent:<TAG>
gcloud run deploy credit-agent \
  --image=$CREDIT_IMAGE \
  --region=$REGION \
  --service-account=$CREDIT_SA@$PROJECT_ID.iam.gserviceaccount.com \
  --allow-unauthenticated=false \
  --set-env-vars=NODE_ENV=production,GCP_PROJECT_ID=$PROJECT_ID,GCP_LOCATION=$REGION,VERTEX_API_ENDPOINT=$REGION-aiplatform.googleapis.com,AGENT_MODEL_CREDIT=gemini-2.5-flash-lite

# Grant router to invoke credit-agent
gcloud run services add-iam-policy-binding credit-agent \
  --region=$REGION \
  --member=serviceAccount:$ROUTER_SA@$PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/run.invoker

# Point router to credit-agent URL
gcloud run services update moe-app \
  --region=$REGION \
  --update-env-vars=CREDIT_AGENT_URL=$(gcloud run services describe credit-agent --region=$REGION --format='value(status.url)')
```

---

5) Controls checklist (BFSI)

Security & IAM
- [ ] Dedicated SAs per service; no default SA usage
- [ ] Least-privilege roles; explicit invoker bindings
- [ ] Workload Identity; no long-lived keys
- [ ] Production secrets only in Secret Manager; rotation policy

Data & Residency
- [ ] Restrict regions; data residency documented
- [ ] CMEK for critical services; key lifecycle and rotation plan
- [ ] Logging redaction for PII; DLP scans

Networking
- [ ] Private egress; Cloud NAT; restrict outbound
- [ ] Private Google access/PSC where required

Compliance & Audit
- [ ] Audit Logs to central sink; retention policies
- [ ] SCC enabled; regular reviews
- [ ] Change control: approvals for prod deploy, tagged releases

Observability & Operations
- [ ] SLOs defined; alerts on error/latency
- [ ] On-call runbook; dashboard links
- [ ] DR/BCP tested; backups validated

---

6) Notes on Vertex AI (Gemini 2.5 Flash Lite)

- Ensure the model is enabled for the project and region (us-central1).
- Prefer structured JSON outputs + function-calling to fetch live metrics/registry.
- Add confidence thresholds & fallback to MLP/Rules for robust operation.
- Review data usage settings for compliance (disable data logging if required).

---

7) What to migrate next

- Add OpenAPI specs for each agent and register tool schemas
- Replace SQLite with a managed database and add migrations
- Harden router: JSON schema validation + evaluator harness with test cases
- Consider Agent Builder if you need conversation state and grounded chat flows

---

Appendix: Glossary
- SA: Service Account
- CMEK: Customer-Managed Encryption Keys
- PSC: Private Service Connect
- SCC: Security Command Center
- DLP: Data Loss Prevention
- SLO: Service Level Objective

