# Cloud Run Deployment Guide - MoE Application

This comprehensive guide provides multiple deployment methods for deploying the MoE (Mixture of Experts) application to Google Cloud Run, suitable for various enterprise environments and technical requirements.

## Prerequisites

1. **GCP Project** with billing enabled
2. **APIs to Enable:**
   - Cloud Run API
   - Cloud Build API (for automated deployments)
   - Vertex AI API (for accessing Gemini models)
   - Artifact Registry API (optional)

3. **Permissions:** Project Editor or specific IAM roles:
   - Cloud Run Admin
   - Vertex AI User
   - Service Account User

## Deployment Methods Summary

| Method | CLI Required | Complexity | Best For |
|--------|-------------|------------|----------|
| Cloud Console UI | ❌ No | Easy | Manual deployments, POCs |
| Terraform | ❌ No | Medium | Infrastructure as Code |
| Cloud Build | ✅ Yes (once) | Medium | CI/CD pipelines |
| REST API | ❌ No | Medium | Custom automation |
| GitHub Actions | ❌ No | Easy | Automated CI/CD |
| Cloud Deploy | ✅ Yes (once) | Complex | Multi-environment pipelines |

## Method 1: Cloud Console (Web UI) - NO CLI REQUIRED ✅

A straightforward approach using only the web browser interface.

### Steps:
1. **Navigate to Cloud Run**
   - Go to https://console.cloud.google.com
   - Select your project
   - Navigate to Cloud Run

2. **Create Service**
   - Click "CREATE SERVICE"
   - Choose "Continuously deploy from a repository"
   
3. **Connect Repository**
   - Select "GitHub" 
   - Authorize and select `jnsrikanth/moe-agents-cloud-run`
   - Choose branch: `main`
   - Build type: `Go, Node.js, Python, Java, .NET Core, Ruby or PHP via Google Cloud's buildpacks`

4. **Configure Service**
   - Service name: `moe-webapp`
   - Region: Select your preferred region
   - CPU: 2 vCPU
   - Memory: 2 GiB
   - Max instances: 100
   - Min instances: 1

5. **Environment Variables**
   - Click "Variables & Secrets"
   - Add:
     - `VERTEX_AI_PROJECT`: Your GCP project ID (same as current project)
     - `VERTEX_AI_LOCATION`: Region (e.g., us-central1)
     - `NODE_ENV`: production

6. **Deploy**
   - Click "CREATE"
   - Wait for deployment (~5-10 minutes)

## Method 2: Terraform - NO CLI NEEDED ✅

Infrastructure as Code approach, perfect for enterprises.

### Steps:
1. **Prepare Terraform files**
   ```hcl
   # Use the provided terraform/main.tf
   cd deployment/terraform
   ```

2. **Initialize (one-time)**
   ```bash
   terraform init
   ```

3. **Deploy**
   ```bash
   terraform apply -var="project_id=your-project-id"
   ```

### Using Terraform Cloud:
- Upload the terraform files to Terraform Cloud
- Configure workspace variables
- Trigger runs through the UI
- No local CLI access required

## Method 3: REST API - NO CLI NEEDED ✅

Deploy using any programming language or tool that can make HTTP requests.

### Python Example:
```python
# Use the provided deploy_with_api.py
python deployment/deploy_with_api.py
```

### PowerShell Example (for Windows):
```powershell
$token = gcloud auth print-access-token
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

$body = @{
    # Service configuration
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://run.googleapis.com/v2/projects/PROJECT/locations/REGION/services" `
    -Method POST `
    -Headers $headers `
    -Body $body
```

### cURL Example:
```bash
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -d @service.json \
  https://run.googleapis.com/v2/projects/PROJECT/locations/REGION/services
