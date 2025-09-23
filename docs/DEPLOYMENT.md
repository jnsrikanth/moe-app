# MoE Agent System - Deployment Guide

This guide provides comprehensive instructions for deploying the MoE Agent System to Google Cloud Run.

## Prerequisites

1. **Google Cloud Account**: Active GCP account with billing enabled
2. **gcloud CLI**: Installed and authenticated (`gcloud auth login`)
3. **Required APIs**: Enable the following GCP APIs:
   ```bash
   gcloud services enable run.googleapis.com
   gcloud services enable cloudbuild.googleapis.com
   gcloud services enable aiplatform.googleapis.com
   ```
4. **Vertex AI Setup**: Configure Vertex AI in your project

## Quick Deployment

### One-Command Deployment

Deploy all services with a single command:

```bash
./deploy.sh --project YOUR_PROJECT_ID --region us-central1
```

This will deploy:
- MoE Router service
- Credit Agent
- Fraud Agent
- ESG Agent
- Web Frontend

### Individual Service Deployment

Deploy specific services:

```bash
# Deploy only the MoE Router
./deploy.sh --project YOUR_PROJECT_ID --region us-central1 --service moe-router

# Deploy only the Web Frontend
./deploy.sh --project YOUR_PROJECT_ID --region us-central1 --service web
```

## Manual Deployment Steps

### 1. Deploy Python Agents

#### MoE Router

```bash
cd raw-agent-code
gcloud run deploy moe-router \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "VERTEX_AI_PROJECT=YOUR_PROJECT_ID,VERTEX_AI_LOCATION=us-central1" \
  --command "python,-m,moe_router.main"
```

#### Credit Agent

```bash
gcloud run deploy credit-agent \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "VERTEX_AI_PROJECT=YOUR_PROJECT_ID,VERTEX_AI_LOCATION=us-central1" \
  --command "python,-m,credit_agent.main"
```

#### Fraud Agent

```bash
gcloud run deploy fraud-agent \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "VERTEX_AI_PROJECT=YOUR_PROJECT_ID,VERTEX_AI_LOCATION=us-central1" \
  --command "python,-m,fraud_agent.main"
```

#### ESG Agent

```bash
gcloud run deploy esg-agent \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "VERTEX_AI_PROJECT=YOUR_PROJECT_ID,VERTEX_AI_LOCATION=us-central1" \
  --command "python,-m,esg_agent.main"
```

### 2. Deploy Web Frontend

```bash
cd web

# Get the MoE Router URL
ROUTER_URL=$(gcloud run services describe moe-router --region us-central1 --format 'value(status.url)')

# Deploy the web frontend
gcloud run deploy moe-web \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "NEXT_PUBLIC_API_URL=$ROUTER_URL"
```

## Configuration

### Environment Variables

#### Python Agents
- `VERTEX_AI_PROJECT`: Your GCP project ID
- `VERTEX_AI_LOCATION`: Region for Vertex AI (e.g., us-central1)
- `PORT`: Service port (default: 8080)
- `LOG_LEVEL`: Logging level (INFO/DEBUG/ERROR)
- `MODEL_NAME`: Vertex AI model to use (default: gemini-1.5-flash)

#### Web Frontend
- `NEXT_PUBLIC_API_URL`: URL of the MoE Router service
- `NEXT_PUBLIC_WS_URL`: WebSocket URL (same as API URL)

### Resource Configuration

Customize resource allocation:

```bash
gcloud run deploy SERVICE_NAME \
  --cpu 2 \
  --memory 1Gi \
  --min-instances 1 \
  --max-instances 100 \
  --concurrency 1000
```

### Authentication

For production, enable authentication:

```bash
# Remove --allow-unauthenticated flag
gcloud run deploy SERVICE_NAME \
  --no-allow-unauthenticated

# Grant specific users access
gcloud run services add-iam-policy-binding SERVICE_NAME \
  --member="user:email@example.com" \
  --role="roles/run.invoker"
```

## Monitoring & Logging

### View Logs

```bash
# Stream logs for a service
gcloud run services logs read SERVICE_NAME --region us-central1 --tail 50 -f

# View logs in Cloud Console
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=SERVICE_NAME" --limit 50
```

### Metrics

Monitor service metrics:

```bash
# View service details
gcloud run services describe SERVICE_NAME --region us-central1

# List all services
gcloud run services list --region us-central1
```

## Troubleshooting

### Common Issues

1. **Vertex AI Permission Errors**
   ```bash
   gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
     --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
     --role="roles/aiplatform.user"
   ```

2. **Build Failures**
   - Check Docker configuration
   - Verify all dependencies in requirements.txt
   - Ensure Python version compatibility

3. **Service Connectivity**
   - Verify environment variables
   - Check service URLs
   - Ensure CORS settings

### Health Checks

All services expose health endpoints:

```bash
# Check service health
curl https://SERVICE_URL.run.app/health
```

## Cost Optimization

1. **Set minimum instances to 0** for development
2. **Use appropriate CPU/memory** allocations
3. **Configure autoscaling** based on traffic
4. **Enable request timeout** settings
5. **Use Cloud Run Jobs** for batch processing

## Security Best Practices

1. **Enable authentication** for production
2. **Use Secret Manager** for sensitive data
3. **Configure VPC connectors** for private resources
4. **Set up Cloud Armor** for DDoS protection
5. **Enable audit logging**

## Rollback

To rollback to a previous revision:

```bash
# List revisions
gcloud run revisions list --service SERVICE_NAME --region us-central1

# Rollback to specific revision
gcloud run services update-traffic SERVICE_NAME \
  --to-revisions REVISION_NAME=100 \
  --region us-central1
```

## Cleanup

To delete all deployed services:

```bash
# Delete individual service
gcloud run services delete SERVICE_NAME --region us-central1

# Delete all MoE services
for service in moe-router credit-agent fraud-agent esg-agent moe-web; do
  gcloud run services delete $service --region us-central1 --quiet
done
```

## Support

For issues or questions:
1. Check service logs
2. Verify environment variables
3. Review Cloud Run quotas
4. Contact GCP support if needed
