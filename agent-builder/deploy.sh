#!/bin/bash

# Vertex AI Agent Builder Deployment Script
# Deploys the fraud detection agent to GCP

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-}"
LOCATION="${AGENT_LOCATION:-us-central1}"
AGENT_ID="fraud-detection-agent"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-fraud-agent@${PROJECT_ID}.iam.gserviceaccount.com}"

# Function to print colored output
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    echo "Checking prerequisites..."
    
    # Check if gcloud is installed
    if ! command -v gcloud &> /dev/null; then
        print_error "gcloud CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check if project ID is set
    if [ -z "$PROJECT_ID" ]; then
        print_error "GCP_PROJECT_ID environment variable is not set."
        echo "Please run: export GCP_PROJECT_ID=your-project-id"
        exit 1
    fi
    
    # Check if authenticated
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
        print_error "Not authenticated with gcloud. Please run: gcloud auth login"
        exit 1
    fi
    
    print_status "Prerequisites check completed"
}

# Enable required APIs
enable_apis() {
    echo "Enabling required GCP APIs..."
    
    apis=(
        "aiplatform.googleapis.com"
        "cloudfunctions.googleapis.com"
        "firestore.googleapis.com"
        "bigquery.googleapis.com"
        "pubsub.googleapis.com"
        "cloudscheduler.googleapis.com"
        "logging.googleapis.com"
        "monitoring.googleapis.com"
    )
    
    for api in "${apis[@]}"; do
        echo "Enabling $api..."
        gcloud services enable "$api" --project="$PROJECT_ID" --quiet
    done
    
    print_status "APIs enabled successfully"
}

# Create service account
create_service_account() {
    echo "Setting up service account..."
    
    # Check if service account exists
    if gcloud iam service-accounts describe "$SERVICE_ACCOUNT" --project="$PROJECT_ID" &> /dev/null; then
        print_warning "Service account already exists"
    else
        gcloud iam service-accounts create fraud-agent \
            --display-name="Fraud Detection Agent Service Account" \
            --project="$PROJECT_ID"
        print_status "Service account created"
    fi
    
    # Grant necessary roles
    roles=(
        "roles/aiplatform.user"
        "roles/datastore.user"
        "roles/bigquery.dataViewer"
        "roles/pubsub.publisher"
        "roles/cloudfunctions.developer"
        "roles/logging.logWriter"
    )
    
    for role in "${roles[@]}"; do
        echo "Granting $role..."
        gcloud projects add-iam-policy-binding "$PROJECT_ID" \
            --member="serviceAccount:$SERVICE_ACCOUNT" \
            --role="$role" \
            --quiet
    done
    
    print_status "Service account configured"
}

# Deploy Cloud Functions (Tools)
deploy_tools() {
    echo "Deploying agent tools as Cloud Functions..."
    
    cd fraud-agent/tools
    
    # Deploy transaction analyzer
    echo "Deploying transaction analyzer..."
    gcloud functions deploy analyze-transaction \
        --gen2 \
        --runtime=python311 \
        --region="$LOCATION" \
        --source=. \
        --entry-point=analyze_transaction \
        --trigger-http \
        --allow-unauthenticated \
        --memory=512MB \
        --timeout=30s \
        --project="$PROJECT_ID"
    
    print_status "Tools deployed successfully"
    cd ../..
}

# Create Firestore collections
setup_firestore() {
    echo "Setting up Firestore collections..."
    
    # Create firestore database if it doesn't exist
    gcloud firestore databases create \
        --location="$LOCATION" \
        --project="$PROJECT_ID" \
        --quiet || print_warning "Firestore database already exists"
    
    # Note: Firestore collections are created automatically when first document is added
    print_status "Firestore setup completed"
}

# Create BigQuery dataset and tables
setup_bigquery() {
    echo "Setting up BigQuery datasets..."
    
    # Create dataset
    bq mk -d \
        --location="$LOCATION" \
        --project_id="$PROJECT_ID" \
        fraud_detection || print_warning "Dataset already exists"
    
    # Create transactions table
    cat > /tmp/transactions_schema.json <<EOF
[
  {"name": "transaction_id", "type": "STRING", "mode": "REQUIRED"},
  {"name": "user_id", "type": "STRING", "mode": "REQUIRED"},
  {"name": "amount", "type": "NUMERIC", "mode": "REQUIRED"},
  {"name": "merchant_id", "type": "STRING", "mode": "REQUIRED"},
  {"name": "location", "type": "GEOGRAPHY", "mode": "NULLABLE"},
  {"name": "timestamp", "type": "TIMESTAMP", "mode": "REQUIRED"},
  {"name": "fraud_score", "type": "NUMERIC", "mode": "NULLABLE"},
  {"name": "is_fraudulent", "type": "BOOLEAN", "mode": "NULLABLE"}
]
EOF
    
    bq mk -t \
        --project_id="$PROJECT_ID" \
        fraud_detection.transactions \
        /tmp/transactions_schema.json || print_warning "Table already exists"
    
    rm /tmp/transactions_schema.json
    print_status "BigQuery setup completed"
}

