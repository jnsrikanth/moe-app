import fs from 'fs';
import path from 'path';
import { type ExpertAgent, type Request, type RouterMetrics, type SystemLog, type SystemMetrics } from '../shared/schema.js';
import { type IStorage, type RouterConfig, type AgentRegistryEntry, type DatasetMeta, type AgentHealth } from './storage.js';

interface Snapshot {
  expertAgents: ExpertAgent[];
  requests: Request[];
  routerMetrics: RouterMetrics;
  systemLogs: SystemLog[];
  systemMetrics: SystemMetrics;
  routerConfig: RouterConfig;
  agentRegistry: AgentRegistryEntry[];
  datasets: DatasetMeta[];
  version: number;
  savedAt: string;
}

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function nowIso() { return new Date().toISOString(); }

export class JsonFileStorage implements IStorage {
  private expertAgents: Map<string, ExpertAgent>;
  private requests: Map<string, Request>;
  private routerMetrics: RouterMetrics;
  private systemLogs: SystemLog[];
  private systemMetrics: SystemMetrics;
  private routerConfig: RouterConfig;
  private agentRegistry: Map<string, AgentRegistryEntry>;
  private datasets: Map<string, DatasetMeta>;

  private file: string;

  constructor(filePath?: string) {
    this.file = filePath || path.resolve(process.cwd(), 'data', 'moe-data.json');
    ensureDir(path.dirname(this.file));

    // Initialize empty maps/arrays
    this.expertAgents = new Map();
    this.requests = new Map();
    this.systemLogs = [];
    this.agentRegistry = new Map();
    this.datasets = new Map();
    this.routerMetrics = {
      contextSize: '128K tokens',
      responseThreshold: '5.0s',
      loadBalancing: true,
      routingAlgorithm: 'Weighted Round-Robin',
      cpuUsage: 0,
      memoryUsage: '0GB',
      tokensPerMinute: 0,
      queueDepth: 0,
      activeRequests: 0,
      avgResponseTime: 0,
    };
    this.systemMetrics = {
      throughput: 0,
      avgResponseTime: 0,
      successRate: 100,
      errorRate: 0,
      requestsPerMinute: 0,
    };
    this.routerConfig = {
      engine: (process.env.ROUTER_ENGINE as RouterConfig['engine']) || 'ml',
      modelLoaded: false,
    };

    // Try loading existing snapshot; otherwise seed defaults
    if (fs.existsSync(this.file)) {
      try {
        const raw = fs.readFileSync(this.file, 'utf8');
        const snap = JSON.parse(raw) as Snapshot;
        // Restore
        for (const a of snap.expertAgents || []) this.expertAgents.set(a.id, a);
        for (const r of snap.requests || []) this.requests.set(r.id, r);
        for (const e of snap.agentRegistry || []) this.agentRegistry.set(e.id, e);
        for (const d of snap.datasets || []) this.datasets.set(d.id, d);
        this.routerMetrics = snap.routerMetrics || this.routerMetrics;
        this.systemLogs = snap.systemLogs || [];
        this.systemMetrics = snap.systemMetrics || this.systemMetrics;
        this.routerConfig = snap.routerConfig || this.routerConfig;

        // Optional one-time correction of model labels if UI_MODEL_LABEL is provided
        const desired = (process.env.UI_MODEL_LABEL || '').trim();
        if (desired) {
          let changed = false;
          for (const [id, agent] of this.expertAgents) {
            if (agent.model && agent.model !== desired) {
              // Update only if previous label was the old hardcoded default
              if (agent.model.includes('Gemini') || agent.model.toLowerCase().includes('flash')) {
                agent.model = desired; changed = true;
              }
            }
          }
          for (const [id, entry] of this.agentRegistry) {
            if (entry.model && entry.model !== desired) {
              if (entry.model.includes('Gemini') || entry.model.toLowerCase().includes('flash')) {
                entry.model = desired; changed = true;
              }
            }
          }
          if (changed) this.save();
        }
      } catch (e) {
        // If corrupted, re-seed defaults and overwrite on first save
        this.seedDefaults();
        this.save();
      }
    } else {
      this.seedDefaults();
      this.save();
    }
  }

