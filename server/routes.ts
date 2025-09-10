import type { Express } from "express";
import { promises as fs } from 'fs';
import path from 'path';
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { aiService } from "./ai-service";
import { RealMoESystem, ROUTER_MODEL, AGENT_MODELS } from "./real-moe-system";
import { presence } from './registry-presence';
import { z } from "zod";
import { randomUUID } from "crypto";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // REST API Routes
  app.get("/api/expert-agents", async (req, res) => {
    try {
      const agents = await storage.getExpertAgents();
      // Ensure model labels come from the single source of truth (AGENT_MODELS)
      const normalized = agents.map(a => ({
        ...a,
        model: AGENT_MODELS[(a.type as 'credit' | 'fraud' | 'esg')] || a.model,
      }));
      res.json(normalized);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch expert agents" });
    }
  });

  // Simple dataset file upload (base64 content)
  app.post('/api/datasets/upload', async (req, res) => {
    try {
      const { name, contentBase64 } = req.body || {};
      if (!name || !contentBase64) return res.status(400).json({ error: 'name and contentBase64 are required' });
      const buffer = Buffer.from(String(contentBase64), 'base64');
      const dir = path.resolve(process.cwd(), 'uploaded-datasets');
      await fs.mkdir(dir, { recursive: true });
      const filePath = path.join(dir, `${Date.now()}-${name}`);
      await fs.writeFile(filePath, buffer);
      const meta = await storage.registerDataset({ name: String(name), source: 'upload', records: undefined, sizeBytes: buffer.length, url: filePath });
      res.json(meta);
    } catch (e) {
      console.error('Upload failed', e);
      res.status(500).json({ error: 'Failed to upload dataset' });
    }
  });

  // Dataset registry endpoints (metadata only)
  app.get('/api/datasets', async (_req, res) => {
    try {
      const datasets = await storage.listDatasets();
      res.json(datasets);
    } catch (e) {
      res.status(500).json({ error: 'Failed to list datasets' });
    }
  });

  app.post('/api/datasets/register', async (req, res) => {
    try {
      const body = req.body || {};
      if (!body.name || !body.source) return res.status(400).json({ error: 'name and source are required' });
      const ds = await storage.registerDataset({
        id: body.id,
        name: String(body.name),
        source: body.source,
        url: body.url,
        records: body.records,
        sizeBytes: body.sizeBytes,
      });
      res.json(ds);
    } catch (e) {
      res.status(500).json({ error: 'Failed to register dataset' });
    }
  });

  app.delete('/api/datasets/:id', async (req, res) => {
    try {
      const ok = await storage.removeDataset(String(req.params.id));
      if (!ok) return res.status(404).json({ error: 'Dataset not found' });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to delete dataset' });
    }
  });

  app.delete('/api/agents/:id', async (req, res) => {
    try {
      const id = String(req.params.id);
      const removed = await storage.removeAgent(id);
      if (!removed) return res.status(404).json({ error: 'Agent not found' });
      const registry = await storage.getAgentRegistry();
      broadcastUpdate('registry_updated', registry);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to remove agent' });
    }
  });

  // Analytics summary
  app.get('/api/analytics/summary', async (_req, res) => {
    try {
      const [requests, logs] = await Promise.all([
        storage.getRequests(),
        storage.getSystemLogs(),
      ]);
      const byType: Record<string, number> = {};
      const byStatus: Record<string, number> = {};
      for (const r of requests) {
        byType[r.type] = (byType[r.type] || 0) + 1;
        byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      }
      // Parse approvals/declines from decision logs
      let approved = 0, declined = 0;
      for (const l of logs) {
        if (l.source === 'MoE Decision' && /^FINAL DECISION:/i.test(l.message)) {
          if (/approved/i.test(l.message)) approved++;
          if (/declined|rejected/i.test(l.message)) declined++;
        }
      }
      res.json({ byType, byStatus, approvals: approved, declines: declined, total: requests.length });
    } catch (e) {
      res.status(500).json({ error: 'Failed to compute analytics' });
    }
  });

  // Agent Registry APIs
  app.get('/api/agents', async (_req, res) => {
    try {
      const registry = await storage.getAgentRegistry();
      res.json(registry);
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch agent registry' });
    }
  });

  app.post('/api/agents/register', async (req, res) => {
    try {
      const payload = req.body || {};
      const entry = await storage.registerAgent({
        id: String(payload.id || payload.name || `agent-${Date.now()}`),
        name: String(payload.name || 'Unnamed Agent'),
        capabilities: Array.isArray(payload.capabilities) ? payload.capabilities : [],
        type: payload.type ? String(payload.type) : undefined,
        model: payload.model ? String(payload.model) : undefined,
        routingHints: Array.isArray(payload.routingHints) ? payload.routingHints.map(String) : undefined,
        lastSeen: Date.now(),
        health: 'healthy',
      });
      // Ensure runtime instance exists and publish initial metrics for this agent
      await realMoESystem.ensureInstanceForAgent(entry.id, entry.type);
      const registry = await storage.getAgentRegistry();
      broadcastUpdate('registry_updated', registry);
      res.json(entry);
    } catch (e) {
      res.status(500).json({ error: 'Failed to register agent' });
    }
  });

  app.post('/api/agents/heartbeat', async (req, res) => {
    try {
      const { id, capabilities, type, model, routingHints } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id is required' });
      const updated = await storage.heartbeatAgent(String(id), { 
        capabilities, 
        type: type ? String(type) : undefined, 
        model: model ? String(model) : undefined, 
        routingHints: Array.isArray(routingHints) ? routingHints.map(String) : undefined,
      });
      if (!updated) return res.status(404).json({ error: 'Agent not found' });
      // Redis presence heartbeat (TTL configurable)
      const ttlSec = Number.parseInt(process.env.REGISTRY_TTL_SEC || '30', 10);
      await presence.heartbeat({ id: String(id), capabilities, type: type ? String(type) : undefined, model: model ? String(model) : undefined, routingHints: Array.isArray(routingHints) ? routingHints.map(String) : undefined }, ttlSec);
      const registry = await storage.getAgentRegistry();
      broadcastUpdate('registry_updated', registry);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: 'Failed to heartbeat agent' });
    }
  });

  // Manual trigger to run one MoE processing cycle (no background spam)
  app.post("/api/run-moe", async (req, res) => {
    try {
      const payload = (req.body || {}) as Partial<{
        type: string;
        priority: "low" | "medium" | "high";
      }>;

      const requestTypes = [
        'Loan Application - Personal',
        'Insurance Claim - Auto',
        'ESG Investment Report',
        'Credit Card Application',
        'Mortgage Pre-approval',
        'Fraud Alert Investigation',
        'Corporate ESG Assessment',
        'Small Business Loan'
      ];
      const priorities = ['low', 'medium', 'high'] as const;

      const requestId = `REQ-${Date.now()}`;
      const newRequest = {
        id: requestId,
        type: payload.type || requestTypes[Math.floor(Math.random() * requestTypes.length)],
        priority: (payload.priority as typeof priorities[number]) || priorities[Math.floor(Math.random() * priorities.length)],
        status: 'pending' as const,
        timestamp: new Date().toISOString(),
        assignedAgents: [],
      };

      await realMoESystem.handleNewRequest(newRequest);
      res.json({ status: 'queued', request: newRequest });
    } catch (error: any) {
      console.error('Manual MoE trigger error:', error);
      const status = error?.status === 429 ? 429 : 500;
      res.status(status).json({ status: 'error', message: error?.message || 'Failed to run MoE process' });
    }
  });

  app.get("/api/router-metrics", async (_req, res) => {
    try {
      const metrics = await storage.getRouterMetrics();
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch router metrics" });
    }
  });

  app.get("/api/system-metrics", async (req, res) => {
    try {
      const metrics = await storage.getSystemMetrics();
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch system metrics" });
    }
  });

  app.get("/api/system-logs", async (req, res) => {
    try {
      const logs = await storage.getSystemLogs();
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch system logs" });
    }
  });

  // Router runtime configuration (dashboard toggle: LLM vs MLP vs Rules)
  app.get("/api/router-config", async (_req, res) => {
    try {
      const cfg = await storage.getRouterConfig();
      res.json(cfg);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch router config" });
    }
  });

  app.post("/api/router-config", async (req, res) => {
    try {
      const engine = String((req.body?.engine ?? '')).toLowerCase();
      if (!['llm', 'ml', 'rules', 'hybrid'].includes(engine)) {
        res.status(400).json({ error: 'Invalid engine. Use one of: llm, ml, rules, hybrid' });
        return;
      }

      // Determine readiness and version by engine
      let modelLoaded = false;
      let modelVersion: string | undefined = undefined;

      if (engine === 'llm') {
        try {
          const ok = await aiService.testConnection();
          modelLoaded = !!ok;
          modelVersion = ROUTER_MODEL;
        } catch {
          modelLoaded = false;
          modelVersion = ROUTER_MODEL;
        }
      } else if (engine === 'ml') {
        // Reflect local MLP readiness; if ONNX loaded, MLPRouterStrategy updates storage.modelLoaded/modelVersion
        const current = await storage.getRouterConfig().catch(() => null as any);
        modelLoaded = !!current?.modelLoaded;
        modelVersion = current?.modelVersion || 'mlp-local';
      } else if (engine === 'rules') {
        modelLoaded = true; // rules engine is always ready
        modelVersion = 'rules-1.0';
      } else if (engine === 'hybrid') {
        // Hybrid considered ready if either LLM connectivity works or local MLP is available
        let llmOk = false;
        try { llmOk = await aiService.testConnection(); } catch {}
        const current = await storage.getRouterConfig().catch(() => null as any);
        const mlOk = !!current?.modelLoaded;
        modelLoaded = llmOk || mlOk;
        modelVersion = `${ROUTER_MODEL}+${current?.modelVersion || 'mlp'}`;
      }

      const updated = await storage.setRouterConfig({ engine: engine as any, modelLoaded, modelVersion });

      // Ensure runtime router reads the new engine immediately
      process.env.ROUTER_ENGINE = engine.toUpperCase();

      // Broadcast to all clients so the UI can update immediately
      broadcastUpdate('router_config_updated', updated);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update router config" });
    }
  });

  // Models endpoint to expose actual router/agent model labels
  app.get("/api/models", async (req, res) => {
    try {
      const cfg = await storage.getRouterConfig();
      let routerModel = ROUTER_MODEL;
      const engine = String(cfg?.engine || "llm").toLowerCase();
      if (engine === 'ml') {
        routerModel = cfg?.modelVersion || 'mlp-local';
      } else if (engine === 'rules') {
        routerModel = 'rules-engine';
      } else if (engine === 'hybrid') {
        routerModel = `${ROUTER_MODEL}+mlp`;
      }
      res.json({
        routerModel,
        agents: {
          credit: AGENT_MODELS.credit,
          fraud: AGENT_MODELS.fraud,
          esg: AGENT_MODELS.esg,
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch model labels" });
    }
  });

  app.get("/api/requests", async (req, res) => {
    try {
      const requests = await storage.getRequests();
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch requests" });
    }
  });

  // Generate a request on-demand for E2E testing
  app.post('/api/requests/generate', async (req, res) => {
    try {
      const body = req.body || {};
      const type = String(body.type || 'Loan Application - Personal');
      const priority = (['low', 'medium', 'high'] as const).includes(body.priority) ? body.priority : 'medium';
      const requestId = `REQ-${Date.now()}`;
      const newRequest = {
        id: requestId,
        type,
        priority,
        status: 'pending' as const,
        timestamp: new Date().toISOString(),
        assignedAgents: [],
      };
      await realMoESystem.handleNewRequest(newRequest);
      res.json({ ok: true, id: requestId, type, priority });
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate request' });
    }
  });

  // Test Groq integration
  app.get("/api/test-groq", async (req, res) => {
    try {
      console.log("Testing Vertex AI connection...");
      const isConnected = await aiService.testConnection();
      
      if (isConnected) {
        res.json({ 
          status: "success", 
          message: "Vertex AI connection successful!",
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({ 
          status: "error", 
          message: "Vertex AI connection failed" 
        });
      }
    } catch (error) {
      console.error("Vertex test error:", error);
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ 
        status: "error", 
        message: msg 
      });
    }
  });

  // Health check endpoint for Railway + router status
  app.get("/health", async (req, res) => {
    try {
      const cfg = await storage.getRouterConfig();
      res.json({ status: "ok", timestamp: new Date().toISOString(), router: cfg });
    } catch (e) {
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    }
  });

  // Test credit analysis with real Groq
  app.post("/api/test-credit-analysis", async (req, res) => {
    try {
      const sampleApplication = {
        applicant_name: "John Doe",
        annual_income: 75000,
        credit_history_length: 8,
        existing_debt: 15000,
        employment_status: "Full-time",
        loan_amount: 25000,
        loan_purpose: "Home improvement"
      };

      console.log("Running credit analysis with Vertex AI...");
      const result = await aiService.analyzeCreditApplication(sampleApplication);
      
      res.json({
        status: "success",
        result,
        sampleData: sampleApplication
      });
    } catch (error) {
      console.error("Credit analysis test error:", error);
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ 
        status: "error", 
        message: msg 
      });
    }
  });

  // Orchestrator (Start/Stop/Status) for MOE Cloud Run services
  // Security: simple API key header. Set ORCH_API_KEY in environment.
  function requireApiKey(req: any, res: any, next: any) {
    const key = process.env.ORCH_API_KEY;
    if (!key) return next(); // if not set, allow (dev)
    const provided = req.headers['x-api-key'] || req.headers['x-orchestrator-key'];
    if (provided && String(provided) === String(key)) return next();
    res.status(401).json({ error: 'Unauthorized' });
  }

  // Config from env
  const ORCH_PROJECT_ID = process.env.ORCH_PROJECT_ID || process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '';
  const ORCH_LOCATION = process.env.ORCH_LOCATION || process.env.GCP_LOCATION || 'us-central1';
  const ORCH_SERVICES = (process.env.ORCH_SERVICES || 'moe-app,credit-agent')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ORCH_DASHBOARD_URL = process.env.ORCH_DASHBOARD_URL || '';

  async function listRunRefs() {
    const projectId = ORCH_PROJECT_ID;
    const location = ORCH_LOCATION;
    return ORCH_SERVICES.map((name) => ({ projectId, location, name }));
  }

  app.post('/api/orchestrator/start', requireApiKey, async (_req, res) => {
    try {
      if (!ORCH_PROJECT_ID) return res.status(500).json({ error: 'ORCH_PROJECT_ID not set' });
      const { RunAdminV2 } = await import('./gcp/runAdminV2');
      const refs = await listRunRefs();
      for (const ref of refs) {
        await RunAdminV2.setMinInstances(ref, 1);
      }
      // Best-effort: fetch primary service URI for redirect
      let dashboardUrl = ORCH_DASHBOARD_URL;
      if (!dashboardUrl) {
        try {
          const primary = refs.find(r => r.name === 'moe-app') || refs[0];
          const info = await RunAdminV2.getService(primary);
          if (info?.uri) dashboardUrl = `${info.uri}`;
        } catch {}
      }
      res.json({ ok: true, services: ORCH_SERVICES, dashboardUrl });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to start MOE' });
    }
  });

  app.post('/api/orchestrator/stop', requireApiKey, async (_req, res) => {
    try {
      if (!ORCH_PROJECT_ID) return res.status(500).json({ error: 'ORCH_PROJECT_ID not set' });
      const { RunAdminV2 } = await import('./gcp/runAdminV2');
      const refs = await listRunRefs();
      for (const ref of refs) {
        await RunAdminV2.setMinInstances(ref, 0);
      }
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to stop MOE' });
    }
  });

  app.get('/api/orchestrator/status', requireApiKey, async (_req, res) => {
    try {
      if (!ORCH_PROJECT_ID) return res.status(500).json({ error: 'ORCH_PROJECT_ID not set' });
      const { RunAdminV2 } = await import('./gcp/runAdminV2');
      const refs = await listRunRefs();
      const primary = refs.find(r => r.name === 'moe-app') || refs[0];
      const info = await RunAdminV2.getService(primary);

      // Attempt a /health probe if we have a URI (unauthenticated or requires ID token)
      let healthy = false;
      let dashboardUrl = info?.uri;
      if (dashboardUrl) {
        try {
          const healthUrl = `${dashboardUrl.replace(/\/$/, '')}/health`;
          const resp = await fetch(healthUrl, { method: 'GET' });
          healthy = resp.ok;
        } catch {
          // If the service is authenticated, skip health probe silently
          healthy = false;
        }
      }

      const ready = healthy || (info?.minInstanceCount ?? 0) > 0;
      res.json({ ready, dashboardUrl, minInstanceCount: info?.minInstanceCount ?? 0 });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to get status' });
    }
  });

  // Detailed resources inventory
  app.get('/api/orchestrator/resources', requireApiKey, async (req, res) => {
    try {
      if (!ORCH_PROJECT_ID) return res.status(500).json({ error: 'ORCH_PROJECT_ID not set' });
      const regions = (process.env.ORCH_REGIONS || ORCH_LOCATION || 'us-central1').split(',').map(s=>s.trim()).filter(Boolean);
      const { fetchInventory } = await import('./gcp/gcpInventory');
      const inv = await fetchInventory({ projectId: ORCH_PROJECT_ID, regions });
      res.json(inv);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to get resources' });
    }
  });

  // Cost breakdown via BigQuery billing export
  app.get('/api/orchestrator/cost', requireApiKey, async (req, res) => {
    try {
      if (!ORCH_PROJECT_ID) return res.status(500).json({ error: 'ORCH_PROJECT_ID not set' });
      const BILLING_PROJECT_ID = process.env.BILLING_PROJECT_ID || process.env.BILLING_EXPORT_PROJECT_ID;
      const BILLING_DATASET = process.env.BILLING_DATASET || process.env.BILLING_EXPORT_DATASET;
      const BILLING_TABLE = process.env.BILLING_TABLE || process.env.BILLING_EXPORT_TABLE;
      if (!BILLING_PROJECT_ID || !BILLING_DATASET || !BILLING_TABLE) {
        return res.status(200).json({ configured: false, message: 'Billing export not configured', rows: [] });
      }
      const gran = (String(req.query.granularity || 'all').toLowerCase() as any);
      const start = req.query.start ? String(req.query.start) : undefined;
      const end = req.query.end ? String(req.query.end) : undefined;
      const { fetchCosts } = await import('./gcp/billing');
      const out = await fetchCosts({
        billingProjectId: BILLING_PROJECT_ID,
        dataset: BILLING_DATASET,
        table: BILLING_TABLE,
        projectIdFilter: ORCH_PROJECT_ID,
        granularity: gran,
        start,
        end,
      });
      res.json({ configured: true, ...out });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to get cost data' });
    }
  });

  // WebSocket Server for real-time updates
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  const connectedClients = new Set<WebSocket>();

  // Initialize Real MoE System
  function broadcastUpdate(type: string, data: any) {
    const message = JSON.stringify({ type, data });
    connectedClients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  const realMoESystem = new RealMoESystem(broadcastUpdate);
  await realMoESystem.init();

  // Keep agent registry healthy and reconciled with expert agents
  const reconcileAndHeartbeatAgents = async () => {
    try {
      // Ensure default expert agents exist in registry
      const [experts, registry] = await Promise.all([
        storage.getExpertAgents(),
        storage.getAgentRegistry(),
      ]);

      const registeredIds = new Set(registry.map(r => r.id));
      for (const a of experts) {
        if (!registeredIds.has(a.id)) {
          await storage.registerAgent({
            id: a.id,
            name: a.name,
            capabilities: [a.type],
            type: a.type,
            model: a.model,
            lastSeen: Date.now(),
            health: 'healthy',
          });
        }
      }

      // Ensure all registry agents have runtime instances and initial metrics
      await realMoESystem.syncInstancesWithRegistry(registry);

      // Heartbeat all agents to keep them healthy in demos and update Redis presence
      const updated = [] as any[];
      const nowRegistry = await storage.getAgentRegistry();
      for (const r of nowRegistry) {
        const u = await storage.heartbeatAgent(r.id);
        if (u) updated.push(u);
        const ttlSec = Number.parseInt(process.env.REGISTRY_TTL_SEC || '30', 10);
        await presence.heartbeat({ id: r.id, type: r.type, capabilities: r.capabilities, model: r.model, routingHints: r.routingHints }, ttlSec);
      }

      // Broadcast only if there are entries
      if (updated.length > 0) {
        const latest = await storage.getAgentRegistry();
        broadcastUpdate('registry_updated', latest);
      }
    } catch (e) {
      console.error('Agent heartbeat loop error:', e);
    }
  };

  wss.on('connection', (ws: WebSocket) => {
    connectedClients.add(ws);
    
    // Send initial data
    sendInitialData(ws);

    ws.on('close', () => {
      connectedClients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      connectedClients.delete(ws);
    });
  });

  async function sendInitialData(ws: WebSocket) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        const [agents, routerMetrics, systemMetrics, logs, requests, routerConfig, registry] = await Promise.all([
          storage.getExpertAgents(),
          storage.getRouterMetrics(),
          storage.getSystemMetrics(),
          storage.getSystemLogs(),
          storage.getRequests(),
          storage.getRouterConfig(),
          storage.getAgentRegistry(),
        ]);

        // Normalize agent model labels from single source of truth
        const normalizedAgents = agents.map(a => ({
          ...a,
          model: AGENT_MODELS[(a.type as 'credit' | 'fraud' | 'esg')] || a.model,
        }));

        ws.send(JSON.stringify({
          type: 'initial_data',
          data: {
            expertAgents: normalizedAgents,
            routerMetrics,
            systemMetrics,
            systemLogs: logs,
            requests,
            routerConfig,
            registry,
            models: {
              routerModel: ROUTER_MODEL,
              agents: AGENT_MODELS,
            }
          }
        }));
      } catch (error) {
        console.error('Failed to send initial data:', error);
      }
    }
  }

  // Real MoE processing - generates requests and processes them with real AI
  async function generateRealMoERequests() {
    try {
      // Generate realistic request types for BFSI
      const requestTypes = [
        'Loan Application - Personal',
        'Insurance Claim - Auto',
        'ESG Investment Report',
        'Credit Card Application',
        'Mortgage Pre-approval',
        'Fraud Alert Investigation',
        'Corporate ESG Assessment',
        'Small Business Loan'
      ];
      
      const priorities = ['low', 'medium', 'high'] as const;
      
      const requestId = `REQ-${Date.now()}`;
      const newRequest = {
        id: requestId,
        type: requestTypes[Math.floor(Math.random() * requestTypes.length)],
        priority: priorities[Math.floor(Math.random() * priorities.length)],
        status: 'pending' as const,
        timestamp: new Date().toISOString(),
        assignedAgents: [],
      };

      console.log(`🚀 Processing real request: ${newRequest.type} (${requestId})`);
      
      // Process with real MoE system
      await realMoESystem.handleNewRequest(newRequest);
      
    } catch (error) {
      console.error('Error in real MoE processing:', error);
      const msg = error instanceof Error ? error.message : String(error);
      
      // Add error log
      const errorLog = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        level: 'error' as const,
        message: `MoE processing error: ${msg}`,
        source: 'MoE System',
      };
      await storage.addSystemLog(errorLog);
      broadcastUpdate('new_log', errorLog);
    }
  }

  // Update router metrics periodically
  async function updateRouterMetrics() {
    try {
      const currentMetrics = await storage.getRouterMetrics();
      const updates = {
        cpuUsage: Math.max(30, Math.min(90, currentMetrics.cpuUsage + (Math.random() - 0.5) * 10)),
        queueDepth: Math.max(0, Math.min(10, currentMetrics.queueDepth + Math.floor((Math.random() - 0.5) * 3))),
        tokensPerMinute: Math.max(1000, currentMetrics.tokensPerMinute + Math.floor((Math.random() - 0.5) * 500)),
        avgResponseTime: Math.max(1.0, Math.min(5.0, currentMetrics.avgResponseTime + (Math.random() - 0.5) * 0.5)),
      };

      const updatedMetrics = await storage.updateRouterMetrics(updates);
      broadcastUpdate('router_metrics_updated', updatedMetrics);
    } catch (error) {
      console.error('Error updating router metrics:', error);
    }
  }

  // Start real MoE processing
  const enableBackground = process.env.GROQ_ENABLE_BACKGROUND === '1';
  if (enableBackground) {
    console.log('🤖 Background MoE processing ENABLED with Groq Cloud integration...');
    setInterval(generateRealMoERequests, 60000 + Math.random() * 60000); // Every 60-120 seconds
    setInterval(updateRouterMetrics, 10000); // Every 10 seconds
  } else {
    console.log('🛑 Background MoE processing DISABLED (set GROQ_ENABLE_BACKGROUND=1 to enable).');
  }

  // Always keep registry healthy in dev/demo: run heartbeat reconciliation every 10s
  await reconcileAndHeartbeatAgents();
  setInterval(reconcileAndHeartbeatAgents, 10000);

  return httpServer;
}
