#!/bin/bash

# MoE Agent System - Cloud Run Deployment Script (SOURCE-BASED, NO DOCKER)
# Usage: ./deploy.sh --project PROJECT_ID --region REGION [--service SERVICE_NAME]

set -e

# Default values
PROJECT_ID=""
REGION="us-central1"
SERVICE_NAME=""
DEPLOY_ALL=true

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --project)
      PROJECT_ID="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --service)
      SERVICE_NAME="$2"
      DEPLOY_ALL=false
      shift 2
      ;;
    --help)
      echo "Usage: $0 --project PROJECT_ID --region REGION [--service SERVICE_NAME]"
      echo "  --project: GCP Project ID (required)"
      echo "  --region: GCP Region (default: us-central1)"
      echo "  --service: Specific service to deploy (optional, deploys all if not specified)"
      echo "           Options: moe-router, credit-agent, fraud-agent, esg-agent, web"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate required parameters
if [ -z "$PROJECT_ID" ]; then
  echo "Error: --project is required"
  exit 1
fi

# Set the project
gcloud config set project $PROJECT_ID

echo "========================================="
echo "MoE Agent System - Cloud Run Deployment"
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "========================================="

# Function to deploy a Python agent service
deploy_agent() {
  local SERVICE=$1
  local MODULE=$2
  local PORT=$3
  
  echo ""
  echo "Deploying $SERVICE..."
  
  cd raw-agent-code
  
  gcloud run deploy $SERVICE \
    --source . \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --cpu 1 \
    --memory 512Mi \
    --min-instances 0 \
    --max-instances 100 \
    --timeout 60s \
    --concurrency 100 \
    --set-env-vars "VERTEX_AI_PROJECT=$PROJECT_ID,VERTEX_AI_LOCATION=$REGION,LOG_LEVEL=INFO" \
    --command "python,-m,$MODULE.main" \
    --port $PORT
  
  cd ..
  
  echo "✓ $SERVICE deployed successfully"
}

# Function to deploy the web frontend
deploy_web() {
  echo ""
  echo "Deploying Web Frontend..."
  
  cd web
  
  # Get backend URLs
  ROUTER_URL=$(gcloud run services describe moe-router --region $REGION --format 'value(status.url)' 2>/dev/null || echo "")
  
  gcloud run deploy moe-web \
    --source . \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --cpu 1 \
    --memory 512Mi \
    --min-instances 0 \
    --max-instances 100 \
    --set-env-vars "NEXT_PUBLIC_API_URL=$ROUTER_URL,NEXT_PUBLIC_WS_URL=$ROUTER_URL"
  
  cd ..
  
  echo "✓ Web Frontend deployed successfully"
}

# Deploy services
if [ "$DEPLOY_ALL" = true ]; then
  echo ""
  echo "Deploying all services..."
  
  # Deploy agents
  deploy_agent "moe-router" "moe_router" "8080"
  
  # Get router URL for agent configuration
  ROUTER_URL=$(gcloud run services describe moe-router --region $REGION --format 'value(status.url)')
  
  # Deploy specialized agents with router URL
  export ROUTER_URL
  deploy_agent "credit-agent" "credit_agent" "8081"
  deploy_agent "fraud-agent" "fraud_agent" "8082"
  deploy_agent "esg-agent" "esg_agent" "8083"
  
  # Deploy web frontend
  deploy_web
  
else
  # Deploy specific service
  case $SERVICE_NAME in
    moe-router)
      deploy_agent "moe-router" "moe_router" "8080"
      ;;
    credit-agent)
      deploy_agent "credit-agent" "credit_agent" "8081"
      ;;
    fraud-agent)
      deploy_agent "fraud-agent" "fraud_agent" "8082"
      ;;
    esg-agent)
      deploy_agent "esg-agent" "esg_agent" "8083"
      ;;
    web)
      deploy_web
      ;;
    *)
      echo "Error: Unknown service $SERVICE_NAME"
      echo "Valid options: moe-router, credit-agent, fraud-agent, esg-agent, web"
      exit 1
      ;;
  esac
fi

echo ""
echo "========================================="
echo "Deployment Complete!"
echo ""
echo "Service URLs:"
gcloud run services list --platform managed --region $REGION --format="table(SERVICE:label='Service',URL:label='URL')"
echo "========================================="
