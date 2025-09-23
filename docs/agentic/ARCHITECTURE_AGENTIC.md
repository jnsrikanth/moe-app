# Agentic MoE Architecture (Truly Agentic)

This document describes the updated, agentic Mixture-of-Experts (MoE) design implemented on the truly_agentic branch. It focuses on:
- Router engines (LLM, Rules, Bandit+Rules) and routing transparency
- Expert agent structure and structured outputs
- Deterministic final decision aggregation
- Persistence without databases (file-backed registry + decisions)
- Optional local tiny LLM (llama-cpp) for offline inference
- Observability and drill‑in UI

1) Overview
- User submits a BFSI request (e.g., Personal Loan, Fraud Investigation, ESG Report) from the dashboard.
- Router selects one or more expert agents via the configured engine: Rules, ML (Bandit+Rules), LLM, or Hybrid.
- Experts return structured JSON (credit/fraud/esg). The MoE aggregates results into a FINAL DECISION (Approved/Declined) with rationale.
- A structured DecisionRecord is appended to data/decisions.jsonl and broadcast on WebSocket for real‑time UI updates.

2) Router Engines
- RulesRouterStrategy
  - Keyword + registry bias (type + routingHints). Fast, deterministic. No external dependencies.
- BanditRouterStrategy (ML engine slot)
  - Contextual bandit wrapper over Rules candidates; uses UCB1 to adaptively prioritize agents that historically perform better.
  - Persistence: data/bandit-stats.json (n, reward per agentId). Reward hooks are exposed to extend with feedback loops.
- LLMRouterStrategy
  - Prompts a model for a JSON routing decision (selected_agents + reasoning), with a kill switch and a fallback to Rules.
- Hybrid
  - Uses ML (bandit) first, then LLM, then Rules as a safety net.

Routing transparency
- Every routing decision produces logs: “MoE Router: <type> → agent list” and optional reasoning.
- The router engine and model labels are reflected in the UI.

3) Expert Agents
- Credit Agent (Python FastAPI)
  - Returns CreditScore, RiskAssessment, LoanEligibility and a human‑readable summary.
  - Offline modes: heuristic + optional local llama‑cpp (if Vertex disabled).
- Fraud Agent (Python FastAPI)
  - Produces TransactionAnalysis + FraudDetectionResult with risk scores and recommended actions.
- ESG Agent (Python FastAPI)
  - Produces Environmental/Social/Governance sub‑scores, overall rating and recommendations.

Strict JSON Contracts
- Agents return structured responses that can be parsed deterministically. Non‑JSON LLM outputs are sanitized with conservative defaults.

4) Final Decision Aggregation
- The MoE aggregates agent outputs using deterministic, documented thresholds:
  - Decline if any of:
    - fraud probability ≥ 60%
    - credit risk is High
    - credit score < 600
    - explicit Decline/Reject in agent outputs
  - Otherwise Approve, with rationale summarizing fraud probability, credit risk and score, and ESG acceptability.
- The aggregator produces a single record:
  - FINAL DECISION: Approved/Declined — rationale
  - Broadcasts as log; also appended as a structured DecisionRecord to data/decisions.jsonl.

5) Persistence Without Databases
- Agent Registry
  - STORAGE=file enables FileStorage which wraps in‑memory storage and persists agent registry to data/agent_registry.json.
  - Health is derived from heartbeats with a TTL (default 30s). The registry is rehydrated on boot.
- Decision Store
  - data/decisions.jsonl is append‑only; each line is a DecisionRecord including requestId, assignedAgents, agentResults summaries, and final decision.
- Router/ML Stats
  - Bandit stats persisted in data/bandit-stats.json.

6) Optional Local Tiny LLM (llama‑cpp)
- Configuration: set LOCAL_LLM_MODEL to a GGUF path, e.g. vendor/models/qwen2.5-0.5b-instruct-q4_k_m.gguf.
- If Vertex is disabled (DISABLE_VERTEX=1) and local model present, the Credit Agent uses it to produce strict JSON; otherwise falls back to heuristics.
- Recommendation: vendor the model with Git LFS for offline environments.

7) Observability and Drill‑in UI
- WebSocket updates include: initial_data, new_request, request_updated, registry_updated, router_metrics_updated, new_log, decision_recorded.
- The dashboard’s MoE Router panel renders a step‑by‑step decision trace:
  - Request ID, routing engine, selected agents, per‑agent response snippets, final decision and rationale.
- APIs:
  - GET /api/decisions?limit=50 — recent decisions
  - GET /api/decisions/:requestId — a single decision by request ID

8) Deployment & Local Dev
- Compose (deploy/compose.yaml)
  - Adds volumes ../data:/app/data to persist file‑backed stores.
  - Optional LOCAL_LLM_MODEL placeholders for agents.
- Node Runtime (agents/web)
  - npm run dev for local server with API + client.
  - STORAGE=file persists registry to data/agent_registry.json; decisions written to data/decisions.jsonl.

9) Extensibility Roadmap
- Extend local LLM hook to Fraud and ESG agents (same strict JSON pattern).
- Feedback pipeline: connect business outcomes back into bandit rewards for continual routing improvement.
- Case memory: file‑backed retrieval of recent similar cases to ground agent outputs.
- UI drill‑downs: per‑request detail drawer showing full routing reasoning and raw JSON for each agent output.

Appendix A — DecisionRecord Schema
- id: string
- requestId: string
- type?: string
- assignedAgents: string[]
- routing?: { engine?: string; reasoning?: string }
- agentResults?: [{ agentId?: string; agentType?: string; summary?: string; raw?: string }]
- final: { status: Approved | Declined; rationale: string }
- createdAt: ISO string
- processingTimeMs?: number
