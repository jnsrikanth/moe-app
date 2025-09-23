# GitHub Actions CI/CD Setup

This guide explains how to set up automatic deployment to Google Cloud Run using GitHub Actions.

## Prerequisites

1. Google Cloud Project with billing enabled
2. Service Account with necessary permissions
3. GitHub repository (already created at https://github.com/jnsrikanth/moe-agents-cloud-run)

## Setup Steps

### 1. Create a Google Cloud Service Account

```bash
# Create service account
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions Deploy"

# Get the service account email
export SA_EMAIL="github-actions@YOUR_PROJECT_ID.iam.gserviceaccount.com"

# Grant necessary roles
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/cloudbuild.builds.builder"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/aiplatform.user"
```

### 2. Create and Download Service Account Key

```bash
gcloud iam service-accounts keys create github-actions-key.json \
  --iam-account=${SA_EMAIL}
```

⚠️ **Important**: Keep this key secure and never commit it to the repository!

### 3. Add Secrets to GitHub Repository

Go to your repository settings on GitHub:
1. Navigate to: Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Add the following secrets:

#### `GCP_PROJECT_ID`
- **Value**: Your Google Cloud Project ID

#### `GCP_SA_KEY`
- **Value**: The entire contents of `github-actions-key.json`
- Copy the JSON content and paste it as the secret value

### 4. Enable Required APIs

```bash
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  aiplatform.googleapis.com \
  artifactregistry.googleapis.com
```

### 5. Trigger Deployment

The workflow will automatically run when:
- You push to the `main` branch
- You manually trigger it from the Actions tab

To manually trigger:
1. Go to Actions tab in GitHub
2. Select "Deploy to Cloud Run" workflow
3. Click "Run workflow"

## Workflow Overview

The GitHub Actions workflow (`/.github/workflows/deploy.yml`) performs:

1. **Test Phase**:
   - Sets up Python 3.11 and Node.js 18
   - Installs dependencies
   - Runs tests (when available)
   - Builds the Next.js application

2. **Deploy Phase** (only on main branch):
   - Authenticates with Google Cloud
   - Deploys all agent services sequentially
   - Configures environment variables
   - Sets up proper networking between services

## Monitoring Deployments

### View Workflow Runs
- Go to the Actions tab in your GitHub repository
- Click on a workflow run to see detailed logs

### Check Deployment Status
```bash
gcloud run services list --region us-central1
```

### View Service Logs
```bash
gcloud run services logs read SERVICE_NAME --region us-central1
```

## Rollback

If a deployment fails or causes issues:

### Manual Rollback via Cloud Console
1. Go to Cloud Run in Google Cloud Console
2. Select the service
3. Click "Revisions" tab
4. Route traffic to a previous revision

### Rollback via CLI
```bash
gcloud run services update-traffic SERVICE_NAME \
  --to-revisions=REVISION_NAME=100 \
  --region=us-central1
```

## Security Best Practices

1. **Rotate Service Account Keys Regularly**
   ```bash
   gcloud iam service-accounts keys list --iam-account=${SA_EMAIL}
   gcloud iam service-accounts keys delete KEY_ID --iam-account=${SA_EMAIL}
   ```

2. **Use Workload Identity Federation** (recommended for production)
   - Eliminates the need for service account keys
   - More secure than key-based authentication

3. **Limit Permissions**
   - Use the principle of least privilege
   - Create custom roles if needed

4. **Enable Audit Logging**
   ```bash
   gcloud logging read "resource.type=cloud_run_revision"
   ```

## Troubleshooting

### Common Issues

1. **Authentication Failed**
   - Verify the service account key is correctly added as a secret
   - Check that the JSON is properly formatted

2. **Permission Denied**
   - Ensure all required roles are granted to the service account
   - Verify API services are enabled

3. **Build Failures**
   - Check the workflow logs in GitHub Actions
   - Verify dependencies are correctly specified

4. **Deployment Timeouts**
   - Increase timeout values in the deployment commands
   - Check if services are trying to start on the wrong port

## Cost Optimization

To minimize costs:

1. **Set minimum instances to 0** in production
2. **Use concurrency settings** appropriately
3. **Configure CPU allocation** based on actual needs
4. **Set up budget alerts** in Google Cloud

## Support

For issues:
1. Check GitHub Actions logs
2. Review Cloud Run logs
3. Verify all secrets are properly configured
4. Open an issue in the repository if needed