  private seedDefaults() {
    const defaultModelLabel = ((): string => {
      const explicit = (process.env.UI_MODEL_LABEL || process.env.LOCAL_ML_LABEL || '').trim();
      if (explicit) return explicit;
      const id = (process.env.VERTEX_AI_MODEL || '').trim();
      if (id) return id;
      return 'mlp-local';
    })();

    const defaultAgents: ExpertAgent[] = [
      {
        id: 'credit-agent',
        name: 'Credit Check Agent',
        type: 'credit',
        status: 'idle',
        model: defaultModelLabel,
        parameters: '',
        cpuUsage: 15,
        memoryUsage: '2.8GB',
        tokensPerMinute: 890,
        queueLength: 0,
        instanceCount: 1,
        loadThreshold: 70,
        responseTime: 1.2,
        isScaling: false,
      },
      {
        id: 'fraud-agent',
        name: 'Fraud Detection Agent',
        type: 'fraud',
        status: 'idle',
        model: defaultModelLabel,
        parameters: '',
        cpuUsage: 12,
        memoryUsage: '2.1GB',
        tokensPerMinute: 670,
        queueLength: 0,
        instanceCount: 1,
        loadThreshold: 80,
        responseTime: 1.8,
        isScaling: false,
      },
      {
        id: 'esg-agent',
        name: 'ESG Analysis Agent',
        type: 'esg',
        status: 'idle',
        model: defaultModelLabel,
        parameters: '',
        cpuUsage: 10,
        memoryUsage: '2.3GB',
        tokensPerMinute: 540,
        queueLength: 0,
        instanceCount: 1,
        loadThreshold: 60,
        responseTime: 2.1,
        isScaling: false,
      },
    ];

    const now = Date.now();
    for (const a of defaultAgents) {
      this.expertAgents.set(a.id, a);
      this.agentRegistry.set(a.id, {
        id: a.id,
        name: a.name,
        capabilities: [a.type],
        type: a.type,
        model: a.model,
        lastSeen: now,
        health: 'healthy',
      });
    }
  }

