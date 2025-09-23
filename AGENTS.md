# Python-only MoE Agents (Offline Build)

This directory contains the Python services for the Mixture-of-Experts system:
- agents/credit_agent
- agents/fraud_agent
- agents/esg_agent
- agents/moe_router

Builds are fully offline using vendored wheels committed under vendor/python/py311/wheels.

Quick start (offline):
- Populate wheels once (requires internet, then commit):
  - python scripts/bake_wheels.py
- Verify offline build:
  - bash scripts/verify_offline.sh
- Build and run locally:
  - bash scripts/build_offline.sh
  - docker compose up --build

Services:
- Router: http://localhost:8080
- Credit: http://localhost:8081
- Fraud: http://localhost:8082
- ESG: http://localhost:8083

Logging defaults to WARNING to keep output quiet. Set LOG_LEVEL=INFO for debugging.
