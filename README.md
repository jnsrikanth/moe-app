# MoE (Mixture of Experts) — Python-only, Offline-ready

Clean, minimal, Python-based MoE system with separate services (Router, Credit, Fraud, ESG) and a lightweight FastAPI dashboard.

- Local (offline) quick start: see scripts/deploy_local_offline.sh
- Cloud Run deployment (multi-service): see docs/deploy/cloudrun.md

Key points
- No Node/Yarn/NPM; frontend is a simple Jinja2 + CSS dashboard
- Vendored Python wheels for offline reproducible builds
- Each agent and router can run locally or as its own Cloud Run service

Useful links
- Cloud Run guide: docs/deploy/cloudrun.md
- Dashboard app: web/
- Agents: agents/