  private save() {
    const snap: Snapshot = {
      expertAgents: Array.from(this.expertAgents.values()),
      requests: Array.from(this.requests.values()),
      routerMetrics: this.routerMetrics,
      systemLogs: this.systemLogs,
      systemMetrics: this.systemMetrics,
      routerConfig: this.routerConfig,
      agentRegistry: Array.from(this.agentRegistry.values()),
      datasets: Array.from(this.datasets.values()),
      version: 1,
      savedAt: nowIso(),
    };
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(snap, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }

  async getExpertAgents(): Promise<ExpertAgent[]> {
    return Array.from(this.expertAgents.values());
  }

  async updateExpertAgent(id: string, updates: Partial<ExpertAgent>): Promise<ExpertAgent> {
    let agent = this.expertAgents.get(id);
    if (!agent) {
      const reg = this.agentRegistry.get(id);
      const type = reg?.type || (id.split('-')[0] || 'generic');
      agent = {
        id,
        name: reg?.name || id,
        type,
        status: 'idle',
        model: reg?.model || '',
        parameters: '',
        cpuUsage: 0,
        memoryUsage: '0GB',
        tokensPerMinute: 0,
        queueLength: 0,
        instanceCount: 1,
        loadThreshold: 70,
        responseTime: 0,
        isScaling: false,
      } as ExpertAgent;
    }
    const merged = { ...agent, ...updates } as ExpertAgent;
    this.expertAgents.set(id, merged);
    this.save();
    return merged;
  }

  async getRequests(): Promise<Request[]> {
    return Array.from(this.requests.values());
  }

  async addRequest(request: Request): Promise<Request> {
    this.requests.set(request.id, request);
    this.save();
    return request;
  }

  async updateRequest(id: string, updates: Partial<Request>): Promise<Request> {
    const existing = this.requests.get(id);
    if (!existing) throw new Error(`Request ${id} not found`);
    const merged = { ...existing, ...updates } as Request;
    this.requests.set(id, merged);
    this.save();
    return merged;
  }

  async getRouterMetrics(): Promise<RouterMetrics> {
    return this.routerMetrics;
  }

  async updateRouterMetrics(updates: Partial<RouterMetrics>): Promise<RouterMetrics> {
    this.routerMetrics = { ...this.routerMetrics, ...updates };
    this.save();
    return this.routerMetrics;
  }

  async getSystemLogs(): Promise<SystemLog[]> {
    return this.systemLogs;
  }

  async addSystemLog(log: SystemLog): Promise<SystemLog> {
    this.systemLogs.push(log);
    if (this.systemLogs.length > 1000) this.systemLogs.shift();
    this.save();
    return log;
  }

  async getSystemMetrics(): Promise<SystemMetrics> {
    return this.systemMetrics;
  }

  async updateSystemMetrics(updates: Partial<SystemMetrics>): Promise<SystemMetrics> {
    this.systemMetrics = { ...this.systemMetrics, ...updates };
    this.save();
    return this.systemMetrics;
  }

  async getRouterConfig(): Promise<RouterConfig> {
    const envEngine = (process.env.ROUTER_ENGINE as RouterConfig['engine']) || this.routerConfig.engine;
    return { ...this.routerConfig, engine: envEngine };
  }

  async setRouterConfig(updates: Partial<RouterConfig>): Promise<RouterConfig> {
    this.routerConfig = { ...this.routerConfig, ...updates };
    if (updates.engine) process.env.ROUTER_ENGINE = updates.engine;
    this.save();
    return this.routerConfig;
  }

  async registerAgent(agent: AgentRegistryEntry): Promise<AgentRegistryEntry> {
    const now = Date.now();
    const entry: AgentRegistryEntry = {
      id: agent.id,
      name: agent.name,
      capabilities: agent.capabilities || [],
      type: agent.type,
      model: agent.model,
      routingHints: agent.routingHints,
      lastSeen: now,
      health: 'healthy',
    };
    this.agentRegistry.set(entry.id, entry);
    this.save();
    return entry;
  }

  async heartbeatAgent(id: string, meta?: Partial<AgentRegistryEntry>): Promise<AgentRegistryEntry | null> {
    const existing = this.agentRegistry.get(id);
    if (!existing) return null;
    const now = Date.now();
    const updated: AgentRegistryEntry = { ...existing, ...meta, lastSeen: now, health: 'healthy' };
    this.agentRegistry.set(id, updated);
    this.save();
    return updated;
  }

  async getAgentRegistry(): Promise<AgentRegistryEntry[]> {
    const now = Date.now();
    const entries = Array.from(this.agentRegistry.values()).map(e => {
      const healthy = now - e.lastSeen < 30000;
      return { ...e, health: healthy ? 'healthy' : 'unhealthy' as AgentHealth };
    });
    for (const e of entries) this.agentRegistry.set(e.id, e);
    this.save();
    return entries;
  }

  async removeAgent(id: string): Promise<boolean> {
    const ok = this.agentRegistry.delete(id);
    this.save();
    return ok;
  }

  async listDatasets(): Promise<DatasetMeta[]> {
    return Array.from(this.datasets.values());
  }

  async registerDataset(meta: Omit<DatasetMeta, 'id' | 'createdAt'> & { id?: string }): Promise<DatasetMeta> {
    const id = meta.id || `ds_${Date.now()}`;
    const entry: DatasetMeta = {
      id,
      name: meta.name,
      source: meta.source,
      url: meta.url,
      records: meta.records,
      sizeBytes: meta.sizeBytes,
      createdAt: nowIso(),
    };
    this.datasets.set(id, entry);
    this.save();
    return entry;
  }

  async removeDataset(id: string): Promise<boolean> {
    const ok = this.datasets.delete(id);
    this.save();
    return ok;
  }
}