```

## Method 4: Cloud Build - SOURCE-BASED

Submit source code directly without Docker.

### One-time Setup:
```bash
# Submit the build
gcloud builds submit --config=cloudbuild.yaml
```

### Trigger from Console:
1. Go to Cloud Build > Triggers
2. Create trigger connected to GitHub
3. Trigger builds from UI

## Method 5: GitHub Actions - FULLY AUTOMATED

Already configured in `.github/workflows/deploy.yml`

### Setup:
1. Go to GitHub repository settings
2. Add secrets:
   - `GCP_PROJECT_ID`
   - `GCP_SA_KEY` (service account JSON)
3. Push to main branch to trigger deployment

## Method 6: Google Cloud Deploy - ENTERPRISE GRADE

For complex multi-environment deployments with approval gates.

### Features:
- Dev → Staging → Production pipeline
- Approval gates between environments
- Canary deployments
- Automatic rollbacks

### Setup:
```bash
gcloud deploy apply --file=deployment/clouddeploy.yaml
```

## Enterprise Integration Options

### Option A: Service Catalog Integration
For organizations with internal service catalogs:
1. Request Cloud Run service through catalog
2. Upload source code as ZIP
3. Specify configuration parameters
4. Automated deployment through catalog workflow

### Option B: CI/CD Pipeline Integration
For existing CI/CD systems (Jenkins, GitLab, Azure DevOps, etc.):
1. Use provided `cloudbuild.yaml` as reference
2. Create pipeline configuration
3. Use service account for authentication
4. Deploy through pipeline execution

### Option C: Artifact Registry Deployment
1. Build locally: `npm run build`
2. Create ZIP of the `web` folder
3. Upload to Artifact Registry via Console
4. Deploy from Console using the uploaded artifact

## Security Considerations

### VPC Service Controls
```yaml
# Restrict to internal network only
annotations:
  run.googleapis.com/vpc-access-connector: projects/PROJECT/locations/REGION/connectors/CONNECTOR
  run.googleapis.com/vpc-access-egress: all-traffic
```

### Binary Authorization
```yaml
# Ensure only approved images are deployed
binaryAuthorization:
  breakglassJustification: "Emergency deployment"
  policy: projects/PROJECT/binaryAuthorizationPolicies/POLICY
```

### Private Service
```yaml
# No public access
run.googleapis.com/ingress: internal
```

## AI Model Configuration

This application supports multiple AI model providers to ensure functionality even in restricted environments:

### Available Providers

1. **Vertex AI (Default)**
   - Uses Google Cloud's Vertex AI for Gemini models
   - Requires GCP project and authentication
   - Higher accuracy but requires external API access

2. **Local Lightweight Models (Fallback)**
   - Built-in lightweight NLP models
   - No external dependencies or API calls
   - Lower accuracy but always available
   - Automatic fallback if Vertex AI is unavailable

### Model Selection
- Available in the web dashboard dropdown
- Automatically switches to local models if Vertex AI is unavailable
- Can be pre-configured via environment variable

```bash
# Force local models from start
AI_PROVIDER=local

# Use Vertex AI with fallback (default)
AI_PROVIDER=vertex
```

## Environment Variables & Authentication

### AI Service Configuration

This application uses **Google's Vertex AI service** to access Gemini models (gemini-1.5-flash, gemini-1.5-pro, etc.). 

**Important:** This is NOT the direct Gemini API - it uses Vertex AI which requires:
1. A GCP project with Vertex AI API enabled
2. Proper authentication (handled automatically when running on Cloud Run)

| Variable | Description | Example | Alternative Names |
|----------|-------------|---------|-------------------|
| `VERTEX_AI_PROJECT` | GCP Project ID with Vertex AI enabled | `moe-app-prod` | `GCP_PROJECT_ID`, `GOOGLE_CLOUD_PROJECT` |
| `VERTEX_AI_LOCATION` | Region for Vertex AI | `us-central1` | `GCP_LOCATION` |

### Application Configuration

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `production` |
| `PORT` | Service port | `3000` |

### Authentication Notes

- **On Cloud Run:** Authentication is automatic via the service account
- **Local Development:** Set `GOOGLE_APPLICATION_CREDENTIALS` to service account key path
- **Required APIs:** Vertex AI API must be enabled in your GCP project

## Post-Deployment Verification

1. **Check Service Status**
   - Console: Cloud Run → Services → moe-webapp
   - Look for green checkmark

2. **Test Endpoints**
   ```bash
   curl https://SERVICE_URL/health
   curl https://SERVICE_URL/api/agents
   ```

3. **Monitor Logs**
   - Console: Cloud Run → moe-webapp → Logs
   - Check for any errors

## Rollback Procedure

### Via Console:
1. Go to Cloud Run → moe-webapp
2. Click "Revisions" tab
3. Select previous revision
4. Click "Manage Traffic"
5. Set 100% to previous revision

### Via API:
```json
{
  "traffic": [
    {
      "revisionName": "moe-webapp-00001-abc",
      "percent": 100
    }
  ]
}
```

## Support

For deployment issues:
1. Check Cloud Run logs
2. Verify environment variables
3. Ensure APIs are enabled
4. Check IAM permissions

Remember: **You do NOT need Docker or gcloud CLI for most deployment methods!**