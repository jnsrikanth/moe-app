# Terraform Configuration for MoE App Deployment to Cloud Run

terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Variables
variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-central1"
}

variable "service_account_email" {
  description = "Service account email for Cloud Run"
  type        = string
  default     = ""
}

# Enable Required APIs
resource "google_project_service" "cloud_run_api" {
  service = "run.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloud_build_api" {
  service = "cloudbuild.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "artifact_registry_api" {
  service = "artifactregistry.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "vertex_ai_api" {
  service = "aiplatform.googleapis.com"
  disable_on_destroy = false
}

# Artifact Registry for Container Images
resource "google_artifact_registry_repository" "moe_repo" {
  location      = var.region
  repository_id = "moe-app-repo"
  format        = "DOCKER"
  description   = "Docker repository for MoE application"
}

# Cloud Build Trigger (connects to GitHub)
resource "google_cloudbuild_trigger" "moe_app_trigger" {
  name        = "moe-app-deploy-trigger"
  description = "Deploy MoE app on push to main"
  
  github {
    owner = "jnsrikanth"
    name  = "moe-agents-cloud-run"
    push {
      branch = "^main$"
    }
  }
  
  build {
    step {
      name = "gcr.io/cloud-builders/gcloud"
      args = [
        "run", "deploy", "moe-webapp",
        "--source", "web",
        "--region", var.region,
        "--platform", "managed",
        "--allow-unauthenticated",
        "--set-env-vars", "VERTEX_AI_PROJECT=${var.project_id},VERTEX_AI_LOCATION=${var.region}"
      ]
    }
  }
}

# Cloud Run Service - Web App
resource "google_cloud_run_service" "moe_webapp" {
  name     = "moe-webapp"
  location = var.region
  
  template {
    spec {
      service_account_name = var.service_account_email
      
      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/moe-app-repo/moe-webapp:latest"
        
        ports {
          container_port = 3000
        }
        
        env {
          name  = "VERTEX_AI_PROJECT"
          value = var.project_id
        }
        
        env {
          name  = "VERTEX_AI_LOCATION"
          value = var.region
        }
        
        env {
          name  = "NODE_ENV"
          value = "production"
        }
        
        resources {
          limits = {
            cpu    = "2"
            memory = "2Gi"
          }
        }
      }
    }
    
    metadata {
      annotations = {
        "autoscaling.knative.dev/maxScale"     = "100"
        "autoscaling.knative.dev/minScale"     = "1"
        "run.googleapis.com/startup-cpu-boost" = "true"
      }
    }
  }
  
  traffic {
    percent         = 100
    latest_revision = true
  }
  
  depends_on = [
    google_project_service.cloud_run_api
  ]
}

# IAM Policy for public access
resource "google_cloud_run_service_iam_member" "public_access" {
  service  = google_cloud_run_service.moe_webapp.name
  location = google_cloud_run_service.moe_webapp.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Outputs
output "service_url" {
  value = google_cloud_run_service.moe_webapp.status[0].url
  description = "URL of the deployed MoE webapp"
}

output "deployment_instructions" {
  value = <<-EOT
    To deploy using Terraform:
    1. terraform init
    2. terraform plan -var="project_id=YOUR_PROJECT_ID"
    3. terraform apply -var="project_id=YOUR_PROJECT_ID"
  EOT
}