# Create Pub/Sub topics
setup_pubsub() {
    echo "Setting up Pub/Sub topics..."
    
    # Create topics
    gcloud pubsub topics create fraud-detection-events \
        --project="$PROJECT_ID" || print_warning "Topic already exists"
    
    # Create subscription
    gcloud pubsub subscriptions create fraud-agent-subscription \
        --topic=fraud-detection-events \
        --project="$PROJECT_ID" || print_warning "Subscription already exists"
    
    print_status "Pub/Sub setup completed"
}

# Deploy Agent to Agent Builder
deploy_agent() {
    echo "Deploying agent to Vertex AI Agent Builder..."
    
    # Note: Agent Builder deployment via CLI is still in preview
    # This creates the agent configuration
    
    cat > /tmp/agent_config.json <<EOF
{
  "displayName": "Fraud Detection Expert Agent",
  "description": "Specialized agent for detecting fraudulent transactions",
  "defaultLanguageCode": "en",
  "timeZone": "UTC",
  "supportedLanguageCodes": ["en"],
  "startFlow": "fraud-detection-flow",
  "enableStackdriverLogging": true,
  "enableSpellCorrection": true
}
EOF
    
    # Create agent using REST API (Agent Builder console API)
    # Note: Full Agent Builder API deployment is complex and requires additional setup
    print_warning "Agent configuration created. Manual deployment via console may be required."
    print_warning "Visit: https://console.cloud.google.com/ai/agent-builder"
    
    rm /tmp/agent_config.json
}

# Create monitoring dashboard
setup_monitoring() {
    echo "Setting up monitoring dashboard..."
    
    cat > /tmp/dashboard_config.json <<EOF
{
  "displayName": "Fraud Detection Agent Dashboard",
  "dashboardFilters": [],
  "gridLayout": {
    "widgets": [
      {
        "title": "Fraud Detection Latency",
        "xyChart": {
          "dataSets": [{
            "timeSeriesQuery": {
              "timeSeriesFilter": {
                "filter": "metric.type=\"custom.googleapis.com/fraud_detection_latency\""
              }
            }
          }]
        }
      },
      {
        "title": "Risk Level Distribution",
        "pieChart": {
          "dataSets": [{
            "timeSeriesQuery": {
              "timeSeriesFilter": {
                "filter": "metric.type=\"custom.googleapis.com/risk_level_counts\""
              }
            }
          }]
        }
      }
    ]
  }
}
EOF
    
    gcloud monitoring dashboards create --config-from-file=/tmp/dashboard_config.json \
        --project="$PROJECT_ID" || print_warning "Dashboard already exists"
    
    rm /tmp/dashboard_config.json
    print_status "Monitoring setup completed"
}

# Update environment configuration
update_env_config() {
    echo "Updating environment configuration..."
    
    ENV_FILE="../.env.agent-builder"
    
    cat > "$ENV_FILE" <<EOF
# Agent Builder Configuration
GCP_PROJECT_ID=$PROJECT_ID
AGENT_LOCATION=$LOCATION
FRAUD_AGENT_ID=$AGENT_ID
FRAUD_AGENT_ENDPOINT=https://$LOCATION-aiplatform.googleapis.com

# Cloud Function URLs
TRANSACTION_ANALYZER_URL=https://$LOCATION-$PROJECT_ID.cloudfunctions.net/analyze-transaction

# Data Store Configuration
FIRESTORE_DATABASE=(default)
BIGQUERY_DATASET=fraud_detection

# Pub/Sub Configuration
FRAUD_EVENTS_TOPIC=fraud-detection-events
FRAUD_EVENTS_SUBSCRIPTION=fraud-agent-subscription

# Service Account
SERVICE_ACCOUNT=$SERVICE_ACCOUNT
EOF
    
    print_status "Environment configuration saved to $ENV_FILE"
}

# Main deployment flow
main() {
    echo "========================================="
    echo "Vertex AI Agent Builder Deployment"
    echo "Project: $PROJECT_ID"
    echo "Location: $LOCATION"
    echo "========================================="
    echo ""
    
    check_prerequisites
    enable_apis
    create_service_account
    deploy_tools
    setup_firestore
    setup_bigquery
    setup_pubsub
    deploy_agent
    setup_monitoring
    update_env_config
    
    echo ""
    echo "========================================="
    print_status "Deployment completed successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Visit the Agent Builder console to complete agent setup"
    echo "2. Test the agent using the test script: ./test_agent.sh"
    echo "3. Update the MoE system to use the new agent client"
    echo "========================================="
}

# Run main function
main "$@"
