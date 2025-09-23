# Persistence without Databases

To avoid using databases on the CloudPC, enable file-backed persistence for agent registry and decisions.

- Agent Registry: STORAGE=file (persists to data/agent_registry.json)
- Decisions: Always written to data/decisions.jsonl by the web server

Environment
- STORAGE=file
- SQLITE_PATH (ignored when STORAGE=file)

Docker Compose
- Mount a volume for ./data to persist across container restarts:

```
services:
  moe-app:
    volumes:
      - ./data:/app/data
```

APIs
- GET /api/agents — reads current registry (health derived from TTL)
- POST /api/agents/register — persists to data/agent_registry.json
- GET /api/decisions?limit=50 — lists recent decisions from data/decisions.jsonl
- GET /api/decisions/:requestId — fetch one decision

UI
- The Router panel shows a step-by-step trace once a decision is recorded. The same data is available from /api/decisions.
