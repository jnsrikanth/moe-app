#!/usr/bin/env python3
"""
Deploy to Cloud Run using REST API (no gcloud CLI required)
This can be run from any environment with Python
"""

import json
import os
import requests
from google.auth import default
from google.auth.transport.requests import Request

# Configuration
PROJECT_ID = "your-project-id"
REGION = "us-central1"
SERVICE_NAME = "moe-webapp"

def get_access_token():
    """Get access token using Application Default Credentials"""
    credentials, project = default()
    credentials.refresh(Request())
    return credentials.token

def deploy_to_cloud_run():
    """Deploy using Cloud Run REST API"""
    
    # Get authentication token
    token = get_access_token()
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    # Cloud Run API endpoint
    api_url = f"https://run.googleapis.com/v2/projects/{PROJECT_ID}/locations/{REGION}/services"
    
    # Service configuration
    service_config = {
        "apiVersion": "serving.knative.dev/v1",
        "kind": "Service",
        "metadata": {
            "name": SERVICE_NAME,
            "annotations": {
                "run.googleapis.com/launch-stage": "GA"
            }
        },
        "spec": {
            "template": {
                "metadata": {
                    "annotations": {
                        "autoscaling.knative.dev/maxScale": "100",
                        "autoscaling.knative.dev/minScale": "1",
                        "run.googleapis.com/execution-environment": "gen2"
                    }
                },
                "spec": {
                    "containerConcurrency": 100,
                    "timeoutSeconds": 300,
                    "serviceAccountName": f"{PROJECT_ID}@appspot.gserviceaccount.com",
                    "containers": [
                        {
                            "image": f"gcr.io/{PROJECT_ID}/{SERVICE_NAME}:latest",
                            "ports": [{"containerPort": 3000}],
                            "env": [
                                {"name": "VERTEX_AI_PROJECT", "value": PROJECT_ID},
                                {"name": "VERTEX_AI_LOCATION", "value": REGION},
                                {"name": "NODE_ENV", "value": "production"}
                            ],
                            "resources": {
                                "limits": {
                                    "cpu": "2",
                                    "memory": "2Gi"
                                }
                            }
                        }
                    ]
                }
            }
        }
    }
    
    # Deploy the service
    response = requests.post(api_url, headers=headers, json=service_config)
    
    if response.status_code == 200:
        print(f"✅ Successfully deployed {SERVICE_NAME}")
        result = response.json()
        print(f"Service URL: {result.get('status', {}).get('url', 'Pending...')}")
    else:
        print(f"❌ Deployment failed: {response.status_code}")
        print(response.text)

if __name__ == "__main__":
    # Set your project ID
    PROJECT_ID = input("Enter your GCP Project ID: ")
    deploy_to_cloud_run()